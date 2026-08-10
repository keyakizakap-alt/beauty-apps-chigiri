import type { Product } from "@/schemas/product";
import type { Profile } from "@/schemas/profile";
import type {
  Merchant,
  OfferValidation,
  ProductOffer,
  UnverifiedField,
} from "@/schemas/commerce";
import { PRODUCTS, getProduct } from "@/domain/recommendation/catalog";
import { applyHardFilters } from "@/domain/recommendation/filters";
import { scoreProduct, sortScored } from "@/domain/recommendation/scorer";
import type {
  CommerceAdapter,
  HandoffInput,
  HandoffResult,
  ProductSearchInput,
  SearchedOffer,
} from "./adapter";
import { getMerchant, merchantForHost } from "./merchants";
import { checkExternalUrl } from "./url-allowlist";
import { issueHandoffToken } from "@/server/handoff-token";

/**
 * 静的カタログを裏に持つ CommerceAdapter 実装。
 *
 * MVP の方針:
 * - 在庫・送料・配送日を「推測しない」。カタログと販売者レジストリで
 *   確認できていない項目は null のまま返し、unverified に項目名を残す。
 * - offerId は「商品 ID + 販売者 ID」から決定論的に作る。
 *   クライアントが offerId を細工しても、価格・URL はサーバー側のカタログから
 *   引き直すため、任意の遷移先を差し込むことはできない。
 */

const OFFER_PREFIX = "off";
const SEPARATOR = "__";

export function makeOfferId(productId: string, merchantId: string): string {
  return `${OFFER_PREFIX}${SEPARATOR}${productId}${SEPARATOR}${merchantId}`;
}

export function parseOfferId(
  offerId: string,
): { productId: string; merchantId: string } | null {
  const parts = offerId.split(SEPARATOR);
  if (parts.length !== 3 || parts[0] !== OFFER_PREFIX) return null;
  const [, productId, merchantId] = parts;
  if (!productId || !merchantId) return null;
  return { productId, merchantId };
}

/** 商品の公式 URL から、その商品を扱う販売者を決める */
function merchantForProduct(product: Product): Merchant | null {
  const check = checkExternalUrl(product.officialUrl);
  return check.ok ? check.merchant : null;
}

export function buildOffer(product: Product, now = new Date()): ProductOffer | null {
  const merchant = merchantForProduct(product);
  if (!merchant) return null;

  const unverified: UnverifiedField[] = [];
  // 価格はカタログ由来。公式ページと突合できていない場合は未確認として扱う。
  if (product.sourceCheckedAt === null) unverified.push("price");
  if (merchant.shippingFeeYen === null) unverified.push("shippingFee");
  // 在庫 API を持たないため、常に unknown。ここを in_stock と書かないことが重要。
  unverified.push("availability");
  if (merchant.returnPolicyUrl === null) unverified.push("returnPolicy");

  return {
    offerId: makeOfferId(product.id, merchant.id),
    productId: product.id,
    merchantId: merchant.id,
    merchantName: merchant.name,
    price: product.price,
    shippingFee: merchant.shippingFeeYen,
    currency: "JPY",
    availability: "unknown",
    productUrl: product.officialUrl,
    checkedAt: now.toISOString(),
    priceSourceCheckedAt: product.sourceCheckedAt,
    officialSeller: merchant.kind === "brand_official",
    returnPolicyUrl: merchant.returnPolicyUrl,
    affiliate: merchant.affiliate,
    unverified,
    totalYen:
      merchant.shippingFeeYen === null
        ? null
        : product.price + merchant.shippingFeeYen,
  };
}

/** 予算判定に使う金額。送料が確認できている場合のみ送料込みで見る。 */
export function chargeableYen(offer: ProductOffer): number {
  return offer.totalYen ?? offer.price;
}

export class StaticCatalogAdapter implements CommerceAdapter {
  readonly id = "static-catalog";

  async searchProducts(input: ProductSearchInput): Promise<SearchedOffer[]> {
    const { category, profile, maxYen, excludeProductIds, limit } = input;
    const exclude = new Set(excludeProductIds);

    const pool = PRODUCTS.filter(
      (p) => p.category === category && !exclude.has(p.id),
    );

    // ハードフィルタ（アレルギー・避けたい使用感）はここでも必ず通す。
    // 候補比較の段階で除外条件を破った商品を見せないため。
    const { passed } = applyHardFilters(pool, profile);

    const owned = new Set(profile.ownedProductIds);
    const scored = sortScored(
      passed.map((p) => scoreProduct(p, profile, owned)),
    );

    const out: SearchedOffer[] = [];
    for (const s of scored) {
      const offer = buildOffer(s.product);
      if (!offer) continue;
      if (chargeableYen(offer) > maxYen) continue;
      out.push({ offer, product: s.product, score: s.score });
      if (out.length >= limit) break;
    }
    return out;
  }

  async getOffer(offerId: string): Promise<ProductOffer | null> {
    const parsed = parseOfferId(offerId);
    if (!parsed) return null;

    const product = getProduct(parsed.productId);
    if (!product) return null;

    // offerId に書かれた販売者が、その商品の公式 URL の販売者と一致するか。
    // 一致しない組み合わせは受け付けない（別商品の URL への差し替え防止）。
    const merchant = merchantForProduct(product);
    if (!merchant || merchant.id !== parsed.merchantId) return null;
    if (!getMerchant(parsed.merchantId)) return null;

    return buildOffer(product);
  }

  async validateOffer(
    offerId: string,
    profile: Profile,
  ): Promise<OfferValidation> {
    const revalidatedAt = new Date().toISOString();
    const offer = await this.getOffer(offerId);

    if (!offer) {
      return {
        offerId,
        valid: false,
        offer: null,
        blockers: ["unknown_offer"],
        warnings: [],
        revalidatedAt,
      };
    }

    const product = getProduct(offer.productId);
    if (!product) {
      return {
        offerId,
        valid: false,
        offer,
        blockers: ["unknown_offer"],
        warnings: [],
        revalidatedAt,
      };
    }

    const blockers: OfferValidation["blockers"] = [];
    const warnings: string[] = [];

    // 遷移先を承認直前にもう一度検証する（レジストリ変更への追随）
    const urlCheck = checkExternalUrl(offer.productUrl);
    if (!urlCheck.ok) blockers.push("url_not_allowed");

    if (offer.availability === "out_of_stock") blockers.push("out_of_stock");

    if (profile.ownedProductIds.includes(offer.productId)) {
      blockers.push("already_owned");
    }

    // 除外条件を承認直前にも適用する。
    // 比較のあとで避けたい成分を追加した場合に、古い候補を通さないため。
    const { excluded } = applyHardFilters([product], profile);
    if (excluded.length > 0) {
      blockers.push("hard_filter_violation");
      warnings.push(excluded[0].reason);
    }

    if (chargeableYen(offer) > profile.budgetYen) {
      blockers.push("over_budget");
    }

    if (offer.unverified.includes("availability")) {
      warnings.push(
        "在庫はこのアプリでは確認していません。販売ページで在庫と価格をご確認ください。",
      );
    }
    if (offer.unverified.includes("shippingFee")) {
      warnings.push(
        "送料が確認できていないため、送料込みの合計額は表示していません。販売ページでご確認ください。",
      );
    }
    if (offer.priceSourceCheckedAt === null) {
      warnings.push(
        "この価格は編集時点の参考価格で、公式ページとの突合が完了していません。実際の価格は販売ページの表示が優先されます。",
      );
    }

    return {
      offerId,
      valid: blockers.length === 0,
      offer,
      blockers,
      warnings,
      revalidatedAt,
    };
  }

  async createHandoff(input: HandoffInput): Promise<HandoffResult> {
    const validation = await this.validateOffer(input.offerId, input.profile);

    if (!validation.valid || !validation.offer) {
      return { ok: false, validation };
    }

    const offer = validation.offer;

    // ユーザーが承認画面で見ていた価格と、いま計算した価格がずれていないか。
    // ずれたまま遷移させると「承認した内容」と「実際に買う内容」が食い違う。
    if (input.acknowledgedPriceYen !== offer.price) {
      return {
        ok: false,
        validation: {
          ...validation,
          valid: false,
          blockers: [...validation.blockers, "price_changed"],
          warnings: [
            ...validation.warnings,
            `表示していた価格（${input.acknowledgedPriceYen.toLocaleString()}円）と最新の価格（${offer.price.toLocaleString()}円）が一致しません。内容を確認し直してください。`,
          ],
        },
      };
    }

    // 未確認項目がある場合、その了解なしには遷移させない。
    if (offer.unverified.length > 0 && !input.acknowledgedUnverified) {
      return {
        ok: false,
        validation: {
          ...validation,
          valid: false,
          warnings: [
            ...validation.warnings,
            "確認できていない項目があります。内容を確認したうえで承認してください。",
          ],
        },
      };
    }

    const urlCheck = checkExternalUrl(offer.productUrl);
    if (!urlCheck.ok) {
      return {
        ok: false,
        validation: {
          ...validation,
          valid: false,
          blockers: [...validation.blockers, "url_not_allowed"],
        },
      };
    }

    const { token, expiresAt } = issueHandoffToken({
      offerId: offer.offerId,
      productId: offer.productId,
      merchantId: offer.merchantId,
      url: offer.productUrl,
      priceYen: offer.price,
      shippingFeeYen: offer.shippingFee,
    });

    return {
      ok: true,
      validation,
      handoff: {
        token,
        handoffUrl: `/api/commerce/handoff/${encodeURIComponent(token)}`,
        merchantHost: urlCheck.url.hostname,
        merchantName: offer.merchantName,
        expiresAt: expiresAt.toISOString(),
        offer,
      },
    };
  }
}

export const commerceAdapter: CommerceAdapter = new StaticCatalogAdapter();

/** 販売者名の解決（UI 用） */
export function merchantNameForUrl(url: string): string | null {
  try {
    return merchantForHost(new URL(url).hostname)?.name ?? null;
  } catch {
    return null;
  }
}

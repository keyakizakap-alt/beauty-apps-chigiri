import catalogJson from "@/data/products.json";
import claimsJson from "@/data/allowed-claims.json";
import {
  AllowedClaimsFileSchema,
  CatalogSchema,
  type Category,
  type Domain,
  type Product,
} from "@/schemas/product";

/**
 * カタログはビルド時に同梱される静的 JSON。
 * 起動時に一度だけ Zod 検証し、以降はメモリ上のインデックスを使う。
 * 不正なカタログは黙って読み飛ばさず、例外にする。
 */
const catalog = CatalogSchema.parse(catalogJson);
const claimsFile = AllowedClaimsFileSchema.parse(claimsJson);

export const CATALOG_VERSION = catalog.catalogVersion;
export const PRODUCTS: readonly Product[] = Object.freeze(catalog.products);

const byId = new Map<string, Product>(PRODUCTS.map((p) => [p.id, p]));

if (byId.size !== PRODUCTS.length) {
  throw new Error("products.json に重複した id があります");
}

const CLAIM_TEXT = new Map(claimsFile.claims.map((c) => [c.id, c.text]));
const CLAIM_TYPE = new Map(claimsFile.claims.map((c) => [c.id, c.type]));

export const BANNED_PATTERNS: readonly string[] = claimsFile.bannedPatterns;

/** カタログに存在しない claim id を参照している商品は、データ不整合として弾く */
for (const p of PRODUCTS) {
  for (const c of p.allowedClaims) {
    if (!CLAIM_TEXT.has(c)) {
      throw new Error(`未知の allowedClaims: ${c} (product=${p.id})`);
    }
    if (CLAIM_TYPE.get(c) === "quasi_drug" && !p.isQuasiDrug) {
      throw new Error(
        `医薬部外品の表現 ${c} が化粧品扱いの商品に設定されています (product=${p.id})`,
      );
    }
  }
}

export function getProduct(id: string): Product | undefined {
  return byId.get(id);
}

/** カタログに存在する ID だけを返す。LLM 出力の検証にも使う。 */
export function isKnownProductId(id: string): boolean {
  return byId.has(id);
}

export function getProducts(ids: readonly string[]): Product[] {
  const out: Product[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (p) out.push(p);
  }
  return out;
}

export function claimText(claimId: string): string | undefined {
  return CLAIM_TEXT.get(claimId);
}

/** 商品の許可表現を日本語の一文にまとめる（薬機法ホワイトリスト内） */
export function claimSentence(p: Product): string {
  const texts = p.allowedClaims
    .map((c) => CLAIM_TEXT.get(c))
    .filter((t): t is string => Boolean(t));
  if (texts.length === 0) return "公式に確認できた表現がありません";
  return texts.join("／");
}

export { CATEGORY_LABEL } from "./domains";

/**
 * 利用者が自分で追加した手持ちを、商品と同じ形にそろえる。
 * 公式情報は持たないので、タグ・効能・出典はすべて空のままにする。
 * 推測で埋めると、確認していないことを確認したように見せてしまう。
 */
export function customItemToProduct(item: {
  id: string;
  domain: Domain;
  category: Category;
  brand: string;
  name: string;
  usageTiming: Array<"morning" | "night">;
}): Product {
  return {
    id: item.id,
    domain: item.domain,
    brand: item.brand,
    name: item.name,
    category: item.category,
    price: 0,
    skinTags: [],
    concernTags: [],
    textureTags: [],
    ingredientTags: [],
    cautionTags: [],
    allowedClaims: [],
    usageTiming: item.usageTiming,
    officialUrl: null,
    sourceCheckedAt: null,
    dataConfidence: "user",
    isQuasiDrug: false,
    origin: "other",
  };
}

/** 分野で絞り込んだ商品 */
export function productsInDomain(domain: Domain): Product[] {
  return PRODUCTS.filter((p) => p.domain === domain);
}

/**
 * カテゴリー別の中央価格。
 * 「買わずに済んだ推定金額」を、実在価格の分布から算出するために使う
 * （任意の定数を置くと説明できないため）。
 */
export const CATEGORY_MEDIAN_PRICE: Record<Category, number> = (() => {
  const out = {} as Record<Category, number>;
  const cats = [...new Set(PRODUCTS.map((p) => p.category))];
  for (const c of cats) {
    const prices = PRODUCTS.filter((p) => p.category === c)
      .map((p) => p.price)
      .sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    if (prices.length === 0) continue;
    out[c] =
      prices.length % 2 === 0
        ? Math.round((prices[mid - 1] + prices[mid]) / 2)
        : prices[mid];
  }
  return out;
})();

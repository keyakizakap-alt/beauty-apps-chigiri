import { beforeEach, describe, expect, it } from "vitest";
import {
  StaticCatalogAdapter,
  buildOffer,
  makeOfferId,
  parseOfferId,
} from "@/domain/commerce/static-adapter";
import { PRODUCTS, getProduct } from "@/domain/recommendation/catalog";
import { DEFAULT_PROFILE, type Profile } from "@/schemas/profile";
import { ProductOfferSchema } from "@/schemas/commerce";
import { __resetConsumedForTest } from "@/server/handoff-token";

const adapter = new StaticCatalogAdapter();

function profileWith(patch: Partial<Profile>): Profile {
  return { ...DEFAULT_PROFILE, ...patch };
}

const sunscreens = PRODUCTS.filter((p) => p.category === "sunscreen");

describe("CommerceAdapter（静的カタログ）", () => {
  beforeEach(() => __resetConsumedForTest());

  it("全商品のオファーがスキーマを満たす", () => {
    for (const p of PRODUCTS) {
      const offer = buildOffer(p);
      expect(offer, p.id).not.toBeNull();
      expect(() => ProductOfferSchema.parse(offer)).not.toThrow();
    }
  });

  it("在庫を推測せず unknown として返す", () => {
    for (const p of PRODUCTS) {
      const offer = buildOffer(p);
      expect(offer?.availability).toBe("unknown");
      expect(offer?.unverified).toContain("availability");
    }
  });

  it("送料が未確認なら合計額を出さない", () => {
    const offer = buildOffer(sunscreens[0]);
    expect(offer?.shippingFee).toBeNull();
    // 送料未確認を 0 円に丸めない
    expect(offer?.totalYen).toBeNull();
    expect(offer?.unverified).toContain("shippingFee");
  });

  it("offerId を往復できる", () => {
    const id = makeOfferId("sn-x", "kao-official");
    expect(parseOfferId(id)).toEqual({
      productId: "sn-x",
      merchantId: "kao-official",
    });
  });

  it("壊れた offerId は解決しない", async () => {
    for (const id of ["", "off", "off__x", "xx__a__b", "off__a__b__c"]) {
      expect(parseOfferId(id) === null || (await adapter.getOffer(id)) === null).toBe(
        true,
      );
    }
  });

  it("商品と販売者の組み合わせが食い違う offerId を拒否する", async () => {
    const kaoProduct = PRODUCTS.find((p) =>
      p.officialUrl.includes("www.kao.co.jp"),
    );
    expect(kaoProduct).toBeDefined();

    // 別の販売者 ID を差し込んだ offerId
    const forged = makeOfferId(kaoProduct!.id, "shiseido-official");
    expect(await adapter.getOffer(forged)).toBeNull();
  });

  it("予算内の候補だけを返す", async () => {
    const cheapest = Math.min(...sunscreens.map((p) => p.price));
    const found = await adapter.searchProducts({
      category: "sunscreen",
      profile: profileWith({ budgetYen: cheapest }),
      maxYen: cheapest,
      excludeProductIds: [],
      limit: 3,
    });
    for (const f of found) {
      expect(f.offer.price).toBeLessThanOrEqual(cheapest);
    }
  });

  it("避けたい成分を含む商品を候補に出さない", async () => {
    const found = await adapter.searchProducts({
      category: "sunscreen",
      profile: profileWith({
        avoidIngredients: ["chemical_uv"],
        budgetYen: 100000,
      }),
      maxYen: 100000,
      excludeProductIds: [],
      limit: 3,
    });
    expect(found.length).toBeGreaterThan(0);
    for (const f of found) {
      expect(f.product.ingredientTags).not.toContain("chemical_uv");
    }
  });

  it("手持ち商品を候補から除外する", async () => {
    const owned = sunscreens[0].id;
    const found = await adapter.searchProducts({
      category: "sunscreen",
      profile: profileWith({ budgetYen: 100000, ownedProductIds: [owned] }),
      maxYen: 100000,
      excludeProductIds: [owned],
      limit: 3,
    });
    expect(found.map((f) => f.product.id)).not.toContain(owned);
  });
});

describe("承認前の再検証", () => {
  beforeEach(() => __resetConsumedForTest());

  const target = sunscreens.reduce((a, b) => (a.price <= b.price ? a : b));
  const offerId = makeOfferId(target.id, "kao-official");

  async function offerIdFor(productId: string): Promise<string> {
    const p = getProduct(productId)!;
    const offer = buildOffer(p)!;
    return offer.offerId;
  }

  it("予算内・条件内なら valid になる", async () => {
    const id = await offerIdFor(target.id);
    const v = await adapter.validateOffer(
      id,
      profileWith({ budgetYen: target.price }),
    );
    expect(v.valid).toBe(true);
    expect(v.blockers).toHaveLength(0);
  });

  it("予算を超えると承認をブロックする", async () => {
    const id = await offerIdFor(target.id);
    const v = await adapter.validateOffer(
      id,
      profileWith({ budgetYen: target.price - 1 }),
    );
    expect(v.valid).toBe(false);
    expect(v.blockers).toContain("over_budget");
  });

  it("すでに手持ちの商品はブロックする", async () => {
    const id = await offerIdFor(target.id);
    const v = await adapter.validateOffer(
      id,
      profileWith({ budgetYen: 100000, ownedProductIds: [target.id] }),
    );
    expect(v.valid).toBe(false);
    expect(v.blockers).toContain("already_owned");
  });

  it("避けたい条件に当たる商品はブロックする", async () => {
    const withCaution = PRODUCTS.find(
      (p) => p.category === "sunscreen" && p.ingredientTags.includes("chemical_uv"),
    );
    expect(withCaution).toBeDefined();

    const id = await offerIdFor(withCaution!.id);
    const v = await adapter.validateOffer(
      id,
      profileWith({ budgetYen: 100000, avoidIngredients: ["chemical_uv"] }),
    );
    expect(v.valid).toBe(false);
    expect(v.blockers).toContain("hard_filter_violation");
  });

  it("未知のオファーはブロックする", async () => {
    const v = await adapter.validateOffer("off__nope__kao-official", DEFAULT_PROFILE);
    expect(v.valid).toBe(false);
    expect(v.blockers).toContain("unknown_offer");
  });

  it("在庫が未確認であることを警告に出す", async () => {
    const id = await offerIdFor(target.id);
    const v = await adapter.validateOffer(
      id,
      profileWith({ budgetYen: 100000 }),
    );
    expect(v.warnings.join()).toContain("在庫");
  });
});

describe("引き継ぎの発行", () => {
  beforeEach(() => __resetConsumedForTest());

  const target = sunscreens.reduce((a, b) => (a.price <= b.price ? a : b));

  it("承認内容が一致していればトークンを発行する", async () => {
    const offer = buildOffer(target)!;
    const r = await adapter.createHandoff({
      offerId: offer.offerId,
      profile: profileWith({ budgetYen: 100000 }),
      acknowledgedPriceYen: offer.price,
      acknowledgedUnverified: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.handoff.token.length).toBeGreaterThan(0);
      expect(r.handoff.handoffUrl.startsWith("/api/commerce/handoff/")).toBe(true);
      // 外部 URL をそのままクライアントへ渡す形になっていないこと
      expect(r.handoff.handoffUrl).not.toContain("https://");
    }
  });

  it("表示価格と再計算価格がずれたら発行しない", async () => {
    const offer = buildOffer(target)!;
    const r = await adapter.createHandoff({
      offerId: offer.offerId,
      profile: profileWith({ budgetYen: 100000 }),
      acknowledgedPriceYen: offer.price + 100,
      acknowledgedUnverified: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.validation.blockers).toContain("price_changed");
  });

  it("未確認項目を了解していなければ発行しない", async () => {
    const offer = buildOffer(target)!;
    expect(offer.unverified.length).toBeGreaterThan(0);

    const r = await adapter.createHandoff({
      offerId: offer.offerId,
      profile: profileWith({ budgetYen: 100000 }),
      acknowledgedPriceYen: offer.price,
      acknowledgedUnverified: false,
    });
    expect(r.ok).toBe(false);
  });

  it("予算超過では発行しない", async () => {
    const offer = buildOffer(target)!;
    const r = await adapter.createHandoff({
      offerId: offer.offerId,
      profile: profileWith({ budgetYen: target.price - 1 }),
      acknowledgedPriceYen: offer.price,
      acknowledgedUnverified: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.validation.blockers).toContain("over_budget");
  });
});

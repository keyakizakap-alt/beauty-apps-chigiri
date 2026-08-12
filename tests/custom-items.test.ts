import { describe, expect, it } from "vitest";
import { buildRecommendation } from "@/domain/recommendation/engine";
import { customItemToProduct } from "@/domain/recommendation/catalog";
import {
  CustomItemSchema,
  DEFAULT_PROFILE,
  ProfileSchema,
  type CustomItem,
  type Profile,
} from "@/schemas/profile";
import { buildOffer } from "@/domain/commerce/static-adapter";

const profile = (over: Partial<Profile> = {}): Profile =>
  ProfileSchema.parse({ ...DEFAULT_PROFILE, ...over });

const item = (over: Partial<CustomItem> = {}): CustomItem =>
  CustomItemSchema.parse({
    id: "my-test-1",
    domain: "skincare",
    category: "lotion",
    brand: "マイブランド",
    name: "手持ちの化粧水",
    usageTiming: ["morning", "night"],
    ...over,
  });

describe("自分で追加した手持ち", () => {
  it("ID は my- で始まるものだけを受け付ける", () => {
    expect(() => item({ id: "lo-hadalabo-gokujyun" })).toThrow();
    expect(() => item({ id: "my-abc123" })).not.toThrow();
  });

  it("公式情報を持たない商品として扱う", () => {
    const p = customItemToProduct(item());
    expect(p.officialUrl).toBeNull();
    expect(p.sourceCheckedAt).toBeNull();
    expect(p.dataConfidence).toBe("user");
    // 確認していない情報を推測で埋めない
    expect(p.allowedClaims).toHaveLength(0);
    expect(p.ingredientTags).toHaveLength(0);
    expect(p.concernTags).toHaveLength(0);
  });

  it("ルーティンの役割を埋められる", () => {
    const custom = item();
    const p = profile({
      customItems: [custom],
      ownedProductIds: ["cl-curel-foam", custom.id, "mo-hadalabo-gokujyun-milk"],
      morningMinutes: 20,
      nightMinutes: 20,
    });
    const { recommendation: r } = buildRecommendation(p);
    const used = [
      ...r.routines.morning.steps.map((s) => s.productId),
      ...r.routines.night.steps.map((s) => s.productId),
    ];
    expect(used).toContain(custom.id);
    // 化粧水が埋まったので、化粧水の不足は出ない
    expect(r.gaps.some((g) => g.category === "lotion")).toBe(false);
  });

  it("手持ちの点数に数えられる", () => {
    const custom = item();
    const p = profile({
      customItems: [custom],
      ownedProductIds: [custom.id],
    });
    const { recommendation: r } = buildRecommendation(p);
    expect(r.savings.ownedTotalCount).toBe(1);
  });

  it("買い足し候補には出てこない（買い先が無いため）", () => {
    const custom = item();
    const p = profile({
      customItems: [custom],
      ownedProductIds: [custom.id],
      budgetYen: 8000,
    });
    const { recommendation: r } = buildRecommendation(p);
    const suggested = [
      r.purchaseSuggestion?.productId,
      ...r.purchaseSuggestions.map((s) => s.productId),
    ].filter(Boolean);
    expect(suggested).not.toContain(custom.id);
  });

  it("購入オファーを作らない", () => {
    expect(buildOffer(customItemToProduct(item()))).toBeNull();
  });

  it("相談中の分野のものだけが手持ちになる", () => {
    const hair = item({ id: "my-hair-1", domain: "haircare", category: "shampoo" });
    const p = profile({
      domain: "skincare",
      customItems: [hair],
      ownedProductIds: [hair.id],
    });
    const { recommendation: r } = buildRecommendation(p);
    expect(r.savings.ownedTotalCount).toBe(0);
  });

  it("根拠の一覧では、自分で追加したものだと分かる", () => {
    const custom = item();
    const p = profile({
      customItems: [custom],
      ownedProductIds: [custom.id],
    });
    const { recommendation: r } = buildRecommendation(p);
    const e = r.evidence.find((x) => x.productId === custom.id);
    expect(e?.dataConfidence).toBe("user");
    expect(e?.officialUrl).toBeNull();
    expect(e?.claims).toHaveLength(0);
  });
});

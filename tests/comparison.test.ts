import { describe, expect, it } from "vitest";
import { buildComparison, computeTippingPoint } from "@/domain/commerce/comparison";
import { commerceAdapter } from "@/domain/commerce/static-adapter";
import { PRODUCTS } from "@/domain/recommendation/catalog";
import { DEFAULT_PROFILE, type Profile } from "@/schemas/profile";
import { OfferComparisonSchema } from "@/schemas/commerce";

function profileWith(patch: Partial<Profile>): Profile {
  return { ...DEFAULT_PROFILE, ...patch };
}

const sunscreens = PRODUCTS.filter((p) => p.category === "sunscreen");
const cheapest = Math.min(...sunscreens.map((p) => p.price));

describe("候補比較", () => {
  it("スキーマを満たす比較結果を返す", async () => {
    const c = await buildComparison({
      adapter: commerceAdapter,
      profile: profileWith({ budgetYen: 100000 }),
      category: "sunscreen",
      limit: 3,
    });
    expect(() => OfferComparisonSchema.parse(c)).not.toThrow();
  });

  it("上限件数を超えない", async () => {
    const c = await buildComparison({
      adapter: commerceAdapter,
      profile: profileWith({ budgetYen: 100000 }),
      category: "sunscreen",
      limit: 3,
    });
    expect(c.rows.length).toBeLessThanOrEqual(3);
    expect(c.rows.length).toBeGreaterThan(0);
  });

  it("第1候補は1件だけ", async () => {
    const c = await buildComparison({
      adapter: commerceAdapter,
      profile: profileWith({ budgetYen: 100000 }),
      category: "sunscreen",
      limit: 3,
    });
    expect(c.rows.filter((r) => r.selected)).toHaveLength(1);
    expect(c.rows[0].selected).toBe(true);
  });

  it("選ばなかった候補には必ず理由が付く", async () => {
    const c = await buildComparison({
      adapter: commerceAdapter,
      profile: profileWith({ budgetYen: 100000, concerns: ["uv_protection"] }),
      category: "sunscreen",
      limit: 3,
    });
    for (const row of c.rows) {
      if (row.selected) {
        expect(row.reason).toBeTruthy();
        expect(row.notChosenReason).toBeNull();
      } else {
        expect(row.notChosenReason).toBeTruthy();
        expect(row.notChosenReason!.length).toBeGreaterThan(10);
      }
    }
  });

  it("予算内に候補が無ければ理由を説明し、候補を作らない", async () => {
    const c = await buildComparison({
      adapter: commerceAdapter,
      profile: profileWith({ budgetYen: cheapest - 1 }),
      category: "sunscreen",
      limit: 3,
    });
    expect(c.rows).toHaveLength(0);
    expect(c.emptyReason).toBeTruthy();
    expect(c.emptyReason).toContain("円");
  });

  it("すべての候補が予算内に収まる", async () => {
    const budget = cheapest + 200;
    const c = await buildComparison({
      adapter: commerceAdapter,
      profile: profileWith({ budgetYen: budget }),
      category: "sunscreen",
      limit: 3,
    });
    for (const row of c.rows) {
      expect(row.offer.price).toBeLessThanOrEqual(budget);
    }
  });

  it("避けたい成分を含む候補を出さない", async () => {
    const c = await buildComparison({
      adapter: commerceAdapter,
      profile: profileWith({
        budgetYen: 100000,
        avoidIngredients: ["chemical_uv"],
      }),
      category: "sunscreen",
      limit: 3,
    });
    for (const row of c.rows) {
      const p = PRODUCTS.find((x) => x.id === row.offer.productId)!;
      expect(p.ingredientTags).not.toContain("chemical_uv");
    }
  });

  it("買わない場合に何が起きるかを必ず示す", async () => {
    const c = await buildComparison({
      adapter: commerceAdapter,
      profile: profileWith({ budgetYen: 100000 }),
      category: "sunscreen",
      limit: 3,
    });
    expect(c.declineOutcome.length).toBeGreaterThan(10);
  });

  it("同じ入力からは同じ順位が出る（決定論）", async () => {
    const profile = profileWith({
      budgetYen: 3000,
      concerns: ["uv_protection", "dryness"],
    });
    const a = await buildComparison({
      adapter: commerceAdapter,
      profile,
      category: "sunscreen",
      limit: 3,
    });
    const b = await buildComparison({
      adapter: commerceAdapter,
      profile,
      category: "sunscreen",
      limit: 3,
    });
    expect(a.rows.map((r) => r.offer.productId)).toEqual(
      b.rows.map((r) => r.offer.productId),
    );
  });
});

describe("予算の転換点（反実仮想）", () => {
  it("候補が無い場合、いくらで候補が出るかを示す", () => {
    const t = computeTippingPoint({
      profile: profileWith({ budgetYen: cheapest - 1 }),
      category: "sunscreen",
      current: null,
    });
    expect(t.kind).toBe("budget_up");
    expect(t.budgetYen).toBe(cheapest);
    expect(t.productId).toBeTruthy();
  });

  it("提示した境界額なら実際に候補が出る", async () => {
    const t = computeTippingPoint({
      profile: profileWith({ budgetYen: cheapest - 1 }),
      category: "sunscreen",
      current: null,
    });
    expect(t.budgetYen).not.toBeNull();

    const c = await buildComparison({
      adapter: commerceAdapter,
      profile: profileWith({ budgetYen: t.budgetYen! }),
      category: "sunscreen",
      limit: 3,
    });
    expect(c.rows.length).toBeGreaterThan(0);
  });

  it("候補がある場合、予算を下げたときの結論変化を示す", async () => {
    const profile = profileWith({ budgetYen: 100000 });
    const found = await commerceAdapter.searchProducts({
      category: "sunscreen",
      profile,
      maxYen: 100000,
      excludeProductIds: [],
      limit: 1,
    });
    const t = computeTippingPoint({
      profile,
      category: "sunscreen",
      current: found[0],
    });
    expect(["budget_down", "none"]).toContain(t.kind);
    expect(t.message.length).toBeGreaterThan(10);
  });

  it("提示した境界額で実際に別の結論になる", async () => {
    const profile = profileWith({ budgetYen: 100000 });
    const found = await commerceAdapter.searchProducts({
      category: "sunscreen",
      profile,
      maxYen: 100000,
      excludeProductIds: [],
      limit: 1,
    });
    const t = computeTippingPoint({
      profile,
      category: "sunscreen",
      current: found[0],
    });

    if (t.kind === "budget_down" && t.budgetYen !== null) {
      const c = await buildComparison({
        adapter: commerceAdapter,
        profile: profileWith({ budgetYen: t.budgetYen }),
        category: "sunscreen",
        limit: 3,
      });
      const top = c.rows[0]?.offer.productId ?? null;
      expect(top).not.toBe(found[0].product.id);
    }
  });

  it("除外条件で候補が全滅する場合は予算では変わらないと答える", () => {
    const t = computeTippingPoint({
      profile: profileWith({
        budgetYen: 100000,
        avoidIngredients: ["chemical_uv", "mineral_uv"],
      }),
      category: "sunscreen",
      current: null,
    });
    expect(t.kind).toBe("none");
    expect(t.message).toContain("予算");
  });
});

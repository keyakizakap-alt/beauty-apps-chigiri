import { describe, expect, it } from "vitest";
import { DEMO_SCENARIOS, findScenario } from "@/lib/demo-scenarios";
import { buildRecommendation } from "@/domain/recommendation/engine";
import { isKnownProductId } from "@/domain/recommendation/catalog";
import { ProfileSchema } from "@/schemas/profile";

/**
 * デモの前提が崩れていないことを確認する。
 *
 * カタログの usageTiming ひとつで「買い足し不要」が「1点提案」に変わるため、
 * 説明文と実際の結果がずれていないかを機械的に検証しておく。
 */
describe("デモシナリオ", () => {
  it("すべてのシナリオのプロファイルが妥当", () => {
    for (const s of DEMO_SCENARIOS) {
      expect(ProfileSchema.safeParse(s.profile).success, s.id).toBe(true);
    }
  });

  it("手持ち商品がすべてカタログに存在する", () => {
    for (const s of DEMO_SCENARIOS) {
      for (const id of s.profile.ownedProductIds) {
        expect(isKnownProductId(id), `${s.id}: ${id}`).toBe(true);
      }
    }
  });

  it("id が重複していない", () => {
    const ids = DEMO_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("id から引ける", () => {
    for (const s of DEMO_SCENARIOS) {
      expect(findScenario(s.id)?.title).toBe(s.title);
    }
  });

  /* --- 各シナリオが宣伝どおりの結果を出すか --- */

  it("「1点だけ足りない人」は買い足し1点を提案する", () => {
    const s = findScenario("one-missing")!;
    const { recommendation } = buildRecommendation(s.profile);
    expect(recommendation.purchaseSuggestion).not.toBeNull();
    expect(recommendation.savings.newItemCount).toBe(1);
    expect(recommendation.purchaseSuggestion!.price).toBeLessThanOrEqual(
      s.profile.budgetYen,
    );
  });

  it("「買わなくていい人」は買い足しを提案しない", () => {
    const s = findScenario("no-purchase")!;
    const { recommendation } = buildRecommendation(s.profile);
    expect(recommendation.purchaseSuggestion).toBeNull();
    expect(recommendation.noPurchaseNeededReason).toBeTruthy();
    expect(recommendation.gaps).toHaveLength(0);
  });

  it("「重複買いしていた人」は役割の重複を検出する", () => {
    const s = findScenario("duplicated")!;
    const { recommendation } = buildRecommendation(s.profile);
    expect(recommendation.duplications.length).toBeGreaterThan(0);
  });

  it("「予算が足りない人」は無理に商品を勧めない", () => {
    const s = findScenario("tight-budget")!;
    const { recommendation } = buildRecommendation(s.profile);
    expect(recommendation.purchaseSuggestion).toBeNull();
    expect(recommendation.noPurchaseNeededReason).toContain("予算");
  });

  it("どのシナリオも予算超過の提案をしない", () => {
    for (const s of DEMO_SCENARIOS) {
      const { recommendation } = buildRecommendation(s.profile);
      expect(
        recommendation.savings.additionalCostYen,
        s.id,
      ).toBeLessThanOrEqual(s.profile.budgetYen);
    }
  });

  it("どのシナリオも朝夜どちらかのルーティンが成立する", () => {
    for (const s of DEMO_SCENARIOS) {
      const { recommendation } = buildRecommendation(s.profile);
      const steps =
        recommendation.routines.morning.steps.length +
        recommendation.routines.night.steps.length;
      expect(steps, s.id).toBeGreaterThan(0);
    }
  });

  it("除外条件を指定したシナリオでは、その条件が守られる", () => {
    const s = findScenario("duplicated")!;
    expect(s.profile.avoidIngredients).toContain("alcohol");

    const { recommendation } = buildRecommendation(s.profile);
    const used = [
      ...recommendation.routines.morning.steps,
      ...recommendation.routines.night.steps,
    ].map((step) => step.productId);

    for (const id of used) {
      const p = recommendation.products.find((x) => x.id === id)!;
      expect(p.ingredientTags).not.toContain("alcohol");
      expect(p.cautionTags).not.toContain("contains_alcohol");
    }
  });
});

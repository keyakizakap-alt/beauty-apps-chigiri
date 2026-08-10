import { describe, expect, it } from "vitest";
import {
  budgetScore,
  concernScore,
  scoreAll,
  scoreProduct,
  skinScore,
  WEIGHTS,
} from "@/domain/recommendation/scorer";
import { getProduct, PRODUCTS } from "@/domain/recommendation/catalog";
import { DEFAULT_PROFILE, type Profile } from "@/schemas/profile";

const profile = (over: Partial<Profile> = {}): Profile => ({
  ...DEFAULT_PROFILE,
  ...over,
});

describe("スコアリング", () => {
  it("重みの合計が 1 になる", () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("関心が一致するほど高い", () => {
    const curel = getProduct("lo-curel-lotion3")!; // dryness, sensitivity
    const high = concernScore(curel, profile({ concerns: ["dryness"] }));
    const low = concernScore(curel, profile({ concerns: ["pores"] }));
    expect(high).toBeGreaterThan(low);
  });

  it("関心は先頭ほど重い", () => {
    const curel = getProduct("lo-curel-lotion3")!;
    const first = concernScore(curel, profile({ concerns: ["dryness", "pores"] }));
    const second = concernScore(curel, profile({ concerns: ["pores", "dryness"] }));
    expect(first).toBeGreaterThan(second);
  });

  it("敏感肌向け表示がない商品は敏感肌で大きく下がる", () => {
    const elixir = getProduct("lo-elixir-refle-water")!;
    expect(elixir.skinTags).not.toContain("sensitive");
    expect(skinScore(elixir, profile({ skinType: "sensitive" }))).toBeLessThan(0.2);
  });

  it("手持ち商品は予算適合が常に満点", () => {
    const obagi = getProduct("se-obagi-c25")!; // 11,000円
    const owned = new Set([obagi.id]);
    expect(budgetScore(obagi, profile({ budgetYen: 1000 }), true)).toBe(1);
    expect(budgetScore(obagi, profile({ budgetYen: 1000 }), false)).toBe(0);
    expect(scoreProduct(obagi, profile({ budgetYen: 1000 }), owned).breakdown.budget).toBe(1);
  });

  it("予算超過の未所持商品は予算適合が 0", () => {
    const obagi = getProduct("se-obagi-c25")!;
    expect(budgetScore(obagi, profile({ budgetYen: 3000 }), false)).toBe(0);
  });

  it("手持ち商品は同条件の未所持商品より高くなる", () => {
    const p = getProduct("lo-muji-sensitive-high")!;
    const asOwned = scoreProduct(p, profile(), new Set([p.id]));
    const asNew = scoreProduct(p, profile(), new Set());
    expect(asOwned.score).toBeGreaterThan(asNew.score);
  });

  it("同じ入力からは常に同じ順位になる（決定論性）", () => {
    const p = profile({ concerns: ["dryness", "sensitivity"], skinType: "dry" });
    const owned = new Set(["lo-curel-lotion3"]);
    const a = scoreAll(PRODUCTS, p, owned).map((s) => s.product.id);
    const b = scoreAll([...PRODUCTS].reverse(), p, owned).map((s) => s.product.id);
    expect(a).toEqual(b);
  });

  it("スコアは 0 以上 1 以下に収まる", () => {
    for (const s of scoreAll(PRODUCTS, profile({ concerns: ["dryness"] }), new Set())) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it("注意タグが多い商品はペナルティを受ける", () => {
    const anessa = getProduct("su-anessa-perfectuv")!;
    const s = scoreProduct(anessa, profile({ skinType: "sensitive" }), new Set());
    expect(s.breakdown.cautionPenalty).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { buildRecommendation } from "@/domain/recommendation/engine";
import { getProduct, PRODUCTS } from "@/domain/recommendation/catalog";
import { DEFAULT_PROFILE, ProfileSchema, type Profile } from "@/schemas/profile";
import { RecommendationSchema } from "@/schemas/recommendation";
import { isExpressionSafe } from "@/domain/recommendation/safety-rules";

const profile = (over: Partial<Profile> = {}): Profile =>
  ProfileSchema.parse({ ...DEFAULT_PROFILE, ...over });

/** 3分デモで使う手持ち構成（洗顔・化粧水×2・美容液・乳液×2 の6点、日焼け止めなし） */
const DEMO_OWNED = [
  "cl-curel-foam",
  "lo-hadalabo-gokujyun",
  "lo-muji-sensitive-high",
  "se-torriden-dive-in-serum",
  "mo-hadalabo-gokujyun-milk",
  "mo-curel-facecream",
];

const demoProfile = (over: Partial<Profile> = {}) =>
  profile({
    skinType: "dry",
    concerns: ["dryness", "sensitivity"],
    budgetYen: 3000,
    morningMinutes: 5,
    nightMinutes: 10,
    ownedProductIds: DEMO_OWNED,
    ...over,
  });

/* =================================================================
 * シナリオ 1〜8: 基本フロー
 * ================================================================= */

describe("基本フロー", () => {
  it("S01: 出力が Recommendation スキーマを満たす", () => {
    const { recommendation } = buildRecommendation(demoProfile());
    const parsed = RecommendationSchema.safeParse({
      ...recommendation,
      ai: {
        used: false,
        model: null,
        requestedModel: null,
        latencyMs: null,
        fallback: true,
        fallbackReason: "test",
        requestId: null,
        jsonValid: null,
        estimatedTokens: null,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("S02: 朝・夜のルーティンが生成される", () => {
    const { recommendation: r } = buildRecommendation(demoProfile());
    expect(r.routines.morning.steps.length).toBeGreaterThan(0);
    expect(r.routines.night.steps.length).toBeGreaterThan(0);
  });

  it("S03: 使用順が 洗顔→化粧水→美容液→乳液→日焼け止め の順に並ぶ", () => {
    const order = ["cleanser", "lotion", "serum", "moisturizer", "sunscreen"];
    const { recommendation: r } = buildRecommendation(
      demoProfile({ morningMinutes: 20, nightMinutes: 20 }),
    );
    for (const routine of [r.routines.morning, r.routines.night]) {
      const idx = routine.steps.map((s) => order.indexOf(s.category));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
      expect(routine.steps.map((s) => s.order)).toEqual(
        routine.steps.map((_, i) => i + 1),
      );
    }
  });

  it("S04: 各ステップに使用目的・採用理由・注意事項がある", () => {
    const { recommendation: r } = buildRecommendation(demoProfile());
    for (const s of r.routines.night.steps) {
      expect(s.purpose.length).toBeGreaterThan(0);
      expect(s.reason.length).toBeGreaterThan(0);
      expect(Array.isArray(s.cautions)).toBe(true);
    }
  });

  it("S05: 役割が重複した商品を検出する（化粧水2点・乳液2点）", () => {
    const { recommendation: r } = buildRecommendation(demoProfile());
    const cats = r.duplications.map((d) => d.category).sort();
    expect(cats).toEqual(["lotion", "moisturizer"]);
  });

  it("S06: 重複した商品は不採用理由付きで残る", () => {
    const { recommendation: r } = buildRecommendation(demoProfile());
    const dup = r.unused.filter((u) => u.reasonCode === "duplicate_role");
    // 化粧水2点は朝夜とも同じ枠を争うため、1点が余る
    expect(dup.length).toBe(1);
    expect(dup[0].reason).toContain("重複");
  });

  it("S06b: 役割が重複していても、使用タイミングが違えば両方使われる", () => {
    // 夜専用クリームと朝夜兼用乳液を持っている場合、
    // 夜はクリーム・朝は乳液が使われ、どちらも無駄にならない
    const { recommendation: r } = buildRecommendation(demoProfile());
    const nightIds = r.routines.night.steps.map((s) => s.productId);
    const morningIds = r.routines.morning.steps.map((s) => s.productId);
    expect(nightIds).toContain("mo-curel-facecream");
    expect(morningIds).toContain("mo-hadalabo-gokujyun-milk");
    expect(r.savings.ownedUsedCount).toBe(5);
  });

  it("S07: 不足している役割（日焼け止め）を検出する", () => {
    const { recommendation: r } = buildRecommendation(demoProfile());
    expect(r.gaps.some((g) => g.category === "sunscreen")).toBe(true);
  });

  it("S08: 買い足しは1点だけ提案される", () => {
    const { recommendation: r } = buildRecommendation(demoProfile());
    expect(r.purchaseSuggestion).not.toBeNull();
    expect(r.purchaseSuggestion!.category).toBe("sunscreen");
    expect(r.purchaseSuggestions).toHaveLength(0);
    expect(r.savings.newItemCount).toBe(1);
  });
});

/* =================================================================
 * シナリオ 9〜14: 制約の反映
 * ================================================================= */

describe("制約の反映", () => {
  it("S09: 予算内の商品だけが提案される", () => {
    const { recommendation: r } = buildRecommendation(
      demoProfile({ budgetYen: 1000 }),
    );
    if (r.purchaseSuggestion) {
      expect(r.purchaseSuggestion.price).toBeLessThanOrEqual(1000);
    }
  });

  it("S10: 予算を下げると提案商品が変わる（再計算）", () => {
    const high = buildRecommendation(demoProfile({ budgetYen: 5000 }));
    const low = buildRecommendation(demoProfile({ budgetYen: 900 }));
    expect(high.recommendation.purchaseSuggestion).not.toBeNull();
    expect(low.recommendation.purchaseSuggestion).not.toBeNull();
    expect(low.recommendation.purchaseSuggestion!.price).toBeLessThanOrEqual(900);
  });

  it("S11: 予算0円では提案せず、理由を返す", () => {
    const { recommendation: r } = buildRecommendation(
      demoProfile({ budgetYen: 0 }),
    );
    expect(r.purchaseSuggestion).toBeNull();
    expect(r.noPurchaseNeededReason).toContain("予算");
  });

  it("S12: 追加購入を許可しない場合は提案しない", () => {
    const { recommendation: r } = buildRecommendation(
      demoProfile({ allowPurchase: false }),
    );
    expect(r.purchaseSuggestion).toBeNull();
    expect(r.savings.additionalCostYen).toBe(0);
    expect(r.noPurchaseNeededReason).toContain("追加購入しない");
  });

  it("S13: 避けたい成分を含む商品は採用されない（ハードフィルタ違反 0%）", () => {
    const p = demoProfile({
      avoidIngredients: ["fragrance", "alcohol"],
      budgetYen: 5000,
    });
    const { recommendation: r } = buildRecommendation(p);
    const usedIds = [
      ...r.routines.morning.steps.map((s) => s.productId),
      ...r.routines.night.steps.map((s) => s.productId),
      ...(r.purchaseSuggestion ? [r.purchaseSuggestion.productId] : []),
    ];
    for (const id of usedIds) {
      const product = getProduct(id)!;
      expect(product.ingredientTags).not.toContain("fragrance");
      expect(product.ingredientTags).not.toContain("alcohol");
      expect(product.cautionTags).not.toContain("contains_fragrance");
      expect(product.cautionTags).not.toContain("contains_alcohol");
    }
  });

  it("S14: 除外された手持ち商品は理由付きで表示される", () => {
    const alcoholProfile = profile({
      ownedProductIds: ["lo-naturie-hatomugi", "cl-curel-foam"],
      avoidIngredients: ["alcohol"],
    });
    const { recommendation: r } = buildRecommendation(alcoholProfile);
    const hit = r.unused.find((u) => u.productId === "lo-naturie-hatomugi");
    expect(hit?.reasonCode).toBe("hard_filter_ingredient");
  });
});

/* =================================================================
 * シナリオ 15〜19: 時間と工程数
 * ================================================================= */

describe("工程数と時間", () => {
  it("S15: 朝の時間が短いと工程が減る", () => {
    const long = buildRecommendation(demoProfile({ morningMinutes: 20 }));
    const short = buildRecommendation(demoProfile({ morningMinutes: 3 }));
    expect(short.recommendation.routines.morning.steps.length).toBeLessThan(
      long.recommendation.routines.morning.steps.length,
    );
  });

  it("S16: 省略された工程は理由付きで表示される", () => {
    const { recommendation: r } = buildRecommendation(
      demoProfile({ morningMinutes: 3, nightMinutes: 3 }),
    );
    const trimmed = r.unused.filter((u) => u.reasonCode === "time_budget");
    expect(trimmed.length).toBeGreaterThan(0);
    expect(trimmed[0].reason).toContain("時間");
  });

  it("S17: 必須工程は時間が足りなくても残る", () => {
    const { recommendation: r } = buildRecommendation(
      demoProfile({ nightMinutes: 1 }),
    );
    const cats = r.routines.night.steps.map((s) => s.category);
    expect(cats).toContain("cleanser");
    expect(cats).toContain("lotion");
    expect(cats).toContain("moisturizer");
  });

  it("S18: 使用タイミングが合わない商品は入らない", () => {
    // メラノCC は usageTiming が night のみ
    const p = profile({
      ownedProductIds: ["cl-curel-foam", "lo-hadalabo-gokujyun", "se-melanocc-premium", "mo-hadalabo-gokujyun-milk"],
      morningMinutes: 20,
      nightMinutes: 20,
    });
    const { recommendation: r } = buildRecommendation(p);
    expect(
      r.routines.morning.steps.some((s) => s.productId === "se-melanocc-premium"),
    ).toBe(false);
    expect(
      r.routines.night.steps.some((s) => s.productId === "se-melanocc-premium"),
    ).toBe(true);
  });

  it("S19: 合計工程数が集計される", () => {
    const { recommendation: r } = buildRecommendation(demoProfile());
    expect(r.totalSteps).toBe(
      r.routines.morning.steps.length + r.routines.night.steps.length,
    );
  });
});

/* =================================================================
 * シナリオ 20〜26: 節約・根拠・安全性・決定論性
 * ================================================================= */

describe("節約・根拠・安全性", () => {
  it("S20: 手持ち活用率と削減額が算出される", () => {
    const { recommendation: r } = buildRecommendation(demoProfile());
    expect(r.savings.ownedTotalCount).toBe(6);
    expect(r.savings.ownedUsedCount).toBeGreaterThan(0);
    expect(r.savings.utilizationRate).toBeGreaterThan(0);
    expect(r.savings.avoidedItemCount).toBeGreaterThan(0);
    expect(r.savings.avoidedCostYen).toBeGreaterThan(0);
  });

  it("S21: 要約に活用点数と買い足し点数が含まれる", () => {
    const { recommendation: r } = buildRecommendation(demoProfile());
    expect(r.summary).toContain("手持ち6商品");
    expect(r.summary).toContain("日焼け止め");
  });

  it("S22: 使用した全商品に公式URLが付く", () => {
    const { recommendation: r } = buildRecommendation(demoProfile());
    expect(r.evidence.length).toBeGreaterThan(0);
    for (const e of r.evidence) {
      expect(e.officialUrl).toMatch(/^https:\/\//);
      expect(e.claims.length).toBeGreaterThan(0);
    }
  });

  it("S23: 公式突合が未完了の商品は sourceCheckedAt が null で表示される", () => {
    const { recommendation: r } = buildRecommendation(demoProfile());
    for (const e of r.evidence) {
      if (e.dataConfidence === "seed") expect(e.sourceCheckedAt).toBeNull();
    }
  });

  it("S24: 生成されたすべての文章が禁止表現を含まない", () => {
    const { recommendation: r } = buildRecommendation(demoProfile());
    const texts = [
      r.summary,
      ...r.routines.morning.steps.flatMap((s) => [s.purpose, s.reason, ...s.cautions]),
      ...r.routines.night.steps.flatMap((s) => [s.purpose, s.reason, ...s.cautions]),
      ...r.duplications.map((d) => d.note),
      ...r.unused.map((u) => u.reason),
      ...(r.purchaseSuggestion ? [r.purchaseSuggestion.reason] : []),
      r.noPurchaseNeededReason ?? "",
    ];
    for (const t of texts) {
      expect(isExpressionSafe(t).safe, `禁止表現: ${t}`).toBe(true);
    }
  });

  it("S25: 免責文が必ず含まれる", () => {
    const { recommendation: r } = buildRecommendation(demoProfile());
    expect(r.disclaimer).toContain("医療");
    expect(r.safety.length).toBeGreaterThan(0);
  });

  it("S26: 同じ入力から常に同じ結果になる（決定論性）", () => {
    const a = buildRecommendation(demoProfile()).recommendation;
    const b = buildRecommendation(demoProfile()).recommendation;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

/* =================================================================
 * シナリオ 27〜32: 境界条件
 * ================================================================= */

describe("境界条件", () => {
  it("S27: 手持ちが0点でもエラーにならない", () => {
    const { recommendation: r } = buildRecommendation(profile());
    expect(r.routines.morning.steps).toHaveLength(0);
    expect(r.savings.ownedTotalCount).toBe(0);
    expect(r.summary).toContain("手持ち");
  });

  it("S28: カタログにない ID は無視される", () => {
    const { recommendation: r } = buildRecommendation(
      profile({ ownedProductIds: ["does-not-exist", "cl-curel-foam"] }),
    );
    expect(r.savings.ownedTotalCount).toBe(1);
  });

  it("S29: 手持ちで全カテゴリーが揃うと買い足し不要になる", () => {
    const full = profile({
      // 乳液は朝夜とも使えるものを持っている前提
      ownedProductIds: [
        "cl-curel-foam",
        "lo-curel-lotion3",
        "se-torriden-dive-in-serum",
        "mo-hadalabo-gokujyun-milk",
        "su-curel-uv-essence",
      ],
      morningMinutes: 20,
      nightMinutes: 20,
    });
    const { recommendation: r } = buildRecommendation(full);
    expect(r.purchaseSuggestion).toBeNull();
    expect(r.noPurchaseNeededReason).toContain("必要ありません");
    expect(r.savings.newItemCount).toBe(0);
  });

  it("S30: 最大買い足し数を2にすると不足が複数ある場合に2点まで提案する", () => {
    const sparse = profile({
      ownedProductIds: ["lo-hadalabo-gokujyun"],
      budgetYen: 8000,
      maxNewItems: 2,
      morningMinutes: 20,
      nightMinutes: 20,
    });
    const { recommendation: r } = buildRecommendation(sparse);
    const total = (r.purchaseSuggestion ? 1 : 0) + r.purchaseSuggestions.length;
    expect(total).toBeLessThanOrEqual(2);
    expect(total).toBeGreaterThan(0);
    expect(r.savings.additionalCostYen).toBeLessThanOrEqual(8000);
  });

  it("S31: 買い足し候補は必ずカタログ内の商品である", () => {
    const ids = new Set(PRODUCTS.map((p) => p.id));
    for (const budget of [500, 1500, 3000, 10000]) {
      const { recommendation: r } = buildRecommendation(
        demoProfile({ budgetYen: budget }),
      );
      if (r.purchaseSuggestion) {
        expect(ids.has(r.purchaseSuggestion.productId)).toBe(true);
        for (const id of r.purchaseSuggestion.runnerUpIds) {
          expect(ids.has(id)).toBe(true);
        }
      }
    }
  });

  it("S32: 全カタログを手持ちにしても破綻しない", () => {
    const all = profile({
      ownedProductIds: PRODUCTS.filter((p) => p.domain === "skincare").map((p) => p.id),
      morningMinutes: 20,
      nightMinutes: 20,
    });
    const { recommendation: r } = buildRecommendation(all);
    expect(r.routines.morning.steps.length).toBeGreaterThan(0);
    // 1カテゴリーにつき1点だけが採用される
    const cats = r.routines.night.steps.map((s) => s.category);
    expect(new Set(cats).size).toBe(cats.length);
    expect(r.purchaseSuggestion).toBeNull();
  });

  it("S33: LLM へ渡す許可 ID はすべてカタログ内である", () => {
    const { allowedProductIds } = buildRecommendation(demoProfile());
    const ids = new Set(PRODUCTS.map((p) => p.id));
    expect(allowedProductIds.length).toBeGreaterThan(0);
    for (const id of allowedProductIds) expect(ids.has(id)).toBe(true);
  });

  it("S34: 敏感肌では敏感肌向け表示のある商品が優先される", () => {
    const p = profile({
      skinType: "sensitive",
      concerns: ["sensitivity"],
      ownedProductIds: [],
      budgetYen: 4000,
      maxNewItems: 1,
      morningMinutes: 20,
      nightMinutes: 20,
    });
    const { recommendation: r } = buildRecommendation(p);
    expect(r.purchaseSuggestion).not.toBeNull();
    const chosen = getProduct(r.purchaseSuggestion!.productId)!;
    expect(chosen.skinTags).toContain("sensitive");
  });
});

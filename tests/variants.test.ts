import { describe, expect, it } from "vitest";
import { buildRecommendation } from "@/domain/recommendation/engine";
import { countArrangements } from "@/domain/recommendation/variants";
import { detectDuplications } from "@/domain/recommendation/duplication-detector";
import { scoreAll } from "@/domain/recommendation/scorer";
import { getProducts } from "@/domain/recommendation/catalog";
import { RecommendationSchema } from "@/schemas/recommendation";
import { DEFAULT_PROFILE, type Profile } from "@/schemas/profile";

function profileWith(patch: Partial<Profile>): Profile {
  return { ...DEFAULT_PROFILE, ...patch };
}

/** 全カテゴリーをそろえた手持ち */
const FULL_INVENTORY = [
  "cl-curel-foam",
  "lo-hadalabo-gokujyun",
  "se-melanocc-premium",
  "mo-nivea-cream",
  "su-biore-aquarich",
];

function groupsFor(profile: Profile) {
  const owned = getProducts(profile.ownedProductIds);
  const scored = scoreAll(owned, profile, new Set(owned.map((p) => p.id)));
  return detectDuplications(scored).groups;
}

describe("ルーティンの複数案", () => {
  it("標準・時短・じっくりの案を返す", () => {
    const { recommendation } = buildRecommendation(
      profileWith({ ownedProductIds: FULL_INVENTORY, morningMinutes: 5, nightMinutes: 10 }),
    );
    const kinds = recommendation.plans.map((p) => p.kind);
    expect(kinds).toContain("standard");
    expect(kinds).toContain("quick");
    expect(recommendation.plans.length).toBeGreaterThanOrEqual(2);
  });

  it("時短案は標準案より工程が多くならない", () => {
    const { recommendation } = buildRecommendation(
      profileWith({ ownedProductIds: FULL_INVENTORY, morningMinutes: 10, nightMinutes: 15 }),
    );
    const standard = recommendation.plans.find((p) => p.kind === "standard")!;
    const quick = recommendation.plans.find((p) => p.kind === "quick");
    if (quick) {
      expect(quick.totalSteps).toBeLessThanOrEqual(standard.totalSteps);
    }
  });

  it("じっくり案は時短案より手持ちを多く使う", () => {
    const { recommendation } = buildRecommendation(
      profileWith({ ownedProductIds: FULL_INVENTORY, morningMinutes: 3, nightMinutes: 4 }),
    );
    const quick = recommendation.plans.find((p) => p.kind === "quick");
    const full = recommendation.plans.find((p) => p.kind === "full");
    if (quick && full) {
      expect(full.ownedUsedCount).toBeGreaterThanOrEqual(quick.ownedUsedCount);
      expect(full.totalSteps).toBeGreaterThanOrEqual(quick.totalSteps);
    }
  });

  it("中身が同じ案は重複して出さない", () => {
    const { recommendation } = buildRecommendation(
      profileWith({ ownedProductIds: FULL_INVENTORY, morningMinutes: 1, nightMinutes: 1 }),
    );
    const signatures = recommendation.plans.map((p) =>
      [...p.routines.morning.steps, ...p.routines.night.steps]
        .map((s) => `${s.category}:${s.productId}`)
        .join("|"),
    );
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("どの案も除外条件を破らない", () => {
    const profile = profileWith({
      ownedProductIds: FULL_INVENTORY,
      avoidIngredients: ["fragrance"],
    });
    const { recommendation } = buildRecommendation(profile);
    const excludedIds = new Set(
      recommendation.unused
        .filter((u) => u.reasonCode === "hard_filter_ingredient")
        .map((u) => u.productId),
    );
    for (const plan of recommendation.plans) {
      const used = [
        ...plan.routines.morning.steps,
        ...plan.routines.night.steps,
      ].map((s) => s.productId);
      for (const id of used) expect(excludedIds.has(id)).toBe(false);
    }
  });

  it("どの案もカタログ内の商品だけを使う", () => {
    const { recommendation } = buildRecommendation(
      profileWith({ ownedProductIds: FULL_INVENTORY }),
    );
    const ownedSet = new Set(FULL_INVENTORY);
    for (const plan of recommendation.plans) {
      for (const step of [
        ...plan.routines.morning.steps,
        ...plan.routines.night.steps,
      ]) {
        expect(ownedSet.has(step.productId)).toBe(true);
      }
    }
  });

  it("標準案は routines と一致する", () => {
    const { recommendation } = buildRecommendation(
      profileWith({ ownedProductIds: FULL_INVENTORY }),
    );
    const standard = recommendation.plans.find((p) => p.kind === "standard")!;
    expect(standard.routines.morning.steps.map((s) => s.productId)).toEqual(
      recommendation.routines.morning.steps.map((s) => s.productId),
    );
    expect(standard.routines.night.steps.map((s) => s.productId)).toEqual(
      recommendation.routines.night.steps.map((s) => s.productId),
    );
  });

  it("同じ入力からは同じ案が出る（決定論）", () => {
    const profile = profileWith({ ownedProductIds: FULL_INVENTORY });
    const a = buildRecommendation(profile).recommendation;
    const b = buildRecommendation(profile).recommendation;
    expect(JSON.stringify(a.plans)).toBe(JSON.stringify(b.plans));
  });

  it("スキーマ検証を通る", () => {
    const { recommendation } = buildRecommendation(
      profileWith({ ownedProductIds: FULL_INVENTORY }),
    );
    const parsed = RecommendationSchema.safeParse({
      ...recommendation,
      ai: {
        used: false,
        model: null,
        requestedModel: null,
        latencyMs: null,
        fallback: true,
        fallbackReason: "user_local_only",
        requestId: null,
        jsonValid: null,
        estimatedTokens: null,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("plans が無い過去データも読める（既定値で補う）", () => {
    const { recommendation } = buildRecommendation(
      profileWith({ ownedProductIds: FULL_INVENTORY }),
    );
    const { plans: _p, arrangementCount: _a, ...withoutPlans } = recommendation;
    const parsed = RecommendationSchema.safeParse({
      ...withoutPlans,
      ai: {
        used: false,
        model: null,
        requestedModel: null,
        latencyMs: null,
        fallback: true,
        fallbackReason: null,
        requestId: null,
        jsonValid: null,
        estimatedTokens: null,
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.plans).toEqual([]);
      expect(parsed.data.arrangementCount).toBe(0);
    }
  });
});

describe("組み立て方の総数", () => {
  it("手持ちが無ければ1通り", () => {
    expect(countArrangements(groupsFor(profileWith({ ownedProductIds: [] })), "skincare")).toBe(1);
  });

  it("手持ちが増えると組み合わせも増える", () => {
    const few = countArrangements(
      groupsFor(profileWith({ ownedProductIds: ["cl-curel-foam"] })), "skincare");
    const many = countArrangements(
      groupsFor(profileWith({ ownedProductIds: FULL_INVENTORY })), "skincare");
    expect(many).toBeGreaterThan(few);
  });

  it("同じカテゴリーを2点持つと選択肢が増える", () => {
    const one = countArrangements(
      groupsFor(profileWith({ ownedProductIds: ["lo-hadalabo-gokujyun"] })), "skincare");
    const two = countArrangements(
      groupsFor(
        profileWith({
          ownedProductIds: ["lo-hadalabo-gokujyun", "lo-hadalabo-shirojyun"],
        }),
      ), "skincare");
    expect(two).toBeGreaterThan(one);
  });

  it("提示する案の数は組み合わせ総数を超えない", () => {
    const profile = profileWith({ ownedProductIds: FULL_INVENTORY });
    const { recommendation } = buildRecommendation(profile);
    expect(recommendation.plans.length).toBeLessThanOrEqual(
      recommendation.arrangementCount,
    );
  });
});

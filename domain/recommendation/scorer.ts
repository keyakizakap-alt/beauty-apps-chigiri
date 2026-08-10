import type { Product, TextureTag, SkinTag } from "@/schemas/product";
import type { Profile } from "@/schemas/profile";

/**
 * 決定論的スコアリング。
 * LLM はこの数値に一切関与しない。同じ入力からは常に同じ順位が出る。
 *
 * score =
 *     関心との一致   × 0.30
 *   + 肌傾向との一致 × 0.20
 *   + 手持ち活用     × 0.20
 *   + 予算適合       × 0.15
 *   + 使用感との一致 × 0.10
 *   + 入手しやすさ   × 0.05
 *   - 注意要素ペナルティ
 * （役割重複ペナルティ・工程過多ペナルティは routine-builder 側で適用）
 */

export const WEIGHTS = {
  concern: 0.3,
  skin: 0.2,
  owned: 0.2,
  budget: 0.15,
  texture: 0.1,
  availability: 0.05,
} as const;

export type ScoreBreakdown = {
  concern: number;
  skin: number;
  owned: number;
  budget: number;
  texture: number;
  availability: number;
  cautionPenalty: number;
  total: number;
};

export type ScoredProduct = {
  product: Product;
  score: number;
  breakdown: ScoreBreakdown;
  owned: boolean;
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * 肌傾向ごとに「相性が良いと考えられる使用感」。
 * ユーザーが明示的に好みを入力しない MVP では、ここから使用感一致を推定する。
 */
const PREFERRED_TEXTURES: Record<SkinTag, TextureTag[]> = {
  dry: ["rich", "milky", "balm", "dewy_finish"],
  oily: ["light", "non_sticky", "watery", "gel", "matte_finish"],
  combination: ["light", "gel", "non_sticky", "milky"],
  normal: ["light", "milky", "non_sticky"],
  sensitive: ["fragrance_free", "light", "milky", "non_sticky"],
};

/** 関心の一致度。profile.concerns は優先順位順で、先頭ほど重い。 */
export function concernScore(product: Product, profile: Profile): number {
  if (profile.concerns.length === 0) return 0.5; // 情報がないので中立
  let matched = 0;
  let total = 0;
  profile.concerns.forEach((c, i) => {
    const weight = 1 / (i + 1);
    total += weight;
    if (product.concernTags.includes(c)) matched += weight;
  });
  return total === 0 ? 0 : matched / total;
}

/** 肌傾向の一致度。敏感肌は「敏感肌向けと明示されていない」ことを強めに減点する。 */
export function skinScore(product: Product, profile: Profile): number {
  if (product.skinTags.length === 0) return 0.5;
  const direct = product.skinTags.includes(profile.skinType);
  if (direct) return 1;
  if (profile.skinType === "sensitive") return 0.15;
  if (product.skinTags.includes("normal")) return 0.5;
  return 0.3;
}

/**
 * 予算適合。
 * 手持ち商品は追加費用が発生しないため常に 1。
 * 買い足し候補は、予算内でより安いものを高く評価する（節約が目的のため）。
 */
export function budgetScore(
  product: Product,
  profile: Profile,
  owned: boolean,
): number {
  if (owned) return 1;
  if (profile.budgetYen <= 0) return 0;
  if (product.price > profile.budgetYen) return 0;
  const ratio = product.price / profile.budgetYen;
  return round4(1 - ratio * 0.4);
}

/** 使用感の一致度（避けたい使用感はハードフィルタ済みなので、ここは加点のみ） */
export function textureScore(product: Product, profile: Profile): number {
  const preferred = PREFERRED_TEXTURES[profile.skinType];
  if (preferred.length === 0) return 0.5;
  const hits = preferred.filter((t) => product.textureTags.includes(t)).length;
  return round4(Math.min(1, hits / 2));
}

/** 入手しやすさ。日本国内の一般流通を前提にした簡易指標。 */
export function availabilityScore(product: Product): number {
  const base = product.origin === "jp" ? 1 : product.origin === "kr" ? 0.75 : 0.5;
  const cheapBonus = product.price <= 1500 ? 0.2 : 0;
  return round4(Math.min(1, base + cheapBonus));
}

/** 注意要素ペナルティ。除外まではしないが、優先度を下げる。 */
export function cautionPenalty(product: Product, profile: Profile): number {
  let penalty = product.cautionTags.length * 0.02;
  if (profile.skinType === "sensitive") {
    const risky = product.cautionTags.filter(
      (c) =>
        c === "patch_test_recommended" ||
        c === "exfoliating" ||
        c === "contains_alcohol",
    ).length;
    penalty += risky * 0.05;
  }
  return round4(Math.min(0.15, penalty));
}

export function scoreProduct(
  product: Product,
  profile: Profile,
  ownedIds: ReadonlySet<string>,
): ScoredProduct {
  const owned = ownedIds.has(product.id);
  const breakdown: ScoreBreakdown = {
    concern: concernScore(product, profile),
    skin: skinScore(product, profile),
    owned: owned ? 1 : 0,
    budget: budgetScore(product, profile, owned),
    texture: textureScore(product, profile),
    availability: availabilityScore(product),
    cautionPenalty: cautionPenalty(product, profile),
    total: 0,
  };

  const weighted =
    breakdown.concern * WEIGHTS.concern +
    breakdown.skin * WEIGHTS.skin +
    breakdown.owned * WEIGHTS.owned +
    breakdown.budget * WEIGHTS.budget +
    breakdown.texture * WEIGHTS.texture +
    breakdown.availability * WEIGHTS.availability;

  breakdown.total = round4(Math.max(0, weighted - breakdown.cautionPenalty));

  return { product, score: breakdown.total, breakdown, owned };
}

/**
 * 決定論的な並び替え。
 * 同点時は「安い順 → id 昇順」で必ず一意に決まるようにする
 * （同じ入力から違う結果が出ないことが受け入れ条件のため）。
 */
export function sortScored(items: ScoredProduct[]): ScoredProduct[] {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.product.price !== b.product.price)
      return a.product.price - b.product.price;
    return a.product.id.localeCompare(b.product.id);
  });
}

export function scoreAll(
  products: readonly Product[],
  profile: Profile,
  ownedIds: ReadonlySet<string>,
): ScoredProduct[] {
  return sortScored(products.map((p) => scoreProduct(p, profile, ownedIds)));
}

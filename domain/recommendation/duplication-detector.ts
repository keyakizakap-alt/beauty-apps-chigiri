import type { Category } from "@/schemas/product";
import type { Duplication } from "@/schemas/recommendation";
import { CATEGORY_LABEL } from "./catalog";
import type { ScoredProduct } from "./scorer";

/**
 * 役割の重複検出。
 * CHIGIRI では「カテゴリー＝ルーティン上の役割」と定義し、
 * 同一カテゴリーに複数の手持ち商品がある場合を重複とみなす。
 *
 * 重複は「捨てるべき」ではなく「同時に使う必要がない」ものとして扱う。
 */

export type DuplicationResult = {
  duplications: Duplication[];
  /**
   * カテゴリーごとのスコア順の候補。
   * 1点に絞り込まないのは、朝夜で使用タイミングが異なる商品があるため。
   * （夜専用クリームと朝夜兼用乳液を両方持っている場合、
   *   前者だけを採用すると朝の保湿が空くという不具合になる）
   */
  groups: Map<Category, ScoredProduct[]>;
};

/** 使い分けの余地があるかを、使用感タグの差から判定する */
function differentiationNote(
  winner: ScoredProduct,
  loser: ScoredProduct,
): string | null {
  const w = new Set(winner.product.textureTags);
  const diff = loser.product.textureTags.filter((t) => !w.has(t));
  if (diff.includes("rich") || diff.includes("balm")) {
    return "乾燥が強い時期だけ入れ替える使い方もできます。";
  }
  if (diff.includes("light") || diff.includes("non_sticky")) {
    return "湿度が高い時期や皮脂が出やすい日に入れ替える使い方もできます。";
  }
  return null;
}

export function detectDuplications(
  scoredOwned: readonly ScoredProduct[],
): DuplicationResult {
  const groups = new Map<Category, ScoredProduct[]>();
  for (const item of scoredOwned) {
    const list = groups.get(item.product.category) ?? [];
    list.push(item);
    groups.set(item.product.category, list);
  }

  const duplications: Duplication[] = [];
  const sortedGroups = new Map<Category, ScoredProduct[]>();

  // Map の反復順に依存しないよう、カテゴリー名で安定化する
  const categories = [...groups.keys()].sort();

  for (const category of categories) {
    const list = groups.get(category)!;
    // scoredOwned は既にソート済みだが、念のためグループ内でも安定順にする
    const sorted = [...list].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.product.price !== b.product.price)
        return a.product.price - b.product.price;
      return a.product.id.localeCompare(b.product.id);
    });

    const winner = sorted[0];
    sortedGroups.set(category, sorted);

    if (sorted.length > 1) {
      const losers = sorted.slice(1);
      const extra = differentiationNote(winner, losers[0]);
      duplications.push({
        category,
        keptProductId: winner.product.id,
        duplicateProductIds: losers.map((l) => l.product.id),
        note:
          `${CATEGORY_LABEL[category]}の役割が${sorted.length}点で重なっています。` +
          `同じ工程に重ねて使う必要はないため、今回は「${winner.product.brand} ${winner.product.name}」を軸にしました。` +
          (extra ? `${extra}` : "残りは使い切ってから買い足しを検討すれば十分です。"),
      });
    }
  }

  return { duplications, groups: sortedGroups };
}

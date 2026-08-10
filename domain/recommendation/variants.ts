import type { Category } from "@/schemas/product";
import type { Profile } from "@/schemas/profile";
import type { RoutinePlan, RoutinePlanKind } from "@/schemas/recommendation";
import { buildRoutine, REQUIREMENTS } from "./routine-builder";
import type { ScoredProduct } from "./scorer";

/**
 * ルーティンの複数案。
 *
 * 単一の正解を押しつけないための仕組み。ただし「1000通り出す」ような
 * 見せ方はしない。実際に成立する組み立て方の数を数えたうえで、
 * 意味のある3案（標準・時短・じっくり）だけを提示する。
 *
 * 3案はいずれも同じ決定論的ロジックで、使える時間の前提だけを変えて
 * 組み立てている。工程の優先順位や商品の選び方は変えていないため、
 * 「案ごとに基準がぶれる」ことがない。
 */

/** 時短案で想定する所要時間（critical だけが残る短さ） */
const QUICK_MINUTES = 1;
/** じっくり案で想定する所要時間（工程数の上限に当たらない長さ） */
const FULL_MINUTES = 60;

const PLAN_META: Record<
  RoutinePlanKind,
  { label: string; description: (p: Profile) => string }
> = {
  standard: {
    label: "標準",
    description: (p) =>
      `入力いただいた朝${p.morningMinutes}分・夜${p.nightMinutes}分に収まるように組んだ、基本の並びです。`,
  },
  quick: {
    label: "時短",
    description: () =>
      "時間がない日のための最小構成です。省略しても成立する工程を外し、欠かせない工程だけを残しています。",
  },
  full: {
    label: "じっくり",
    description: () =>
      "時間に余裕がある日の構成です。手持ちの中で使える工程をできるだけ組み込み、買い足さずに活用しきることを優先しています。",
  },
};

export function buildPlans(
  groups: ReadonlyMap<Category, readonly ScoredProduct[]>,
  profile: Profile,
): RoutinePlan[] {
  const specs: Array<{ kind: RoutinePlanKind; profile: Profile }> = [
    { kind: "standard", profile },
    {
      kind: "quick",
      profile: {
        ...profile,
        morningMinutes: QUICK_MINUTES,
        nightMinutes: QUICK_MINUTES,
      },
    },
    {
      kind: "full",
      profile: {
        ...profile,
        morningMinutes: FULL_MINUTES,
        nightMinutes: FULL_MINUTES,
      },
    },
  ];

  const plans: RoutinePlan[] = [];
  const seen = new Set<string>();

  for (const spec of specs) {
    const morning = buildRoutine("morning", groups, spec.profile);
    const night = buildRoutine("night", groups, spec.profile);

    const steps = [...morning.routine.steps, ...night.routine.steps];

    // 中身が同じ案は出さない。
    // 例えば朝1分と入力された場合、標準と時短は同じ並びになる。
    const signature = steps.map((s) => `${s.category}:${s.productId}`).join("|");
    if (seen.has(signature)) continue;
    seen.add(signature);

    const usedProductIds = new Set(steps.map((s) => s.productId));

    plans.push({
      kind: spec.kind,
      label: PLAN_META[spec.kind].label,
      description: PLAN_META[spec.kind].description(profile),
      routines: { morning: morning.routine, night: night.routine },
      totalSteps: steps.length,
      totalMinutes:
        morning.routine.estimatedMinutes + night.routine.estimatedMinutes,
      ownedUsedCount: [...usedProductIds].filter((id) =>
        profile.ownedProductIds.includes(id),
      ).length,
    });
  }

  return plans;
}

/**
 * 手持ちから成立する組み立て方の総数。
 *
 * 数え方（画面にもこの定義で説明する）:
 * - 朝・夜それぞれの各工程について、その時間帯に使える手持ち商品から1つを選ぶ
 * - 省略してよい工程（critical 以外）は「使わない」も1通りとして数える
 * - 使える商品が無い工程は1通り（不足のまま）として数える
 *
 * 実際に提示するのは、この中からスコア順に選んだ3案だけ。
 * 「たくさんの中から選んでいる」ことを、数字の裏付き付きで示すための値。
 */
export function countArrangements(
  groups: ReadonlyMap<Category, readonly ScoredProduct[]>,
): number {
  let total = 1;

  for (const timing of ["morning", "night"] as const) {
    for (const req of REQUIREMENTS[timing]) {
      const usable = (groups.get(req.category) ?? []).filter((c) =>
        c.product.usageTiming.includes(timing),
      ).length;

      if (usable === 0) continue; // 1通り（不足のまま）なので掛けない

      // 省略可能な工程は「使わない」も選択肢に含める
      total *= req.severity === "critical" ? usable : usable + 1;
    }
  }

  return total;
}

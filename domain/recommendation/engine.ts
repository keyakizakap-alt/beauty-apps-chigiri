import type { Category, Product } from "@/schemas/product";
import type { Profile } from "@/schemas/profile";
import type {
  Evidence,
  Gap,
  PurchaseSuggestion,
  Recommendation,
  Savings,
  UnusedProduct,
} from "@/schemas/recommendation";
import {
  CATEGORY_LABEL,
  CATEGORY_MEDIAN_PRICE,
  PRODUCTS,
  claimSentence,
  claimText,
  getProduct,
  getProducts,
} from "./catalog";
import { applyHardFilters } from "./filters";
import { detectDuplications } from "./duplication-detector";
import { buildRoutine, CONCERN_LABEL } from "./routine-builder";
import { scoreAll, scoreProduct, sortScored, type ScoredProduct } from "./scorer";
import { DISCLAIMER, INGREDIENT_UNCERTAINTY_NOTE } from "./safety-rules";

/**
 * 決定論的推薦パイプライン。
 * ここには LLM 呼び出しが一切存在しない。
 * AI が完全に落ちても、この関数の出力だけでルーティンは表示できる。
 *
 * 1. 手持ち商品の解決
 * 2. ハードフィルタ（アレルギー・避けたい使用感）
 * 3. スコアリング
 * 4. 役割重複の検出
 * 5. 朝・夜ルーティン生成（工程数を使用可能時間に合わせる）
 * 6. 不足カテゴリー検出
 * 7. 必要な場合のみ買い足し候補を決定
 * 8. 節約効果の算出
 */
export type EngineResult = {
  recommendation: Omit<Recommendation, "ai">;
  /** LLM に渡すための候補 ID 一覧（カタログ外 ID の混入を検知するため） */
  allowedProductIds: string[];
};

export function buildRecommendation(profile: Profile): EngineResult {
  // 1. 手持ち商品の解決（カタログにない ID は静かに無視せず、除外理由に残す）
  const ownedProducts = getProducts(profile.ownedProductIds);
  const ownedIds = new Set(ownedProducts.map((p) => p.id));

  // 2. ハードフィルタ
  const { passed: ownedPassed, excluded: ownedExcluded } = applyHardFilters(
    ownedProducts,
    profile,
  );

  const unused: UnusedProduct[] = ownedExcluded.map((e) => ({
    productId: e.product.id,
    reasonCode: e.reasonCode,
    reason: e.reason,
  }));

  // 3. スコアリング
  const scoredOwned = scoreAll(ownedPassed, profile, ownedIds);

  // 4. 役割重複の検出（絞り込みはせず、カテゴリー別のスコア順候補を作る）
  const { duplications, groups } = detectDuplications(scoredOwned);

  // 5. 朝・夜ルーティン
  const morning = buildRoutine("morning", groups, profile);
  const night = buildRoutine("night", groups, profile);

  const usedIds = new Set<string>([
    ...morning.routine.steps.map((s) => s.productId),
    ...night.routine.steps.map((s) => s.productId),
  ]);

  // ルーティン確定後に、使わなかった手持ち商品の理由を確定させる。
  // 朝夜どちらかで使われた商品は「使わなかった商品」ではない。
  const trimmedById = new Map(
    [...morning.trimmed, ...night.trimmed].map((t) => [t.productId, t]),
  );
  for (const item of scoredOwned) {
    const id = item.product.id;
    if (usedIds.has(id)) continue;

    const category = item.product.category;
    const sameCategoryUsed = [...usedIds].some(
      (used) => getProduct(used)?.category === category,
    );

    if (sameCategoryUsed) {
      const dup = duplications.find((d) => d.duplicateProductIds.includes(id));
      unused.push({
        productId: id,
        reasonCode: "duplicate_role",
        reason: dup
          ? `${CATEGORY_LABEL[category]}の役割が重複しているため、今回のルーティンでは使用しません。${dup.note}`
          : `${CATEGORY_LABEL[category]}の役割はすでに他の商品でカバーできているため、今回は使用しません。`,
      });
      continue;
    }

    const trimmed = trimmedById.get(id);
    if (trimmed) {
      unused.push(trimmed);
      continue;
    }

    unused.push({
      productId: id,
      reasonCode: "timing_mismatch",
      reason: `公式に案内されている使用タイミングが${item.product.usageTiming
        .map((t) => (t === "morning" ? "朝" : "夜"))
        .join("・")}で、その時間帯の${CATEGORY_LABEL[category]}の工程が今回のルーティンに含まれていないため、使用しません。`,
    });
  }

  // 6. 不足カテゴリー（朝夜をまとめ、重複を排除）
  const gaps = dedupeGaps([...morning.gaps, ...night.gaps]);

  // 7. 買い足し候補
  const { suggestions, noPurchaseNeededReason } = decidePurchases(
    gaps,
    profile,
    ownedIds,
    groups,
  );

  // 8. 節約効果
  const savings = computeSavings({
    ownedProducts,
    usedIds,
    suggestions,
  });

  const usedProducts = [
    ...getProducts([...usedIds]),
    ...suggestions.map((s) => s.product),
  ];

  const evidence: Evidence[] = usedProducts.map((p) => ({
    productId: p.id,
    brand: p.brand,
    name: p.name,
    officialUrl: p.officialUrl,
    sourceCheckedAt: p.sourceCheckedAt,
    dataConfidence: p.dataConfidence,
    claims: p.allowedClaims
      .map((c) => claimText(c))
      .filter((t): t is string => Boolean(t)),
  }));

  const totalSteps = morning.routine.steps.length + night.routine.steps.length;

  const recommendation: Omit<Recommendation, "ai"> = {
    summary: buildSummary({
      profile,
      savings,
      suggestions: suggestions.map((s) => s.suggestion),
      duplications: duplications.length,
    }),
    routines: { morning: morning.routine, night: night.routine },
    duplications,
    unused,
    gaps,
    purchaseSuggestion: suggestions[0]?.suggestion ?? null,
    purchaseSuggestions: suggestions.slice(1).map((s) => s.suggestion),
    noPurchaseNeededReason,
    totalSteps,
    savings,
    evidence,
    safety: [{ level: "info", message: INGREDIENT_UNCERTAINTY_NOTE }],
    disclaimer: DISCLAIMER,
    products: dedupeProducts([
      ...ownedProducts,
      ...suggestions.map((s) => s.product),
    ]),
  };

  return {
    recommendation,
    allowedProductIds: usedProducts.map((p) => p.id),
  };
}

/* ------------------------------------------------------------------ */

function dedupeGaps(gaps: Gap[]): Gap[] {
  const seen = new Set<string>();
  const out: Gap[] = [];
  for (const g of gaps) {
    const key = `${g.category}:${g.timing}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(g);
  }
  // critical を先に出す（デモで最初に見せたいのは致命的な不足のため）
  return out.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return a.category.localeCompare(b.category);
  });
}

function dedupeProducts(products: Product[]): Product[] {
  const map = new Map<string, Product>();
  for (const p of products) map.set(p.id, p);
  return [...map.values()];
}

type DecidedPurchase = { suggestion: PurchaseSuggestion; product: Product };

function decidePurchases(
  gaps: Gap[],
  profile: Profile,
  ownedIds: ReadonlySet<string>,
  groups: ReadonlyMap<Category, readonly ScoredProduct[]>,
): { suggestions: DecidedPurchase[]; noPurchaseNeededReason: string | null } {
  const missingCategories = dedupeCategories(gaps);

  if (missingCategories.length === 0) {
    return {
      suggestions: [],
      noPurchaseNeededReason:
        `手持ちの商品だけで朝・夜のルーティンに必要な役割がそろっています。` +
        `${[...groups.keys()].map((c) => CATEGORY_LABEL[c]).join("・")}がカバーできているため、今回は買い足しは必要ありません。`,
    };
  }

  if (!profile.allowPurchase || profile.maxNewItems === 0) {
    return {
      suggestions: [],
      noPurchaseNeededReason:
        `${missingCategories.map((c) => CATEGORY_LABEL[c]).join("・")}の役割が不足していますが、` +
        `「追加購入しない」設定のため商品の提案は行いません。手持ちの範囲で組めるルーティンを表示しています。`,
    };
  }

  const suggestions: DecidedPurchase[] = [];
  const takenCategories = new Set<string>();

  for (const category of missingCategories) {
    if (suggestions.length >= profile.maxNewItems) break;
    if (takenCategories.has(category)) continue;

    const spent = suggestions.reduce((s, x) => s + x.product.price, 0);
    const remaining = profile.budgetYen - spent;

    const pool = PRODUCTS.filter(
      (p) => p.category === category && !ownedIds.has(p.id),
    );
    const { passed } = applyHardFilters(pool, profile);
    const affordable = passed.filter((p) => p.price <= remaining);

    if (affordable.length === 0) continue;

    const ranked = sortScored(
      affordable.map((p) => scoreProduct(p, profile, ownedIds)),
    );
    const best = ranked[0];

    takenCategories.add(category);
    suggestions.push({
      product: best.product,
      suggestion: {
        productId: best.product.id,
        category,
        price: best.product.price,
        score: best.score,
        runnerUpIds: ranked.slice(1, 3).map((r) => r.product.id),
        reason: buildPurchaseReason(best, profile, category, remaining),
      },
    });
  }

  if (suggestions.length === 0) {
    return {
      suggestions: [],
      noPurchaseNeededReason:
        `${missingCategories.map((c) => CATEGORY_LABEL[c]).join("・")}の役割が不足していますが、` +
        `予算${profile.budgetYen.toLocaleString()}円と除外条件の範囲で提案できる商品がカタログ内に見つかりませんでした。` +
        `予算を上げるか、避けたい条件を見直すと候補が出る可能性があります。`,
    };
  }

  return { suggestions, noPurchaseNeededReason: null };
}

function dedupeCategories(gaps: Gap[]): Category[] {
  const seen = new Set<Category>();
  const out: Category[] = [];
  for (const g of gaps) {
    if (seen.has(g.category)) continue;
    seen.add(g.category);
    out.push(g.category);
  }
  return out;
}

function buildPurchaseReason(
  best: ScoredProduct,
  profile: Profile,
  category: Category,
  remainingBudget: number,
): string {
  const p = best.product;
  const matched = profile.concerns.filter((c) => p.concernTags.includes(c));
  const bits: string[] = [
    `${CATEGORY_LABEL[category]}の役割が手持ちにないため、この1点だけを買い足す想定です`,
  ];
  if (matched.length > 0) {
    bits.push(
      `関心として挙げた${matched.map((c) => CONCERN_LABEL[c]).join("・")}に対応するタグがあります`,
    );
  }
  if (p.skinTags.includes(profile.skinType)) {
    bits.push("肌傾向に合う表示があります");
  }
  bits.push(
    `価格は${p.price.toLocaleString()}円で、残り予算${remainingBudget.toLocaleString()}円に収まります`,
  );
  return `${bits.join("。")}。公式に確認できる表現は「${claimSentence(p)}」です。`;
}

function computeSavings(args: {
  ownedProducts: Product[];
  usedIds: Set<string>;
  suggestions: DecidedPurchase[];
}): Savings {
  const { ownedProducts, usedIds, suggestions } = args;

  const ownedUsed = ownedProducts.filter((p) => usedIds.has(p.id));
  const ownedTotalCount = ownedProducts.length;
  const ownedUsedCount = ownedUsed.length;

  // 「全部を新しく買いそろえた場合」との差分。
  // 手持ちで満たせたカテゴリー数 × そのカテゴリーの中央価格を回避できた支出とみなす。
  const coveredCategories = new Set<Category>(ownedUsed.map((p) => p.category));
  const avoidedItemCount = coveredCategories.size;
  const avoidedCostYen = [...coveredCategories].reduce(
    (sum, c) => sum + CATEGORY_MEDIAN_PRICE[c],
    0,
  );

  return {
    ownedUsedCount,
    ownedTotalCount,
    utilizationRate:
      ownedTotalCount === 0
        ? 0
        : Math.round((ownedUsedCount / ownedTotalCount) * 100) / 100,
    newItemCount: suggestions.length,
    additionalCostYen: suggestions.reduce((s, x) => s + x.product.price, 0),
    avoidedItemCount,
    avoidedCostYen,
  };
}

function buildSummary(args: {
  profile: Profile;
  savings: Savings;
  suggestions: PurchaseSuggestion[];
  duplications: number;
}): string {
  const { savings, suggestions } = args;

  if (savings.ownedTotalCount === 0) {
    return "手持ちの商品がまだ登録されていません。お持ちの化粧品を選ぶと、買い足しを最小限にしたルーティンを組み立てます。";
  }

  const head = `手持ち${savings.ownedTotalCount}商品のうち${savings.ownedUsedCount}商品を活用できます。`;

  const buy =
    suggestions.length === 0
      ? "新しく買い足す必要はありません。"
      : `新しく必要なのは${suggestions
          .map((s) => CATEGORY_LABEL[s.category])
          .join("と")}${suggestions.length}点だけです。`;

  const save =
    savings.avoidedItemCount > 0
      ? `全部を買いそろえた場合と比べて、${savings.avoidedItemCount}点・約${savings.avoidedCostYen.toLocaleString()}円の購入を避けられます。`
      : "";

  return `${head}${buy}${save}`;
}

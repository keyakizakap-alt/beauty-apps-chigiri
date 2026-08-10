import type { Category, Product } from "@/schemas/product";
import type { Profile } from "@/schemas/profile";
import type {
  ComparisonRow,
  OfferComparison,
  TippingPoint,
} from "@/schemas/commerce";
import {
  CATEGORY_LABEL,
  PRODUCTS,
  claimText,
} from "@/domain/recommendation/catalog";
import { applyHardFilters } from "@/domain/recommendation/filters";
import { CONCERN_LABEL } from "@/domain/recommendation/routine-builder";
import { scoreProduct, sortScored } from "@/domain/recommendation/scorer";
import type { CommerceAdapter, SearchedOffer } from "./adapter";
import { buildOffer, chargeableYen } from "./static-adapter";

/**
 * 候補比較の組み立て。
 *
 * ここで守ること:
 * - 採用理由だけでなく、選ばなかった候補それぞれについて理由を必ず書く。
 * - 提携報酬（affiliate）は順位計算に一切入れない。表示のみ。
 * - 予算内に候補が無い場合、無理に候補を出さず理由を説明する。
 */

const CAUTION_LABEL: Record<string, string> = {
  contains_alcohol: "アルコール（エタノール）を含みます",
  contains_fragrance: "香料を含みます",
  contains_essential_oil: "精油を含みます",
  exfoliating: "角質ケア成分を含みます",
  reapply_needed: "こまめな塗り直しが前提です",
  patch_test_recommended: "パッチテストが推奨されています",
  may_feel_heavy: "重く感じる場合があります",
  may_feel_drying: "乾燥を感じる場合があります",
};

export async function buildComparison(args: {
  adapter: CommerceAdapter;
  profile: Profile;
  category: Category;
  limit: number;
}): Promise<OfferComparison> {
  const { adapter, profile, category, limit } = args;

  const found = await adapter.searchProducts({
    category,
    profile,
    maxYen: profile.budgetYen,
    excludeProductIds: profile.ownedProductIds,
    limit,
  });

  const declineOutcome = buildDeclineOutcome(category, profile);

  if (found.length === 0) {
    return {
      category,
      rows: [],
      emptyReason: buildEmptyReason(category, profile),
      tippingPoint: computeTippingPoint({ profile, category, current: null }),
      declineOutcome,
    };
  }

  const rows = found.map((f, index) =>
    buildRow(f, index === 0, found[0], profile),
  );

  return {
    category,
    rows,
    emptyReason: null,
    tippingPoint: computeTippingPoint({
      profile,
      category,
      current: found[0],
    }),
    declineOutcome,
  };
}

function buildRow(
  item: SearchedOffer,
  selected: boolean,
  winner: SearchedOffer,
  profile: Profile,
): ComparisonRow {
  const p = item.product;

  const claims = p.allowedClaims
    .map((c) => claimText(c))
    .filter((t): t is string => Boolean(t));

  return {
    offer: item.offer,
    productName: p.name,
    brand: p.brand,
    volume: p.volume ?? null,
    score: Math.round(item.score * 1000) / 1000,
    selected,
    reason: selected ? buildChosenReason(item, profile) : null,
    notChosenReason: selected ? null : buildNotChosenReason(item, winner, profile),
    highlights: buildHighlights(p, profile),
    cautions: p.cautionTags.map((c) => CAUTION_LABEL[c] ?? c),
    claims,
  };
}

function buildHighlights(p: Product, profile: Profile): string[] {
  const out: string[] = [];

  const matchedConcerns = profile.concerns.filter((c) =>
    p.concernTags.includes(c),
  );
  if (matchedConcerns.length > 0) {
    out.push(
      `${matchedConcerns.map((c) => CONCERN_LABEL[c]).join("・")}に対応するタグ`,
    );
  }
  if (p.skinTags.includes(profile.skinType)) {
    out.push("肌傾向に合う表示あり");
  }
  if (p.cautionTags.length === 0) {
    out.push("注意タグなし");
  }
  if (p.volume) out.push(`容量 ${p.volume}`);
  return out;
}

function buildChosenReason(item: SearchedOffer, profile: Profile): string {
  const p = item.product;
  const bits: string[] = [];

  const matched = profile.concerns.filter((c) => p.concernTags.includes(c));
  if (matched.length > 0) {
    bits.push(
      `挙げていただいた${matched.map((c) => CONCERN_LABEL[c]).join("・")}に対応するタグがあること`,
    );
  }
  if (p.skinTags.includes(profile.skinType)) {
    bits.push("肌傾向に合う表示があること");
  }
  bits.push(
    `価格が${p.price.toLocaleString()}円で、予算${profile.budgetYen.toLocaleString()}円に収まること`,
  );

  return `${bits.join("、")}から、この候補を最上位にしました。`;
}

/**
 * 選ばなかった理由。
 * 「スコアが低いから」で終わらせず、どの軸で差がついたかを書く。
 */
function buildNotChosenReason(
  item: SearchedOffer,
  winner: SearchedOffer,
  profile: Profile,
): string {
  const p = item.product;
  const w = winner.product;
  const reasons: string[] = [];

  const myConcerns = profile.concerns.filter((c) => p.concernTags.includes(c));
  const winConcerns = profile.concerns.filter((c) => w.concernTags.includes(c));
  if (winConcerns.length > myConcerns.length) {
    const diff = winConcerns.filter((c) => !myConcerns.includes(c));
    if (diff.length > 0) {
      reasons.push(
        `${diff.map((c) => CONCERN_LABEL[c]).join("・")}に対応するタグがこちらには無いため`,
      );
    }
  }

  if (!p.skinTags.includes(profile.skinType) && w.skinTags.includes(profile.skinType)) {
    reasons.push("肌傾向に合う表示が確認できなかったため");
  }

  const priceDiff = p.price - w.price;
  if (priceDiff > 0) {
    reasons.push(
      `価格が${priceDiff.toLocaleString()}円高く、同じ役割に対して追加費用が増えるため`,
    );
  }

  const extraCautions = p.cautionTags.filter((c) => !w.cautionTags.includes(c));
  if (extraCautions.length > 0) {
    reasons.push(
      `${extraCautions.map((c) => CAUTION_LABEL[c] ?? c).join("・")}という注意点が加わるため`,
    );
  }

  if (reasons.length === 0) {
    // 差が僅差のときに理由を作文しない。同点処理の規則をそのまま説明する。
    reasons.push(
      `評価はほぼ同等でしたが、同点の場合は価格が安い方・工程が増えない方を選ぶ規則にしているため`,
    );
  }

  return `${reasons.join("、")}、今回は選びませんでした。`;
}

function buildEmptyReason(category: Category, profile: Profile): string {
  const label = CATEGORY_LABEL[category];
  const pool = PRODUCTS.filter(
    (p) => p.category === category && !profile.ownedProductIds.includes(p.id),
  );
  const { passed, excluded } = applyHardFilters(pool, profile);

  if (passed.length === 0 && excluded.length > 0) {
    return (
      `${label}の候補は、避けたい条件（${excluded.length}件が該当）にすべて当てはまったため提案できませんでした。` +
      `避けたい条件を見直すと候補が出る可能性があります。`
    );
  }

  const cheapest = [...passed].sort((a, b) => a.price - b.price)[0];
  if (cheapest) {
    return (
      `${label}の役割は不足していますが、予算${profile.budgetYen.toLocaleString()}円に収まる候補がありません。` +
      `カタログ内の最安は${cheapest.price.toLocaleString()}円です。今回は買わずに、手持ちの範囲で組む方法もあります。`
    );
  }

  return `${label}の候補が現在のカタログにありません。今回は買い足しをおすすめしません。`;
}

function buildDeclineOutcome(category: Category, profile: Profile): string {
  const label = CATEGORY_LABEL[category];
  if (category === "sunscreen") {
    return (
      `買わない場合、${label}の工程は空いたままになります。` +
      `日中の紫外線対策は日傘・帽子・衣類でも補えるため、すぐに購入しなくてもルーティン自体は続けられます。`
    );
  }
  return (
    `買わない場合、${label}の工程は空いたままになりますが、` +
    `手持ち${profile.ownedProductIds.length}点で組んだ朝・夜のルーティンはそのまま続けられます。` +
    `不足を感じてから買い足す判断でも問題ありません。`
  );
}

/* ------------------------------------------------------------------ *
 * 反実仮想: 予算の転換点
 * ------------------------------------------------------------------ */

/**
 * 「予算をいくらにすると結論が変わるか」を決定論的に求める。
 *
 * - いま候補が出ていない場合: いくらまで上げれば最初の候補が出るか
 * - いま候補が出ている場合  : いくらまで下げると別の商品に変わる／候補が消えるか
 *
 * 予算はスコアの budget 項に効くため、単に価格を比べるだけでは答えが出ない。
 * 候補になり得る価格（各商品の価格そのもの）を境界候補として列挙し、
 * その予算で実際に選定をやり直して結果が変わる点を探す。
 */
export function computeTippingPoint(args: {
  profile: Profile;
  category: Category;
  current: SearchedOffer | null;
}): TippingPoint {
  const { profile, category, current } = args;

  const owned = new Set(profile.ownedProductIds);
  const pool = PRODUCTS.filter(
    (p) => p.category === category && !owned.has(p.id),
  );
  const { passed } = applyHardFilters(pool, profile);

  if (passed.length === 0) {
    return {
      kind: "none",
      budgetYen: null,
      productId: null,
      message:
        "避けたい条件に当てはまらない候補がこのカテゴリーにないため、予算を変えても提案は変わりません。",
    };
  }

  // 選定を予算だけ変えて再実行する
  const pick = (budgetYen: number): Product | null => {
    const affordable = passed.filter((p) => payableYen(p) <= budgetYen);
    if (affordable.length === 0) return null;
    const ranked = sortScored(
      affordable.map((p) => scoreProduct(p, { ...profile, budgetYen }, owned)),
    );
    return ranked[0]?.product ?? null;
  };

  // 境界になり得るのは各商品の価格ちょうど（そこで買えるかどうかが変わる）
  const prices = [...new Set(passed.map((p) => p.price))].sort((a, b) => a - b);

  if (!current) {
    // 候補ゼロ → 最初に候補が出る予算
    for (const price of prices) {
      const product = pick(price);
      if (product) {
        return {
          kind: "budget_up",
          budgetYen: price,
          productId: product.id,
          message:
            `予算を${price.toLocaleString()}円まで上げると、` +
            `${product.brand} ${product.name}が候補に入ります。いまの予算のままなら、買わずに続ける選択になります。`,
        };
      }
    }
    return {
      kind: "none",
      budgetYen: null,
      productId: null,
      message: "予算を変えても、この条件で提案できる商品はありません。",
    };
  }

  // 候補あり → 予算を下げていって結論が変わる点
  const currentId = current.product.id;
  const below = prices.filter((p) => p < profile.budgetYen).sort((a, b) => b - a);

  for (const price of below) {
    const product = pick(price);
    if (!product) {
      return {
        kind: "budget_down",
        budgetYen: price,
        productId: null,
        message:
          `予算を${price.toLocaleString()}円より下げると、この条件で買える候補が無くなり、` +
          `「今回は買わない」という結論になります。`,
      };
    }
    if (product.id !== currentId) {
      return {
        kind: "budget_down",
        budgetYen: price,
        productId: product.id,
        message:
          `予算を${price.toLocaleString()}円に下げると、提案は${product.brand} ${product.name}` +
          `（${product.price.toLocaleString()}円）に変わります。役割は同じで、容量と使用感が変わります。`,
      };
    }
  }

  return {
    kind: "none",
    budgetYen: null,
    productId: currentId,
    message:
      "予算を上下させても、この条件では同じ商品が選ばれます。予算の設定はいまの結論に影響していません。",
  };
}

/**
 * 予算判定に使う支払額。
 * 送料が確認できている販売者なら送料込み、確認できていなければ商品価格のみ。
 * 販売者を解決できない商品（起動時検証で弾かれるはずの状態）は
 * 商品価格で評価し、候補としては searchProducts 側で落ちる。
 */
function payableYen(p: Product): number {
  const offer = buildOffer(p);
  return offer ? chargeableYen(offer) : p.price;
}

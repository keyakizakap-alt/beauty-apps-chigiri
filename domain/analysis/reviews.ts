import type { Product } from "@/schemas/product";

/**
 * 利用者の声（口コミ）の取り扱い。
 *
 * 方針:
 * - 口コミは絶対に生成しない。実在しない感想を作ることは、
 *   このプロダクトが最も避けるべきことにあたる。
 * - @cosme・楽天市場などの口コミは各社の著作物であり、
 *   無断で取得・転載しない。公式に提供される API と利用許諾が必要になる。
 * - したがって既定は「未接続」。接続されるまでは、その事実をそのまま表示する。
 *
 * 実装済みなのは接続口（アダプタの形）だけで、
 * 実際の取得処理はまだどの提供元にも接続していない。
 */

export type Review = {
  /** 提供元（表示に必須。出典の無い口コミは扱わない） */
  sourceName: string;
  sourceUrl: string;
  /** 5段階などの評価。提供元が出していない場合は null */
  rating: number | null;
  ratingScale: number | null;
  /** 件数 */
  count: number | null;
  /** 取得日時 */
  fetchedAt: string;
};

export type ReviewLookup =
  | { status: "connected"; review: Review }
  | {
      status: "not_connected";
      /** なぜ出せないのか。画面にそのまま出す。 */
      reason: string;
      /** 利用者が自分で確認しに行けるように、検索先だけは案内する */
      searchLinks: Array<{ label: string; url: string }>;
    };

/**
 * 口コミの提供元。
 * 実装を差し替えられるようにインターフェースだけ定義しておく。
 */
export type ReviewSource = {
  id: string;
  name: string;
  /** 利用許諾と API の設定が済んでいるか */
  isConfigured(): boolean;
  lookup(product: Product): Promise<Review | null>;
};

/**
 * 現時点で設定されている提供元。
 *
 * 空のままにしているのは、実際に接続できていないため。
 * ここに未検証の実装を置いて「接続済み」に見せることはしない。
 */
export const REVIEW_SOURCES: readonly ReviewSource[] = [];

/** 利用者が自分で確認しに行くための検索リンク（口コミの転載ではない） */
export function searchLinksFor(
  product: Product,
): Array<{ label: string; url: string }> {
  const q = encodeURIComponent(`${product.brand} ${product.name}`);
  return [
    {
      label: "@cosme で検索",
      url: `https://www.cosme.net/search/keyword/${q}/`,
    },
    {
      label: "楽天市場で検索",
      url: `https://search.rakuten.co.jp/search/mall/${q}/`,
    },
  ];
}

const NOT_CONNECTED_REASON =
  "口コミの提供元にはまだ接続していません。@cosme や楽天市場の口コミは各社の著作物のため、" +
  "公式に提供される API と利用許諾を得たうえでなければ表示できません。" +
  "許諾のない取得や、AIによる口コミの生成は行いません。";

export async function lookupReviews(product: Product): Promise<ReviewLookup> {
  const source = REVIEW_SOURCES.find((s) => s.isConfigured());

  if (!source) {
    return {
      status: "not_connected",
      reason: NOT_CONNECTED_REASON,
      searchLinks: searchLinksFor(product),
    };
  }

  const review = await source.lookup(product);
  if (!review) {
    return {
      status: "not_connected",
      reason: `${source.name} にこの商品の口コミが見つかりませんでした。`,
      searchLinks: searchLinksFor(product),
    };
  }

  return { status: "connected", review };
}

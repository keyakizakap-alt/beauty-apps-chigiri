import type { Product } from "@/schemas/product";
import { checkExternalUrl } from "./url-allowlist";

/**
 * 購入先へのリンク生成。
 *
 * 前提として、カタログの `officialUrl` はブランドのサイトを指しており、
 * 商品ページそのものとは限らない。個別ページの URL を確認できていない段階で
 * それらしい URL を組み立てると、404 になるか別商品へ飛ぶ。
 *
 * そこで次の順で扱う:
 *   1. `productPageUrl` が入っていれば、それを商品ページとして使う（確認済みのみ）
 *   2. 無い場合は、各ショップの検索結果へ商品名で送る
 *      （組み立て方が公開されている形式なので、確実に開ける）
 *
 * 「商品ページ」と「検索結果」を UI 上で言い分けるため、種別を返す。
 */

export type PurchaseLinkKind = "product_page" | "search" | "brand_site";

export type PurchaseLink = {
  kind: PurchaseLinkKind;
  /** 表示名（どこへ行くのか分かる文言） */
  label: string;
  url: string;
  /** 販売店の識別子 */
  shop: "official" | "rakuten" | "amazon" | "yahoo";
  /** 提携報酬の有無。順位計算には一切使わない。 */
  affiliate: boolean;
};

/** 検索に使う語。ブランド名と商品名だけを使い、余計な語を足さない。 */
export function searchQuery(product: Product): string {
  return `${product.brand} ${product.name}`.replace(/\s+/g, " ").trim();
}

/**
 * 各ショップの検索 URL。
 * 形式が公開されているものだけを使い、商品 ID の推測はしない。
 */
const SEARCH_BUILDERS: Array<{
  shop: PurchaseLink["shop"];
  label: string;
  build: (q: string) => string;
}> = [
  {
    shop: "rakuten",
    label: "楽天市場で探す",
    build: (q) => `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/`,
  },
  {
    shop: "amazon",
    label: "Amazonで探す",
    build: (q) => `https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}`,
  },
  {
    shop: "yahoo",
    label: "Yahoo!ショッピングで探す",
    build: (q) => `https://shopping.yahoo.co.jp/search?p=${encodeURIComponent(q)}`,
  },
];

/**
 * 商品に対する購入導線を組み立てる。
 * 許可リストを通らない URL は落とすため、ここで返るものはすべて遷移できる。
 */
export function purchaseLinksFor(product: Product): PurchaseLink[] {
  const links: PurchaseLink[] = [];
  const query = searchQuery(product);

  // 1. 確認済みの商品ページがあれば最優先
  if (product.productPageUrl) {
    links.push({
      kind: "product_page",
      label: "公式の商品ページを見る",
      url: product.productPageUrl,
      shop: "official",
      affiliate: false,
    });
  } else {
    // 2. 無い場合はブランドサイトへ。商品ページではないことが分かる文言にする。
    links.push({
      kind: "brand_site",
      label: "ブランド公式サイトを見る",
      url: product.officialUrl,
      shop: "official",
      affiliate: false,
    });
  }

  // 3. 購入できる場所（検索結果）
  for (const builder of SEARCH_BUILDERS) {
    links.push({
      kind: "search",
      label: builder.label,
      url: builder.build(query),
      shop: builder.shop,
      affiliate: false,
    });
  }

  // 許可リストを通らないものは出さない（遷移できないリンクを見せない）
  return links.filter((l) => checkExternalUrl(l.url).ok);
}

/** 商品ページの URL が確認済みか（UI で「未確認」を出すため） */
export function hasVerifiedProductPage(product: Product): boolean {
  return Boolean(product.productPageUrl);
}

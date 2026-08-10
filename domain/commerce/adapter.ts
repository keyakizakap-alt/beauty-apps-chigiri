import type { Category, Product } from "@/schemas/product";
import type { Profile } from "@/schemas/profile";
import type {
  OfferValidation,
  ProductOffer,
  PurchaseHandoff,
} from "@/schemas/commerce";

/**
 * 設計書 §11 の CommerceAdapter。
 *
 * 将来 ACP / UCP や実際の EC API へ差し替えられるように、
 * 呼び出し側（API ルート・UI）はこのインターフェースだけに依存する。
 * 実装の交換で壊れないよう、戻り値には販売者・確認時刻・未確認項目を必ず含める。
 */

export type ProductSearchInput = {
  category: Category;
  profile: Profile;
  /** 上限額（円）。送料が確認できる場合は送料込みで判定する。 */
  maxYen: number;
  /** 除外する商品 ID（手持ちなど） */
  excludeProductIds: readonly string[];
  limit: number;
};

export type SearchedOffer = {
  offer: ProductOffer;
  product: Product;
  score: number;
};

export type HandoffInput = {
  offerId: string;
  profile: Profile;
  /** ユーザーが承認画面で見ていた価格。サーバーの再計算とずれたら承認しない。 */
  acknowledgedPriceYen: number;
  acknowledgedUnverified: boolean;
};

export type HandoffResult =
  | { ok: true; handoff: PurchaseHandoff; validation: OfferValidation }
  | { ok: false; validation: OfferValidation };

export interface CommerceAdapter {
  readonly id: string;
  searchProducts(input: ProductSearchInput): Promise<SearchedOffer[]>;
  getOffer(offerId: string): Promise<ProductOffer | null>;
  /** 承認直前の再検証。価格・在庫・予算・許可リストをもう一度確かめる。 */
  validateOffer(offerId: string, profile: Profile): Promise<OfferValidation>;
  createHandoff(input: HandoffInput): Promise<HandoffResult>;
}

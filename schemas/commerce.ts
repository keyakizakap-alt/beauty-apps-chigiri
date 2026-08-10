import { z } from "zod";
import { CategorySchema } from "./product";
import { ProfileSchema } from "./profile";

/**
 * エージェンティックコマース層のスキーマ。
 *
 * 設計上の原則:
 * - 価格・在庫・送料・配送日を推測しない。確認できていない項目は null のままにし、
 *   `unverified` に項目名を残して UI で「未確認」と表示する。
 * - 商品 URL はサーバー側のカタログからのみ生成する。クライアントから受け取った
 *   URL を遷移先に使わない（オープンリダイレクト防止）。
 */

/* ------------------------------------------------------------------ *
 * 販売者
 * ------------------------------------------------------------------ */

export const MerchantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** brand_official = ブランド自身の公式サイト */
  kind: z.enum(["brand_official", "authorized_retailer"]),
  /** 遷移を許可するホスト（完全一致、またはドット境界のサブドメイン） */
  hosts: z.array(z.string().min(1)).min(1),
  /** 公式に確認できた送料。確認できていない場合は null（0 円と混同しない） */
  shippingFeeYen: z.number().int().nonnegative().nullable(),
  returnPolicyUrl: z.string().url().nullable(),
  /** 提携報酬の有無。MVP では常に false。UI に必ず表示する。 */
  affiliate: z.boolean(),
});
export type Merchant = z.infer<typeof MerchantSchema>;

export const MerchantRegistrySchema = z.object({
  registryVersion: z.string(),
  compiledAt: z.string(),
  policy: z.string(),
  merchants: z.array(MerchantSchema).min(1),
});

/* ------------------------------------------------------------------ *
 * オファー
 * ------------------------------------------------------------------ */

/** 確認できていない項目のコード。UI はこれを見て「未確認」を明示する。 */
export const UnverifiedFieldSchema = z.enum([
  "price",
  "shippingFee",
  "availability",
  "returnPolicy",
]);
export type UnverifiedField = z.infer<typeof UnverifiedFieldSchema>;

export const ProductOfferSchema = z.object({
  offerId: z.string().min(1),
  productId: z.string().min(1),
  merchantId: z.string().min(1),
  merchantName: z.string().min(1),
  /** 参考価格(円、税込) */
  price: z.number().int().nonnegative(),
  /** 確認できた送料のみ。未確認は null。 */
  shippingFee: z.number().int().nonnegative().nullable(),
  currency: z.literal("JPY"),
  availability: z.enum(["in_stock", "out_of_stock", "unknown"]),
  productUrl: z.string().url(),
  /** このオファーのスナップショットを生成した時刻 */
  checkedAt: z.string(),
  /** 価格を公式ページと突合した日付。null は未突合。 */
  priceSourceCheckedAt: z.string().nullable(),
  officialSeller: z.boolean(),
  returnPolicyUrl: z.string().url().nullable(),
  affiliate: z.boolean(),
  unverified: z.array(UnverifiedFieldSchema),
  /**
   * 送料込みの合計額。送料が未確認の場合は null。
   * 「送料 0 円」と「送料 未確認」を同じ数値に潰さないため。
   */
  totalYen: z.number().int().nonnegative().nullable(),
});
export type ProductOffer = z.infer<typeof ProductOfferSchema>;

export const OfferValidationSchema = z.object({
  offerId: z.string(),
  valid: z.boolean(),
  /** 再取得したオファー（valid=false でも判断材料として返す） */
  offer: ProductOfferSchema.nullable(),
  /** 承認をブロックする理由 */
  blockers: z.array(
    z.enum([
      "unknown_offer",
      "out_of_stock",
      "price_changed",
      "over_budget",
      "hard_filter_violation",
      "url_not_allowed",
      "already_owned",
    ]),
  ),
  /** ブロックはしないが承認前に伝えるべき注意 */
  warnings: z.array(z.string()),
  revalidatedAt: z.string(),
});
export type OfferValidation = z.infer<typeof OfferValidationSchema>;

/* ------------------------------------------------------------------ *
 * 候補比較
 * ------------------------------------------------------------------ */

export const ComparisonRowSchema = z.object({
  offer: ProductOfferSchema,
  productName: z.string(),
  brand: z.string(),
  volume: z.string().nullable(),
  score: z.number(),
  selected: z.boolean(),
  /** 採用理由（selected=true のとき） */
  reason: z.string().nullable(),
  /** 不採用理由（selected=false のとき）。必ず埋める。 */
  notChosenReason: z.string().nullable(),
  /** 比較軸ごとの短い所見 */
  highlights: z.array(z.string()),
  cautions: z.array(z.string()),
  claims: z.array(z.string()),
});
export type ComparisonRow = z.infer<typeof ComparisonRowSchema>;

/**
 * 反実仮想（counterfactual）。
 * 「予算をいくらにすると結論が変わるか」を決定論的に算出したもの。
 */
export const TippingPointSchema = z.object({
  kind: z.enum(["budget_up", "budget_down", "none"]),
  /** その結論に変わる境界の予算額 */
  budgetYen: z.number().int().nonnegative().nullable(),
  /** 境界を越えたときに選ばれる商品 */
  productId: z.string().nullable(),
  message: z.string(),
});
export type TippingPoint = z.infer<typeof TippingPointSchema>;

export const OfferComparisonSchema = z.object({
  category: CategorySchema,
  rows: z.array(ComparisonRowSchema),
  /** 予算内に候補が無かった場合の説明 */
  emptyReason: z.string().nullable(),
  tippingPoint: TippingPointSchema,
  /** 「買わない」を選んだ場合に起きること */
  declineOutcome: z.string(),
});
export type OfferComparison = z.infer<typeof OfferComparisonSchema>;

/* ------------------------------------------------------------------ *
 * 引き継ぎ（ハンドオフ）
 * ------------------------------------------------------------------ */

export const PurchaseHandoffSchema = z.object({
  /** HMAC 署名済みの引き継ぎトークン */
  token: z.string().min(1),
  /** 遷移を開始するアプリ内 URL（外部 URL を直接クライアントへ渡さない） */
  handoffUrl: z.string().min(1),
  /** 表示用の遷移先ホスト */
  merchantHost: z.string(),
  merchantName: z.string(),
  expiresAt: z.string(),
  offer: ProductOfferSchema,
});
export type PurchaseHandoff = z.infer<typeof PurchaseHandoffSchema>;

/* ------------------------------------------------------------------ *
 * エージェント状態
 * ------------------------------------------------------------------ */

export const CommerceStateSchema = z.enum([
  "INTENT_CAPTURED",
  "INVENTORY_CONFIRMED",
  "ROUTINE_GENERATED",
  "NEED_ASSESSED",
  "NO_PURCHASE_NEEDED",
  "CANDIDATES_COMPARED",
  "AWAITING_USER_APPROVAL",
  "PURCHASE_HANDOFF_READY",
  "DECLINED",
]);
export type CommerceState = z.infer<typeof CommerceStateSchema>;

export const AgentStepSchema = z.object({
  state: CommerceStateSchema,
  label: z.string(),
  detail: z.string(),
  /** ユーザーの明示操作が必要な地点か */
  requiresUserAction: z.boolean(),
  at: z.string(),
});
export type AgentStep = z.infer<typeof AgentStepSchema>;

/* ------------------------------------------------------------------ *
 * API 入出力
 * ------------------------------------------------------------------ */

export const OffersRequestSchema = z.object({
  profile: ProfileSchema,
  category: CategorySchema,
  /** 比較する最大件数 */
  limit: z.number().int().min(2).max(3).default(3),
});
export type OffersRequest = z.infer<typeof OffersRequestSchema>;

export const OffersResponseSchema = z.object({
  comparison: OfferComparisonSchema,
  trace: z.array(AgentStepSchema),
  state: CommerceStateSchema,
});
export type OffersResponse = z.infer<typeof OffersResponseSchema>;

export const HandoffRequestSchema = z.object({
  profile: ProfileSchema,
  offerId: z.string().min(1).max(200),
  /**
   * ユーザーが承認画面で確認した内容のハッシュではなく、
   * 「見た価格」をそのまま送らせる。サーバー側の再計算とずれた場合は承認を止める。
   */
  acknowledgedPriceYen: z.number().int().nonnegative(),
  /** 未確認項目があることを理解した上での承認か */
  acknowledgedUnverified: z.boolean(),
});
export type HandoffRequest = z.infer<typeof HandoffRequestSchema>;

export const HandoffResponseSchema = z.object({
  handoff: PurchaseHandoffSchema.nullable(),
  validation: OfferValidationSchema,
  trace: z.array(AgentStepSchema),
  state: CommerceStateSchema,
});
export type HandoffResponse = z.infer<typeof HandoffResponseSchema>;

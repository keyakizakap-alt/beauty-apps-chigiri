import { z } from "zod";
import { CategorySchema, ProductSchema, UsageTimingSchema } from "./product";
import { ProfileSchema } from "./profile";

/** 推薦 API のリクエスト */
export const RecommendRequestSchema = z.object({
  profile: ProfileSchema,
  /** true の場合 LLM を呼ばず決定論的説明のみを返す（テスト・デモ用） */
  skipLlm: z.boolean().default(false),
  /**
   * 外部AIサービスの利用を利用者が明示的に許可したか。
   * 既定は false。省略された場合も「端末内のみ」として扱い、外部へ送らない。
   */
  allowExternalAi: z.boolean().default(false),
});
export type RecommendRequest = z.infer<typeof RecommendRequestSchema>;

/** ルーティン 1 ステップ（決定論的に確定した内容） */
export const RoutineStepSchema = z.object({
  order: z.number().int().min(1),
  productId: z.string(),
  category: CategorySchema,
  /** 使用目的（許可表現のみ） */
  purpose: z.string(),
  /** 採用理由（決定論 or LLM 生成） */
  reason: z.string(),
  /** 注意事項 */
  cautions: z.array(z.string()),
  /** スコア内訳（説明可能性のため保持） */
  score: z.number(),
});
export type RoutineStep = z.infer<typeof RoutineStepSchema>;

export const RoutineSchema = z.object({
  timing: UsageTimingSchema,
  steps: z.array(RoutineStepSchema),
  /** ユーザーの使える時間(分) */
  budgetMinutes: z.number(),
  /** 推定所要時間(分) */
  estimatedMinutes: z.number(),
});
export type Routine = z.infer<typeof RoutineSchema>;

/**
 * ルーティンの案。
 * 同じ決定論的ロジックで、使える時間の前提だけを変えて組み立てたもの。
 */
export const RoutinePlanKindSchema = z.enum(["standard", "quick", "full"]);
export type RoutinePlanKind = z.infer<typeof RoutinePlanKindSchema>;

export const RoutinePlanSchema = z.object({
  kind: RoutinePlanKindSchema,
  label: z.string(),
  description: z.string(),
  routines: z.object({ morning: RoutineSchema, night: RoutineSchema }),
  totalSteps: z.number(),
  totalMinutes: z.number(),
  /** この案で活用している手持ち商品の点数 */
  ownedUsedCount: z.number(),
});
export type RoutinePlan = z.infer<typeof RoutinePlanSchema>;

export const DuplicationSchema = z.object({
  category: CategorySchema,
  keptProductId: z.string(),
  duplicateProductIds: z.array(z.string()),
  note: z.string(),
});
export type Duplication = z.infer<typeof DuplicationSchema>;

export const UnusedProductSchema = z.object({
  productId: z.string(),
  /** 不採用理由コード */
  reasonCode: z.enum([
    "hard_filter_ingredient",
    "hard_filter_texture",
    "duplicate_role",
    "time_budget",
    "lower_score",
    "timing_mismatch",
  ]),
  reason: z.string(),
});
export type UnusedProduct = z.infer<typeof UnusedProductSchema>;

export const GapSchema = z.object({
  category: CategorySchema,
  timing: UsageTimingSchema,
  severity: z.enum(["critical", "recommended"]),
  note: z.string(),
});
export type Gap = z.infer<typeof GapSchema>;

export const PurchaseSuggestionSchema = z.object({
  productId: z.string(),
  category: CategorySchema,
  price: z.number(),
  reason: z.string(),
  score: z.number(),
  /** 次点候補（説明可能性のため） */
  runnerUpIds: z.array(z.string()),
});
export type PurchaseSuggestion = z.infer<typeof PurchaseSuggestionSchema>;

export const SavingsSchema = z.object({
  /** 手持ちのうち活用した商品数 */
  ownedUsedCount: z.number(),
  ownedTotalCount: z.number(),
  /** 手持ち活用率 0-1 */
  utilizationRate: z.number(),
  /** 今回買い足す商品数 */
  newItemCount: z.number(),
  /** 今回の追加費用 */
  additionalCostYen: z.number(),
  /**
   * 「全カテゴリーを新規購入した場合」との差分。
   * カタログ内の各カテゴリー中央価格を基準にした推定値。
   */
  avoidedItemCount: z.number(),
  avoidedCostYen: z.number(),
});
export type Savings = z.infer<typeof SavingsSchema>;

export const EvidenceSchema = z.object({
  productId: z.string(),
  brand: z.string(),
  name: z.string(),
  officialUrl: z.string(),
  sourceCheckedAt: z.string().nullable(),
  dataConfidence: z.enum(["official", "seed"]),
  /** 表示に使った許可表現 */
  claims: z.array(z.string()),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const AiMetaSchema = z.object({
  used: z.boolean(),
  /** OrcaRouter が選択したモデル */
  model: z.string().nullable(),
  requestedModel: z.string().nullable(),
  latencyMs: z.number().nullable(),
  fallback: z.boolean(),
  fallbackReason: z.string().nullable(),
  requestId: z.string().nullable(),
  jsonValid: z.boolean().nullable(),
  estimatedTokens: z.number().nullable(),
});
export type AiMeta = z.infer<typeof AiMetaSchema>;

export const SafetyNoticeSchema = z.object({
  level: z.enum(["info", "stop"]),
  message: z.string(),
});
export type SafetyNotice = z.infer<typeof SafetyNoticeSchema>;

export const RecommendationSchema = z.object({
  summary: z.string(),
  routines: z.object({
    morning: RoutineSchema,
    night: RoutineSchema,
  }),
  duplications: z.array(DuplicationSchema),
  unused: z.array(UnusedProductSchema),
  gaps: z.array(GapSchema),
  /** デモ・要約で最も強調する「追加するならこの1点」 */
  purchaseSuggestion: PurchaseSuggestionSchema.nullable(),
  /** maxNewItems が 2 以上の場合の残りの候補（通常は空） */
  purchaseSuggestions: z.array(PurchaseSuggestionSchema).default([]),
  noPurchaseNeededReason: z.string().nullable(),
  totalSteps: z.number(),
  savings: SavingsSchema,
  evidence: z.array(EvidenceSchema),
  ai: AiMetaSchema,
  safety: z.array(SafetyNoticeSchema),
  disclaimer: z.string(),
  /** 使用した商品の完全な情報（UI 描画用） */
  products: z.array(ProductSchema),
  /**
   * ルーティンの案（標準・時短・じっくり）。
   * 既定値を持たせてあるため、この項目が無い過去の保存データも読める。
   */
  plans: z.array(RoutinePlanSchema).default([]),
  /** 手持ちから成立する組み立て方の総数（提示するのはこのうち数案） */
  arrangementCount: z.number().default(0),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

/* ------------------------------------------------------------------ *
 * LLM に返させる JSON のスキーマ。
 * 商品選定は含めない。既に決定済みの内容に「説明」を付けるだけ。
 * ------------------------------------------------------------------ */
export const LlmExplanationSchema = z.object({
  summary: z.string().min(1).max(400),
  steps: z
    .array(
      z.object({
        productId: z.string(),
        purpose: z.string().min(1).max(120),
        reason: z.string().min(1).max(240),
      }),
    )
    .max(24),
  duplicationNotes: z
    .array(z.object({ category: z.string(), note: z.string().max(240) }))
    .max(8)
    .default([]),
  unusedNotes: z
    .array(z.object({ productId: z.string(), reason: z.string().max(240) }))
    .max(20)
    .default([]),
  purchaseReason: z.string().max(300).nullable().default(null),
});
export type LlmExplanation = z.infer<typeof LlmExplanationSchema>;

/** チャット API のレスポンス */
export const ChatResponseSchema = z.object({
  reply: z.string(),
  profile: ProfileSchema,
  /** 追加で聞くべき項目 */
  missing: z.array(z.string()),
  recommendation: RecommendationSchema.nullable(),
  ai: AiMetaSchema,
  safety: z.array(SafetyNoticeSchema),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

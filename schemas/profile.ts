import { z } from "zod";
import {
  ConcernTagSchema,
  IngredientTagSchema,
  SkinTagSchema,
  TextureTagSchema,
} from "./product";

/**
 * ユーザープロファイル。
 * すべての API 入力はこのスキーマを通す。
 */
export const ProfileSchema = z.object({
  /** 肌傾向（自己申告。医療的な診断ではない） */
  skinType: SkinTagSchema,
  /** 美容上の関心（優先順位順。先頭ほど重み大） */
  concerns: z.array(ConcernTagSchema).max(5).default([]),
  /** 避けたい使用感 */
  avoidTextures: z.array(TextureTagSchema).max(8).default([]),
  /** 避けたい成分・既知のアレルギー（ハードフィルタ） */
  avoidIngredients: z.array(IngredientTagSchema).max(12).default([]),
  /** 買い足しに使える上限額(円) */
  budgetYen: z.number().int().min(0).max(100000).default(3000),
  /** 朝に使える時間(分) */
  morningMinutes: z.number().int().min(1).max(60).default(5),
  /** 夜に使える時間(分) */
  nightMinutes: z.number().int().min(1).max(60).default(10),
  /** 手持ち商品のカタログ ID */
  ownedProductIds: z.array(z.string()).max(60).default([]),
  /** 追加購入を許可するか */
  allowPurchase: z.boolean().default(true),
  /** 最大買い足し商品数 */
  maxNewItems: z.number().int().min(0).max(3).default(1),
});
export type Profile = z.infer<typeof ProfileSchema>;

/** チャット中の部分更新用（LLM のスロット抽出結果もこれで検証する） */
export const ProfilePatchSchema = ProfileSchema.partial();
export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;

export const DEFAULT_PROFILE: Profile = {
  skinType: "normal",
  concerns: [],
  avoidTextures: [],
  avoidIngredients: [],
  budgetYen: 3000,
  morningMinutes: 5,
  nightMinutes: 10,
  ownedProductIds: [],
  allowPurchase: true,
  maxNewItems: 1,
};

/** プロファイルが推薦を実行できる状態か */
export function isProfileReady(p: Profile): boolean {
  return p.ownedProductIds.length > 0;
}

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(ChatMessageSchema).max(20).default([]),
  profile: ProfileSchema,
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

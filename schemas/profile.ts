import { z } from "zod";
import {
  ConcernTagSchema,
  IngredientTagSchema,
  SkinTagSchema,
  TextureTagSchema,
} from "./product";

/**
 * ユーザーが実際に指定した項目。
 * 初期値のままの項目を「あなたはこう言いました」と扱わないために持つ。
 */
export const ProfileFieldSchema = z.enum([
  "skinType",
  "concerns",
  "avoidTextures",
  "avoidIngredients",
  "budgetYen",
  "morningMinutes",
  "nightMinutes",
  "ownedProductIds",
  "allowPurchase",
  "maxNewItems",
]);
export type ProfileField = z.infer<typeof ProfileFieldSchema>;

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
  /**
   * ユーザーが実際に指定した項目。
   * ここに無い項目の値は「こちらが仮に置いた初期値」であり、
   * 説明文で断定してはいけない。
   */
  statedFields: z.array(ProfileFieldSchema).default([]),
});
export type Profile = z.infer<typeof ProfileSchema>;

/**
 * チャット中の部分更新用（LLM のスロット抽出結果もこれで検証する）。
 * statedFields は LLM に決めさせない。
 * ownedProductIds も、商品の同定は決定論的マッチャーの担当なので受け付けない。
 */
export const ProfilePatchSchema = ProfileSchema.omit({
  statedFields: true,
  ownedProductIds: true,
}).partial();
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
  statedFields: [],
};

/** ユーザーが明示的に指定した項目として記録する */
export function markStated(
  profile: Profile,
  ...fields: ProfileField[]
): Profile {
  const set = new Set<ProfileField>([...profile.statedFields, ...fields]);
  return { ...profile, statedFields: [...set] };
}

/** その項目をユーザー自身が指定したか（初期値のままではないか） */
export function isStated(profile: Profile, field: ProfileField): boolean {
  return profile.statedFields.includes(field);
}

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

import { z } from "zod";

/**
 * 商品カタログのスキーマ。
 * タグ語彙は enum で固定し、プロファイル側と語彙を共有する。
 * 自由文字列を許すと「スコアリング時に一致しないタグ」が静かに増えるため。
 */

export const CategorySchema = z.enum([
  "cleanser",
  "lotion",
  "serum",
  "moisturizer",
  "sunscreen",
]);
export type Category = z.infer<typeof CategorySchema>;

export const SkinTagSchema = z.enum([
  "dry",
  "oily",
  "combination",
  "normal",
  "sensitive",
]);
export type SkinTag = z.infer<typeof SkinTagSchema>;

export const ConcernTagSchema = z.enum([
  "dryness",
  "oiliness",
  "pores",
  "dullness",
  "acne_prone",
  "texture",
  "firmness",
  "uv_protection",
  "redness",
  "sensitivity",
]);
export type ConcernTag = z.infer<typeof ConcernTagSchema>;

export const TextureTagSchema = z.enum([
  "watery",
  "light",
  "rich",
  "gel",
  "milky",
  "balm",
  "foam",
  "oily_finish",
  "matte_finish",
  "dewy_finish",
  "fragrance_free",
  "fragranced",
  "non_sticky",
  "sticky",
]);
export type TextureTag = z.infer<typeof TextureTagSchema>;

export const IngredientTagSchema = z.enum([
  "hyaluronic_acid",
  "ceramide",
  "niacinamide",
  "vitamin_c_derivative",
  "amino_acid",
  "centella",
  "glycerin",
  "squalane",
  "panthenol",
  "mineral_uv",
  "chemical_uv",
  "salicylic_acid",
  "clay",
  "aha",
  "alcohol",
  "fragrance",
  "essential_oil",
]);
export type IngredientTag = z.infer<typeof IngredientTagSchema>;

export const CautionTagSchema = z.enum([
  "contains_alcohol",
  "contains_fragrance",
  "contains_essential_oil",
  "exfoliating",
  "reapply_needed",
  "patch_test_recommended",
  "may_feel_heavy",
  "may_feel_drying",
]);
export type CautionTag = z.infer<typeof CautionTagSchema>;

export const UsageTimingSchema = z.enum(["morning", "night"]);
export type UsageTiming = z.infer<typeof UsageTimingSchema>;

export const ProductSchema = z.object({
  id: z.string().min(1),
  brand: z.string().min(1),
  name: z.string().min(1),
  category: CategorySchema,
  /** 税込参考価格(円) */
  price: z.number().int().nonnegative(),
  volume: z.string().optional(),
  skinTags: z.array(SkinTagSchema),
  concernTags: z.array(ConcernTagSchema),
  textureTags: z.array(TextureTagSchema),
  ingredientTags: z.array(IngredientTagSchema),
  cautionTags: z.array(CautionTagSchema),
  /** allowed-claims.json の claim id のみ */
  allowedClaims: z.array(z.string()),
  usageTiming: z.array(UsageTimingSchema).min(1),
  officialUrl: z.string().url(),
  /**
   * 商品ページそのものの URL。
   * ブランドサイトのトップではなく、その商品の紹介ページを指す。
   * 確認できていない場合は null にし、UI では検索導線に切り替える。
   * 推測で URL を組み立てない（404 や別商品への誘導を避けるため）。
   */
  productPageUrl: z.string().url().nullable().default(null),
  /**
   * 公式ページと突合した日付。null は「未検証」を意味し、
   * UI 上で根拠ありとして扱わない。推測で埋めないこと。
   */
  sourceCheckedAt: z.string().nullable(),
  dataConfidence: z.enum(["official", "seed"]),
  isQuasiDrug: z.boolean(),
  origin: z.enum(["jp", "kr", "other"]),
});
export type Product = z.infer<typeof ProductSchema>;

export const CatalogSchema = z.object({
  catalogVersion: z.string(),
  compiledAt: z.string(),
  dataPolicy: z.string(),
  products: z.array(ProductSchema).min(1),
});
export type Catalog = z.infer<typeof CatalogSchema>;

export const AllowedClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(["cosmetic", "quasi_drug"]),
});
export type AllowedClaim = z.infer<typeof AllowedClaimSchema>;

export const AllowedClaimsFileSchema = z.object({
  note: z.string(),
  claims: z.array(AllowedClaimSchema).min(1),
  bannedPatterns: z.array(z.string()).min(1),
});

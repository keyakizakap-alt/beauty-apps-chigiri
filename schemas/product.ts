import { z } from "zod";

/**
 * 商品カタログのスキーマ。
 * タグ語彙は enum で固定し、プロファイル側と語彙を共有する。
 * 自由文字列を許すと「スコアリング時に一致しないタグ」が静かに増えるため。
 */

/** 相談分野。商品もルーティンもこの単位で切り替わる。 */
export const DomainSchema = z.enum([
  "skincare",
  "haircare",
  "bodycare",
  "makeup",
  "nailcare",
]);
export type Domain = z.infer<typeof DomainSchema>;

export const CategorySchema = z.enum([
  // スキンケア
  "cleanser",
  "lotion",
  "serum",
  "moisturizer",
  "sunscreen",
  // ヘア・頭皮ケア
  "shampoo",
  "conditioner",
  "hair_treatment",
  "scalp_care",
  "hair_outbath",
  // ボディケア
  "body_wash",
  "body_moisturizer",
  "body_special",
  // メイク
  "makeup_remover",
  "makeup_base",
  "foundation",
  "face_powder",
  "lip",
  "eye_makeup",
  // ネイル・ハンド
  "hand_wash",
  "hand_cream",
  "nail_oil",
  "nail_base",
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
  // 肌・体に共通
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
  // ヘア・頭皮
  "hair_damage",
  "frizz",
  "hair_volume",
  "scalp_dryness",
  "scalp_oiliness",
  "dandruff",
  "hair_color_care",
  "hair_gloss",
  // ボディ
  "body_roughness",
  "body_odor",
  // メイク
  "makeup_lasting",
  "color_transfer",
  "shine_control",
  "coverage",
  "dewy_look",
  // ネイル・ハンド
  "nail_brittle",
  "nail_dryness",
  "hand_dryness",
  "cuticle_care",
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
  // ヘア・頭皮
  "amino_acid_surfactant",
  "sulfate_surfactant",
  "silicone",
  "keratin",
  "botanical_oil",
  "menthol",
  // ネイル
  "jojoba_oil",
  "vitamin_e",
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
  "avoid_eye_area",
  "rinse_thoroughly",
  "remover_needed",
  "color_may_transfer",
  "not_for_broken_skin",
]);
export type CautionTag = z.infer<typeof CautionTagSchema>;

export const UsageTimingSchema = z.enum(["morning", "night"]);
export type UsageTiming = z.infer<typeof UsageTimingSchema>;

export const ProductSchema = z.object({
  id: z.string().min(1),
  /** どの相談分野の商品か */
  domain: DomainSchema,
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
  /**
   * 公式ページ。利用者が自分で追加したものは持たないため null を許す。
   * 空文字やダミーURLで埋めない（存在しない出典を作らないため）。
   */
  officialUrl: z.string().url().nullable(),
  /**
   * 公式ページと突合した日付。null は「未検証」を意味し、
   * UI 上で根拠ありとして扱わない。推測で埋めないこと。
   */
  sourceCheckedAt: z.string().nullable(),
  /**
   * 価格そのものを公式ページで確認した日付。
   *
   * sourceCheckedAt とは分ける。公式ページに価格が出ていない商品
   * （オープン価格・希望小売価格なし）は珍しくなく、商品自体は突合できても
   * 価格は編集時点の参考値のまま、ということが起こるため。
   * null のときは承認画面で「参考価格」として警告する。
   */
  priceCheckedAt: z.string().nullable().default(null),
  dataConfidence: z.enum(["official", "seed", "user"]),
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

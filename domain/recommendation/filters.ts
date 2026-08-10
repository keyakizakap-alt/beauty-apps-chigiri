import type { Product, IngredientTag, CautionTag } from "@/schemas/product";
import type { Profile } from "@/schemas/profile";

/**
 * ハードフィルタ。
 * 既知のアレルギー・明示的に避けたい要素は「減点」ではなく「除外」として扱う。
 * ここを通過しなかった商品は、以降どのスコアであっても採用されない。
 */

export type FilterReasonCode =
  | "hard_filter_ingredient"
  | "hard_filter_texture";

export type Excluded = {
  product: Product;
  reasonCode: FilterReasonCode;
  reason: string;
  /** 具体的に何が引っかかったか */
  matched: string[];
};

export type FilterResult = {
  passed: Product[];
  excluded: Excluded[];
};

/** 避けたい成分タグ → 対応する cautionTag（片方の表記でも拾えるようにする） */
const INGREDIENT_TO_CAUTION: Partial<Record<IngredientTag, CautionTag>> = {
  alcohol: "contains_alcohol",
  fragrance: "contains_fragrance",
  essential_oil: "contains_essential_oil",
};

export const INGREDIENT_LABEL: Record<string, string> = {
  hyaluronic_acid: "ヒアルロン酸",
  ceramide: "セラミド",
  niacinamide: "ナイアシンアミド",
  vitamin_c_derivative: "ビタミンC誘導体",
  amino_acid: "アミノ酸系",
  centella: "ツボクサ(シカ)",
  glycerin: "グリセリン",
  squalane: "スクワラン",
  panthenol: "パンテノール",
  mineral_uv: "紫外線散乱剤",
  chemical_uv: "紫外線吸収剤",
  salicylic_acid: "サリチル酸",
  clay: "クレイ",
  aha: "AHA",
  alcohol: "アルコール(エタノール)",
  fragrance: "香料",
  essential_oil: "精油",
};

export const TEXTURE_LABEL: Record<string, string> = {
  watery: "さらさらした水状",
  light: "軽いつけ心地",
  rich: "こっくり濃厚",
  gel: "ジェル状",
  milky: "乳液状",
  balm: "バーム状",
  foam: "泡状",
  oily_finish: "油分の多い仕上がり",
  matte_finish: "マットな仕上がり",
  dewy_finish: "ツヤのある仕上がり",
  fragrance_free: "無香料",
  fragranced: "香りつき",
  non_sticky: "べたつかない",
  sticky: "とろみ・べたつきあり",
};

/**
 * 商品がユーザーの除外条件に違反しているか判定する。
 * 違反していれば理由を返す。純関数。
 */
export function checkExclusion(
  product: Product,
  profile: Profile,
): Omit<Excluded, "product"> | null {
  // 1) 避けたい成分 / 既知のアレルギー
  const ingredientHits: string[] = [];
  for (const avoided of profile.avoidIngredients) {
    if (product.ingredientTags.includes(avoided)) {
      ingredientHits.push(INGREDIENT_LABEL[avoided] ?? avoided);
      continue;
    }
    const caution = INGREDIENT_TO_CAUTION[avoided];
    if (caution && product.cautionTags.includes(caution)) {
      ingredientHits.push(INGREDIENT_LABEL[avoided] ?? avoided);
    }
  }
  if (ingredientHits.length > 0) {
    return {
      reasonCode: "hard_filter_ingredient",
      reason: `避けたい成分として指定された「${ingredientHits.join("・")}」を含むため、候補から除外しました。`,
      matched: ingredientHits,
    };
  }

  // 2) 避けたい使用感
  const textureHits = profile.avoidTextures
    .filter((t) => product.textureTags.includes(t))
    .map((t) => TEXTURE_LABEL[t] ?? t);
  if (textureHits.length > 0) {
    return {
      reasonCode: "hard_filter_texture",
      reason: `避けたい使用感として指定された「${textureHits.join("・")}」に当てはまるため、候補から除外しました。`,
      matched: textureHits,
    };
  }

  return null;
}

/** 商品配列にハードフィルタを適用する */
export function applyHardFilters(
  products: readonly Product[],
  profile: Profile,
): FilterResult {
  const passed: Product[] = [];
  const excluded: Excluded[] = [];
  for (const product of products) {
    const hit = checkExclusion(product, profile);
    if (hit) excluded.push({ product, ...hit });
    else passed.push(product);
  }
  return { passed, excluded };
}

/** 買い足し候補向けの追加フィルタ：予算内であること */
export function withinBudget(product: Product, budgetYen: number): boolean {
  return product.price <= budgetYen;
}

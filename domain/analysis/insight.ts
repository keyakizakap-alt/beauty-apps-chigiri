import type { Product, IngredientTag } from "@/schemas/product";
import type { Profile } from "@/schemas/profile";
import { CATEGORY_LABEL } from "@/domain/recommendation/domains";
import { INGREDIENT_LABEL, TEXTURE_LABEL } from "@/domain/recommendation/filters";
import { CONCERN_LABEL, SKIN_LABEL, cautionMessages } from "@/domain/recommendation/routine-builder";

/**
 * 手持ち商品の読み解き。
 *
 * 「何が入っていて、自分の条件と何が合っていないか」を説明する。
 * すべて公開されている成分分類とユーザーの入力だけから決定論的に導く。
 * 配合濃度・処方は公開されていないため、効果や刺激の強さは断定しない。
 */

/**
 * 成分タグの役割。
 * 薬機法の許可表現の範囲を超えないよう、「〜として配合されることが多い」
 * という書き方に統一している。効果を約束する書き方はしない。
 */
export const INGREDIENT_ROLE: Record<string, string> = {
  hyaluronic_acid: "水分を抱える保湿成分として配合されることが多い成分です",
  ceramide: "うるおいを保つ保湿成分として配合されることが多い成分です",
  niacinamide: "肌を整える目的で配合されることが多い成分です",
  vitamin_c_derivative: "肌を整える目的で配合されることが多い成分です",
  amino_acid: "洗浄や保湿の目的で配合されることが多い成分です",
  amino_acid_surfactant: "洗浄力が穏やかとされる洗浄成分です",
  sulfate_surfactant: "洗浄力が高いとされる洗浄成分です",
  centella: "肌をすこやかに保つ目的で配合されることが多い成分です",
  glycerin: "最も一般的な保湿成分のひとつです",
  squalane: "皮膚をやわらげる油性成分です",
  panthenol: "うるおいを与える目的で配合されることが多い成分です",
  mineral_uv: "紫外線を反射・散乱させる紫外線防御成分です",
  chemical_uv: "紫外線を吸収する紫外線防御成分です",
  salicylic_acid: "古い角質にはたらく成分で、使用頻度に注意が必要です",
  clay: "皮脂や汚れを吸着する目的で配合される粉体です",
  aha: "古い角質にはたらく酸で、使用頻度に注意が必要です",
  alcohol: "さっぱりした使用感を出す目的などで配合されます",
  fragrance: "香りをつけるために配合されます",
  essential_oil: "植物由来の香り成分です",
  silicone: "指通りをなめらかにする目的で配合されます",
  keratin: "毛髪をしなやかにする目的で配合されることが多い成分です",
  botanical_oil: "毛髪や皮膚を保護する目的で配合される植物油です",
  menthol: "清涼感を出す成分です",
  jojoba_oil: "皮膚や爪になじみやすい植物油です",
  vitamin_e: "油分の酸化を防ぐ目的などで配合されます",
};

export type FitPoint = {
  /** ユーザーの条件のどれに関する話か */
  axis: "concern" | "skin" | "texture" | "ingredient" | "caution" | "timing";
  text: string;
};

export type ProductFit = {
  productId: string;
  /** 配合成分の読み解き */
  ingredients: Array<{ tag: IngredientTag; label: string; role: string }>;
  /** 条件に合っている点 */
  matches: FitPoint[];
  /** 条件に合っていない点 */
  mismatches: FitPoint[];
  /** 注意しておきたい点 */
  cautions: string[];
};

/**
 * 商品とユーザーの条件を突き合わせる。
 * 「合っていない」は否定ではなく、どの条件に対してかを必ず添える。
 */
export function analyzeFit(product: Product, profile: Profile): ProductFit {
  const matches: FitPoint[] = [];
  const mismatches: FitPoint[] = [];

  // 関心との対応
  const hit = profile.concerns.filter((c) => product.concernTags.includes(c));
  const miss = profile.concerns.filter((c) => !product.concernTags.includes(c));
  if (hit.length > 0) {
    matches.push({
      axis: "concern",
      text: `${hit.map((c) => CONCERN_LABEL[c]).join("・")}に対応するタグを持っています`,
    });
  }
  if (miss.length > 0) {
    mismatches.push({
      axis: "concern",
      text: `${miss.map((c) => CONCERN_LABEL[c]).join("・")}に対応するタグは公式情報から確認できませんでした`,
    });
  }

  // 肌傾向との対応
  if (product.skinTags.includes(profile.skinType)) {
    matches.push({
      axis: "skin",
      text: `${SKIN_LABEL[profile.skinType]}向けの表示があります`,
    });
  } else if (product.skinTags.length > 0) {
    mismatches.push({
      axis: "skin",
      text:
        `表示されている対象は${product.skinTags.map((s) => SKIN_LABEL[s]).join("・")}で、` +
        `${SKIN_LABEL[profile.skinType]}向けとは明記されていません`,
    });
  }

  // 避けたい使用感
  const badTexture = profile.avoidTextures.filter((t) =>
    product.textureTags.includes(t),
  );
  if (badTexture.length > 0) {
    mismatches.push({
      axis: "texture",
      text: `避けたいとされた「${badTexture.map((t) => TEXTURE_LABEL[t] ?? t).join("・")}」に当てはまります`,
    });
  }

  // 避けたい成分
  const badIngredient = profile.avoidIngredients.filter(
    (i) =>
      product.ingredientTags.includes(i) ||
      (i === "alcohol" && product.cautionTags.includes("contains_alcohol")) ||
      (i === "fragrance" && product.cautionTags.includes("contains_fragrance")) ||
      (i === "essential_oil" &&
        product.cautionTags.includes("contains_essential_oil")),
  );
  if (badIngredient.length > 0) {
    mismatches.push({
      axis: "ingredient",
      text: `避けたいとされた${badIngredient.map((i) => INGREDIENT_LABEL[i] ?? i).join("・")}を含みます`,
    });
  }

  return {
    productId: product.id,
    ingredients: product.ingredientTags.map((tag) => ({
      tag,
      label: INGREDIENT_LABEL[tag] ?? tag,
      role: INGREDIENT_ROLE[tag] ?? "公開情報から役割を確認できませんでした",
    })),
    matches,
    mismatches,
    cautions: cautionMessages(product.cautionTags),
  };
}

/* ------------------------------------------------------------------ *
 * 手持ちと提案商品の違い
 * ------------------------------------------------------------------ */

export type Difference = {
  label: string;
  owned: string;
  suggested: string;
};

/**
 * 手持ちの1点と、買い足し候補の違いを並べる。
 * どちらが優れているとは書かない。何が違うかだけを出す。
 */
export function compareProducts(
  owned: Product,
  suggested: Product,
): Difference[] {
  const out: Difference[] = [];

  if (owned.category !== suggested.category) {
    out.push({
      label: "ルーティン上の役割",
      owned: CATEGORY_LABEL[owned.category],
      suggested: CATEGORY_LABEL[suggested.category],
    });
  }

  const fmtList = (xs: string[]) => (xs.length > 0 ? xs.join("・") : "記載なし");

  out.push({
    label: "参考価格",
    owned: `${owned.price.toLocaleString()}円${owned.volume ? ` / ${owned.volume}` : ""}`,
    suggested: `${suggested.price.toLocaleString()}円${suggested.volume ? ` / ${suggested.volume}` : ""}`,
  });

  out.push({
    label: "対応するとされる悩み",
    owned: fmtList(owned.concernTags.map((c) => CONCERN_LABEL[c])),
    suggested: fmtList(suggested.concernTags.map((c) => CONCERN_LABEL[c])),
  });

  out.push({
    label: "主な成分",
    owned: fmtList(owned.ingredientTags.map((i) => INGREDIENT_LABEL[i] ?? i)),
    suggested: fmtList(
      suggested.ingredientTags.map((i) => INGREDIENT_LABEL[i] ?? i),
    ),
  });

  out.push({
    label: "使用感",
    owned: fmtList(owned.textureTags.map((t) => TEXTURE_LABEL[t] ?? t)),
    suggested: fmtList(suggested.textureTags.map((t) => TEXTURE_LABEL[t] ?? t)),
  });

  out.push({
    label: "注意しておきたい点",
    owned: fmtList(cautionMessages(owned.cautionTags)),
    suggested: fmtList(cautionMessages(suggested.cautionTags)),
  });

  out.push({
    label: "使用タイミング",
    owned: owned.usageTiming.map((t) => (t === "morning" ? "朝" : "夜")).join("・"),
    suggested: suggested.usageTiming
      .map((t) => (t === "morning" ? "朝" : "夜"))
      .join("・"),
  });

  return out;
}

/* ------------------------------------------------------------------ *
 * 続けて様子を見る目安
 * ------------------------------------------------------------------ */

export type UsageHorizon = {
  /** 目安の期間 */
  span: string;
  /** なぜその期間なのか */
  basis: string;
};

/**
 * 「どのくらい続けてみるか」の目安。
 *
 * 効果が出るまでの期間ではない。効果や変化を約束する表現は使わない。
 * 使い方が定着したか、使用感が自分に合うかを見極めるための期間として示す。
 */
const HORIZON: Record<string, UsageHorizon> = {
  cleanser: {
    span: "2〜4週間",
    basis: "毎日使うものなので、洗い上がりの感触が自分に合うかは数週間で判断しやすいためです",
  },
  lotion: {
    span: "3〜4週間",
    basis: "肌の生まれ変わりは一般に約1ヶ月周期といわれ、1本を使い切る期間ともおおむね重なるためです",
  },
  serum: {
    span: "1〜3ヶ月",
    basis: "1本を使い切るまでに時間がかかるものが多く、短期間では使用感以外の判断がしにくいためです",
  },
  moisturizer: {
    span: "3〜4週間",
    basis: "毎日使うものなので、乾燥しやすい時間帯の感じ方の変化を1ヶ月ほどで振り返りやすいためです",
  },
  sunscreen: {
    span: "使うたび",
    basis: "塗り直しを含めた使いやすさが続けられるかどうかを左右するため、期間ではなく毎回の使い勝手で判断します",
  },
  shampoo: {
    span: "3〜4週間",
    basis: "頭皮の状態は洗い方の習慣とあわせて変わるため、1ヶ月ほど同じ洗い方を続けて振り返ります",
  },
  conditioner: { span: "2〜4週間", basis: "乾かしたあとの指通りは数週間で比べやすいためです" },
  hair_treatment: {
    span: "1〜2ヶ月",
    basis: "週に数回の使用が前提のものが多く、回数を重ねないと比べにくいためです",
  },
  scalp_care: { span: "1〜2ヶ月", basis: "頭皮の習慣づけには時間がかかるためです" },
  hair_outbath: { span: "2〜3週間", basis: "毎日使うため、手ざわりの違いは比較的早く比べられます" },
  body_wash: { span: "2〜4週間", basis: "毎日使うものなので、洗い上がりの感触を数週間で判断できます" },
  body_moisturizer: {
    span: "3〜4週間",
    basis: "乾燥しやすい季節では、1ヶ月ほど続けて振り返ると比べやすいためです",
  },
  body_special: { span: "1〜2ヶ月", basis: "使用頻度が低いものが多く、回数を重ねる必要があるためです" },
  makeup_base: { span: "2〜3週間", basis: "同じ環境で数回試すと、崩れ方の傾向を比べやすいためです" },
  foundation: { span: "2〜3週間", basis: "季節や体調でも変わるため、複数回の使用で判断します" },
  face_powder: { span: "2〜3週間", basis: "同じ環境で数回試すと比べやすいためです" },
  lip: { span: "1〜2週間", basis: "つけている時間の長さで感じ方が変わるため、数回の使用で判断できます" },
  eye_makeup: { span: "1〜2週間", basis: "使い方に慣れるまでの期間を含めて見ます" },
  makeup_remover: { span: "2〜3週間", basis: "落とし残りやつっぱり感は数回の使用で比べられます" },
  hand_wash: { span: "2〜4週間", basis: "洗う回数が多いため、手肌の感じ方を数週間で振り返れます" },
  hand_cream: { span: "2〜4週間", basis: "塗り直す回数と手荒れの感じ方を1ヶ月ほどで振り返ります" },
  nail_oil: {
    span: "1〜3ヶ月",
    basis: "爪は根元から先端まで生え替わるのに数ヶ月かかるため、短期間では判断しにくいためです",
  },
  nail_base: { span: "2〜4週間", basis: "塗り替えの周期に合わせて数回試すと比べやすいためです" },
};

export function usageHorizon(product: Product): UsageHorizon {
  return (
    HORIZON[product.category] ?? {
      span: "3〜4週間",
      basis: "使い方が定着し、使用感が自分に合うかを判断するための一般的な目安です",
    }
  );
}

export const HORIZON_DISCLAIMER =
  "これは「続けて様子を見る目安」であり、効果があらわれる期間ではありません。" +
  "感じ方には個人差があり、変化を保証するものではありません。" +
  "肌に異常を感じた場合は期間にかかわらず使用を中止してください。";

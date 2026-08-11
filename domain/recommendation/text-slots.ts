import type { ProfilePatch } from "@/schemas/profile";
import type {
  ConcernTag,
  Domain,
  IngredientTag,
  SkinTag,
  TextureTag,
} from "@/schemas/product";

/**
 * 決定論的なスロット抽出（キーワード規則）。
 *
 * LLM による構造化が失敗・未設定でも、チャットが機能し続けるための土台。
 * LLM が成功した場合はその結果を優先し、ここは補完に使う。
 */

const normalize = (s: string) => s.normalize("NFKC");

const SKIN_RULES: Array<[RegExp, SkinTag]> = [
  [/敏感|ゆらぎ|刺激に弱|ヒリヒリ|ひりひり/, "sensitive"],
  [/混合|Tゾーン|tゾーン|部分的にテカ/, "combination"],
  [/脂性|オイリー|テカ|皮脂が多|べたつく肌/, "oily"],
  [/乾燥肌|カサカサ|かさかさ|突っ張/, "dry"],
  [/普通肌|ノーマル/, "normal"],
];

/**
 * 分野ごとの関心キーワード。
 * 「乾燥」のように分野をまたぐ語もあるため、分野を先に決めてから引く。
 */
const DOMAIN_CONCERN_RULES: Record<Domain, Array<[RegExp, ConcernTag]>> = {
  skincare: [],
  haircare: [
    [/ダメージ|傷んで|パサつ|ぱさつ|枝毛|切れ毛/, "hair_damage"],
    [/広がり|うねり|くせ毛|まとまらな/, "frizz"],
    [/ぺたん|ボリューム|ふんわり|へたる|コシ|こし/, "hair_volume"],
    [/頭皮.{0,4}(乾燥|かゆ|カユ)|地肌.{0,4}乾燥/, "scalp_dryness"],
    [/頭皮.{0,4}(べたつ|ベタつ|脂|皮脂)|地肌.{0,4}(べた|脂)/, "scalp_oiliness"],
    [/フケ|ふけ/, "dandruff"],
    [/カラー|ブリーチ|染め|退色|色落ち/, "hair_color_care"],
    [/つや|ツヤ|光沢/, "hair_gloss"],
  ],
  bodycare: [
    [/乾燥|カサカサ|かさかさ|粉ふ/, "dryness"],
    [/ざらつき|ザラザラ|ぶつぶつ|ブツブツ/, "body_roughness"],
    [/におい|ニオイ|匂い|汗の/, "body_odor"],
    [/かゆ|カユ|敏感|ゆらぎ/, "sensitivity"],
    [/赤み|赤くな/, "redness"],
  ],
  makeup: [
    [/崩れ|くずれ|よれ|ヨレ|持ち|もち/, "makeup_lasting"],
    [/色落ち|落ちにく|色持ち|移り/, "color_transfer"],
    [/テカ|皮脂|脂っぽ/, "shine_control"],
    [/カバー|隠し|赤み|くま|クマ|色ムラ/, "coverage"],
    [/ツヤ|つや|うるおい感|グロス/, "dewy_look"],
    [/毛穴/, "pores"],
    [/乾燥|カサつ/, "dryness"],
  ],
  nailcare: [
    [/二枚爪|割れ|欠け|もろ|ボロボロ|折れ/, "nail_brittle"],
    [/甘皮|ささくれ|キューティクル/, "cuticle_care"],
    [/爪.{0,4}乾燥|爪が乾/, "nail_dryness"],
    [/手.{0,4}(乾燥|カサカサ|かさかさ|荒れ)|手荒れ/, "hand_dryness"],
    [/乾燥/, "hand_dryness"],
  ],
};

const CONCERN_RULES: Array<[RegExp, ConcernTag]> = [
  [/乾燥|カサカサ|かさかさ|粉ふ|突っ張/, "dryness"],
  [/テカ|皮脂|脂っぽ|べたつき/, "oiliness"],
  [/毛穴|黒ずみ/, "pores"],
  [/くすみ|しみ|シミ|そばかす|ソバカス|トーン/, "dullness"],
  [/ニキビ|にきび|吹き出物|肌荒れ/, "acne_prone"],
  [/ざらつき|ゴワゴワ|ごわつき|キメ|きめ/, "texture"],
  [/ハリ|たるみ|弾力/, "firmness"],
  [/紫外線|日焼け|uv|UV|日差し/, "uv_protection"],
  [/赤み|赤くな/, "redness"],
  [/敏感|ゆらぎ/, "sensitivity"],
];

const AVOID_INGREDIENT_RULES: Array<[RegExp, IngredientTag]> = [
  [/アルコール|エタノール/, "alcohol"],
  [/香料|香りが(苦手|きつ|強)|無香料が/, "fragrance"],
  [/精油|エッセンシャルオイル/, "essential_oil"],
  [/紫外線吸収剤|ケミカル/, "chemical_uv"],
  [/サリチル酸/, "salicylic_acid"],
  [/AHA|フルーツ酸/, "aha"],
];

const AVOID_TEXTURE_RULES: Array<[RegExp, TextureTag]> = [
  [/べたつ|ベタつ|ベタベタ|ねっとり/, "sticky"],
  [/重(い|たい)(のは|感じ)?|こっくり(は|が)?(苦手|嫌)/, "rich"],
  [/テカる仕上がり|ツヤは苦手|つやは苦手/, "dewy_finish"],
  [/マットは苦手/, "matte_finish"],
  [/油(っぽ|分が多)/, "oily_finish"],
];

/** 「避けたい」文脈かどうか（「乾燥が気になる」を除外条件にしないため） */
function avoidContext(text: string): boolean {
  return /避け|苦手|嫌|だめ|ダメ|NG|使えな|合わな|入ってない|なし|フリー|抜き/.test(
    text,
  );
}

function extractBudget(text: string): number | undefined {
  // 「3000円まで」「3,000円以内」「予算5000」「1万円」
  const man = text.match(/(\d+(?:\.\d+)?)\s*万円/);
  if (man) return Math.round(parseFloat(man[1]) * 10000);
  const yen = text.match(/(?:予算|上限)?\s*([0-9,]{3,7})\s*円?(?:まで|以内|くらい|程度)?/);
  if (yen) {
    const n = Number(yen[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 100 && n <= 100000) return n;
  }
  return undefined;
}

function extractMinutes(text: string): {
  morningMinutes?: number;
  nightMinutes?: number;
} {
  const out: { morningMinutes?: number; nightMinutes?: number } = {};
  const morning = text.match(/朝[^。、]{0,8}?(\d{1,2})\s*分/);
  if (morning) out.morningMinutes = clampMinutes(Number(morning[1]));
  const night = text.match(/(?:夜|寝る前|夜は)[^。、]{0,8}?(\d{1,2})\s*分/);
  if (night) out.nightMinutes = clampMinutes(Number(night[1]));
  return out;
}

const clampMinutes = (n: number) => Math.min(60, Math.max(1, n));

/** 自然文から読み取れる範囲だけを返す。読み取れない項目はキーごと省略する。 */
export function extractSlotsFromText(
  input: string,
  domain: Domain = "skincare",
): ProfilePatch {
  const text = normalize(input);
  const patch: ProfilePatch = {};

  if (domain === "skincare" || domain === "makeup") {
    for (const [re, tag] of SKIN_RULES) {
      if (re.test(text)) {
        patch.skinType = tag;
        break;
      }
    }
  }

  const concerns: ConcernTag[] = [];
  const rules =
    domain === "skincare" ? CONCERN_RULES : DOMAIN_CONCERN_RULES[domain];
  for (const [re, tag] of rules) {
    if (re.test(text) && !concerns.includes(tag)) concerns.push(tag);
  }
  if (concerns.length > 0) patch.concerns = concerns.slice(0, 5);

  if (avoidContext(text)) {
    const ings: IngredientTag[] = [];
    for (const [re, tag] of AVOID_INGREDIENT_RULES) {
      if (re.test(text) && !ings.includes(tag)) ings.push(tag);
    }
    if (ings.length > 0) patch.avoidIngredients = ings;

    const texts: TextureTag[] = [];
    for (const [re, tag] of AVOID_TEXTURE_RULES) {
      if (re.test(text) && !texts.includes(tag)) texts.push(tag);
    }
    if (texts.length > 0) patch.avoidTextures = texts;
  }

  const budget = extractBudget(text);
  if (budget !== undefined) patch.budgetYen = budget;

  Object.assign(patch, extractMinutes(text));

  if (/買わない|買い足さない|購入しない|今あるものだけ|手持ちだけ/.test(text)) {
    patch.allowPurchase = false;
  } else if (/買い足|購入したい|買ってもいい|買ってもよい/.test(text)) {
    patch.allowPurchase = true;
  }

  return patch;
}

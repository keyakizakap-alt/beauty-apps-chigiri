import type { Category, Domain, UsageTiming } from "@/schemas/product";

/**
 * 分野ごとの設定。
 *
 * 推薦エンジン本体は分野を知らない。使う順番・必要な役割・所要時間・
 * 工程の目的といった「分野に固有のこと」はすべてここに集める。
 * 新しい分野を足すときに触るのはこのファイルだけで済むようにしている。
 */

export type Severity = "critical" | "recommended" | "optional";

export type Requirement = { category: Category; severity: Severity };

export type DomainConfig = {
  domain: Domain;
  label: string;
  /** 使用順。この並びがそのままルーティンの順番になる */
  order: readonly Category[];
  /** 1工程あたりの推定所要時間(分) */
  minutes: Readonly<Record<string, number>>;
  /** 朝・夜それぞれで必要な役割 */
  requirements: Readonly<Record<UsageTiming, readonly Requirement[]>>;
  /** 工程の目的（許可表現の範囲内で書くこと） */
  purpose: Readonly<Record<string, string>>;
  /** 「朝」「夜」に代わる呼び方（分野によって時間帯の意味が違うため） */
  timingLabel: Readonly<Record<UsageTiming, string>>;
  /** 手持ちを指すときの呼び方（「化粧品」では髪や爪の相談に合わないため） */
  itemNoun: string;
  /** 肌の傾向が判断材料になる分野か */
  usesSkinType: boolean;
};

export const CATEGORY_LABEL: Record<Category, string> = {
  // スキンケア
  cleanser: "洗顔",
  lotion: "化粧水",
  serum: "美容液",
  moisturizer: "乳液・クリーム",
  sunscreen: "日焼け止め",
  // ヘア・頭皮ケア
  shampoo: "シャンプー",
  conditioner: "コンディショナー",
  hair_treatment: "ヘアトリートメント",
  scalp_care: "頭皮ケア",
  hair_outbath: "アウトバス（洗い流さない）",
  // ボディケア
  body_wash: "ボディウォッシュ",
  body_moisturizer: "ボディ保湿",
  body_special: "部分ケア",
  // メイク
  makeup_remover: "クレンジング",
  makeup_base: "化粧下地",
  foundation: "ファンデーション",
  face_powder: "フェイスパウダー",
  lip: "リップ",
  eye_makeup: "アイメイク",
  // ネイル・ハンド
  hand_wash: "ハンドウォッシュ",
  hand_cream: "ハンドクリーム",
  nail_oil: "ネイルオイル",
  nail_base: "ベースコート",
};

const SKINCARE: DomainConfig = {
  domain: "skincare",
  label: "スキンケア",
  order: ["cleanser", "lotion", "serum", "moisturizer", "sunscreen"],
  minutes: { cleanser: 2, lotion: 1, serum: 1, moisturizer: 1, sunscreen: 1 },
  requirements: {
    morning: [
      { category: "cleanser", severity: "optional" },
      { category: "lotion", severity: "critical" },
      { category: "serum", severity: "optional" },
      { category: "moisturizer", severity: "recommended" },
      { category: "sunscreen", severity: "critical" },
    ],
    night: [
      { category: "cleanser", severity: "critical" },
      { category: "lotion", severity: "critical" },
      { category: "serum", severity: "optional" },
      { category: "moisturizer", severity: "critical" },
    ],
  },
  purpose: {
    cleanser: "皮膚の汚れを落とし、肌を清浄にする工程",
    lotion: "洗顔後の肌にうるおいを与える工程",
    serum: "関心のある部分に集中してうるおいを届ける工程",
    moisturizer: "水分・油分を補い、うるおいを閉じ込める工程",
    sunscreen: "日やけを防ぎ、肌を保護する工程",
  },
  timingLabel: { morning: "朝", night: "夜" },
  itemNoun: "化粧品",
  usesSkinType: true,
};

const HAIRCARE: DomainConfig = {
  domain: "haircare",
  label: "ヘア・頭皮ケア",
  order: [
    "scalp_care",
    "shampoo",
    "conditioner",
    "hair_treatment",
    "hair_outbath",
  ],
  minutes: {
    scalp_care: 2,
    shampoo: 3,
    conditioner: 2,
    hair_treatment: 3,
    hair_outbath: 1,
  },
  requirements: {
    // 洗う日（多くの場合は夜）
    night: [
      { category: "scalp_care", severity: "optional" },
      { category: "shampoo", severity: "critical" },
      { category: "conditioner", severity: "critical" },
      { category: "hair_treatment", severity: "optional" },
      { category: "hair_outbath", severity: "recommended" },
    ],
    // 洗わない日（朝の整え）
    morning: [
      { category: "hair_outbath", severity: "recommended" },
      { category: "scalp_care", severity: "optional" },
    ],
  },
  purpose: {
    scalp_care: "頭皮を清浄にし、すこやかに保つ工程",
    shampoo: "頭皮と毛髪の汚れを落とす工程",
    conditioner: "毛髪をしなやかにし、クシどおりをよくする工程",
    hair_treatment: "毛髪にうるおいを与え、手ざわりを整える工程",
    hair_outbath: "乾かす前後に毛髪を保護し、つやを与える工程",
  },
  timingLabel: { morning: "洗わない日", night: "洗う日" },
  itemNoun: "ヘアケア用品",
  usesSkinType: false,
};

const BODYCARE: DomainConfig = {
  domain: "bodycare",
  label: "ボディケア",
  order: ["body_wash", "body_special", "body_moisturizer"],
  minutes: { body_wash: 3, body_special: 2, body_moisturizer: 2 },
  requirements: {
    night: [
      { category: "body_wash", severity: "critical" },
      { category: "body_special", severity: "optional" },
      { category: "body_moisturizer", severity: "critical" },
    ],
    morning: [{ category: "body_moisturizer", severity: "recommended" }],
  },
  purpose: {
    body_wash: "皮膚の汚れを落とし、清浄にする工程",
    body_special: "気になる部分にうるおいを届ける工程",
    body_moisturizer: "入浴後の乾燥を防ぎ、うるおいを保つ工程",
  },
  timingLabel: { morning: "朝", night: "入浴後" },
  itemNoun: "ボディケア用品",
  usesSkinType: true,
};

const MAKEUP: DomainConfig = {
  domain: "makeup",
  label: "メイク・コスメ",
  order: [
    "makeup_base",
    "foundation",
    "face_powder",
    "eye_makeup",
    "lip",
    "makeup_remover",
  ],
  minutes: {
    makeup_base: 1,
    foundation: 2,
    face_powder: 1,
    eye_makeup: 3,
    lip: 1,
    makeup_remover: 2,
  },
  requirements: {
    morning: [
      { category: "makeup_base", severity: "critical" },
      { category: "foundation", severity: "recommended" },
      { category: "face_powder", severity: "optional" },
      { category: "eye_makeup", severity: "optional" },
      { category: "lip", severity: "recommended" },
    ],
    night: [{ category: "makeup_remover", severity: "critical" }],
  },
  purpose: {
    makeup_base: "肌を整え、化粧のりを助ける工程",
    foundation: "肌を保護し、色味を整える工程",
    face_powder: "皮脂によるくずれを抑え、仕上がりを整える工程",
    eye_makeup: "目もとの色味を整える工程",
    lip: "口唇にうるおいを与え、色味を整える工程",
    makeup_remover: "メイクを落とし、皮膚を清浄にする工程",
  },
  timingLabel: { morning: "メイクする", night: "落とす" },
  itemNoun: "メイク用品",
  usesSkinType: true,
};

const NAILCARE: DomainConfig = {
  domain: "nailcare",
  label: "ネイル・ハンド",
  order: ["hand_wash", "nail_oil", "hand_cream", "nail_base"],
  minutes: { hand_wash: 1, nail_oil: 1, hand_cream: 1, nail_base: 3 },
  requirements: {
    night: [
      { category: "hand_wash", severity: "optional" },
      { category: "nail_oil", severity: "critical" },
      { category: "hand_cream", severity: "critical" },
      { category: "nail_base", severity: "optional" },
    ],
    morning: [
      { category: "hand_cream", severity: "recommended" },
      { category: "nail_oil", severity: "optional" },
    ],
  },
  purpose: {
    hand_wash: "手指の汚れを落とし、清浄にする工程",
    nail_oil: "爪と甘皮にうるおいを与え、爪を保護する工程",
    hand_cream: "手肌の乾燥を防ぎ、うるおいを保つ工程",
    nail_base: "爪の表面を保護する工程",
  },
  timingLabel: { morning: "日中", night: "寝る前" },
  itemNoun: "ネイル・ハンドケア用品",
  usesSkinType: false,
};

export const DOMAIN_CONFIG: Readonly<Record<Domain, DomainConfig>> = {
  skincare: SKINCARE,
  haircare: HAIRCARE,
  bodycare: BODYCARE,
  makeup: MAKEUP,
  nailcare: NAILCARE,
};

export function domainConfig(domain: Domain): DomainConfig {
  return DOMAIN_CONFIG[domain];
}

/** そのカテゴリーが属する分野 */
export const CATEGORY_DOMAIN: Readonly<Record<Category, Domain>> = (() => {
  const out = {} as Record<Category, Domain>;
  for (const config of Object.values(DOMAIN_CONFIG)) {
    for (const c of config.order) out[c] = config.domain;
  }
  return out;
})();

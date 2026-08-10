"use client";

import { DEFAULT_PROFILE, type Profile } from "@/schemas/profile";

/**
 * デモ用のシナリオ。
 *
 * 手持ち商品を1点ずつ選ぶところから始めると、結論に届くまでに時間がかかる。
 * 審査や紹介の場で、判断の中身をすぐ見てもらうための入口。
 *
 * 中身は実際のカタログ ID と実在の条件だけで構成し、
 * 結果は通常の経路とまったく同じ計算から出す（デモ用の分岐は作らない）。
 */

export type DemoScenario = {
  id: string;
  title: string;
  /** この例で何が見えるか */
  highlight: string;
  description: string;
  profile: Profile;
  /** 続けて投げる想定の一言 */
  followUp: string;
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "one-missing",
    title: "1点だけ足りない人",
    highlight: "買い足しは1点だけ",
    description:
      "洗顔・化粧水・美容液・乳液は持っているが、日焼け止めがない。朝の紫外線対策だけが不足していると判定し、予算内の候補を比較する。",
    profile: {
      ...DEFAULT_PROFILE,
      skinType: "combination",
      concerns: ["dryness", "pores"],
      budgetYen: 2000,
      morningMinutes: 3,
      nightMinutes: 10,
      ownedProductIds: [
        "cl-senka-perfectwhip",
        "lo-hadalabo-gokujyun",
        "se-melanocc-premium",
        "mo-nivea-cream",
      ],
      statedFields: [
        "skinType",
        "concerns",
        "budgetYen",
        "morningMinutes",
        "ownedProductIds",
      ],
    },
    followUp: "予算を1000円に変えて計算し直して",
  },
  {
    id: "no-purchase",
    title: "買わなくていい人",
    highlight: "買い足し不要と判定",
    description:
      "必要な役割がすべて手持ちでそろっている。商品を勧めず「買い足しは必要ありません」と答える、このサービスの中心的な結果。",
    profile: {
      ...DEFAULT_PROFILE,
      skinType: "dry",
      concerns: ["dryness"],
      budgetYen: 3000,
      morningMinutes: 5,
      nightMinutes: 10,
      ownedProductIds: [
        "cl-curel-foam",
        "lo-hadalabo-gokujyun",
        "se-melanocc-premium",
        // 朝夜どちらでも使える乳液。夜専用のクリームだと朝の枠が空き、
        // 「買い足し不要」にならないため、この例では朝も使えるものを持たせている。
        "mo-hadalabo-gokujyun-milk",
        "su-biore-aquarich",
      ],
      statedFields: ["skinType", "concerns", "ownedProductIds"],
    },
    followUp: "朝は3分しか時間がありません",
  },
  {
    id: "duplicated",
    title: "重複買いしていた人",
    highlight: "役割の重複を指摘",
    description:
      "化粧水を2本、洗顔を2つ持っている。役割が重なっている商品と、今回使わない理由を提示する。",
    profile: {
      ...DEFAULT_PROFILE,
      skinType: "sensitive",
      concerns: ["sensitivity", "dryness"],
      avoidIngredients: ["alcohol"],
      budgetYen: 2500,
      morningMinutes: 5,
      nightMinutes: 12,
      ownedProductIds: [
        "cl-curel-foam",
        "cl-senka-perfectwhip",
        "lo-hadalabo-gokujyun",
        "lo-curel-lotion3",
        "mo-curel-facecream",
        "se-melanocc-premium",
      ],
      statedFields: [
        "skinType",
        "concerns",
        "avoidIngredients",
        "ownedProductIds",
      ],
    },
    followUp: "アルコールが入っているものは避けたいです",
  },
  {
    id: "tight-budget",
    title: "予算が足りない人",
    highlight: "無理に勧めない",
    description:
      "不足はあるが予算が候補の最安値に届かない。条件に合う商品がないことを説明し、購入を勧めずに見送りを提案する。",
    profile: {
      ...DEFAULT_PROFILE,
      skinType: "oily",
      concerns: ["oiliness", "pores"],
      budgetYen: 300,
      morningMinutes: 4,
      nightMinutes: 8,
      ownedProductIds: ["cl-biore-thefacefoam", "lo-hadalabo-gokujyun"],
      statedFields: ["skinType", "concerns", "budgetYen", "ownedProductIds"],
    },
    followUp: "予算を3000円に上げたらどうなりますか",
  },
];

export function findScenario(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.id === id);
}

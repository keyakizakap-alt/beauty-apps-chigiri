import type { Domain } from "@/schemas/product";

/**
 * 相談先（美容コンシェルジュ）。
 *
 * 分野ごとに担当を分け、会話の入口を「誰に相談するか」から始められるようにする。
 * 担当は分野そのものと1対1で対応し、選ぶと商品カタログ・工程・キーワード抽出が
 * まとめてその分野に切り替わる。
 */
export type Concierge = {
  id: string;
  /** アバターに出す頭文字 */
  initial: string;
  name: string;
  area: string;
  /** 担当する分野 */
  domain: Domain;
  /** 会話の冒頭に出す大見出し */
  heading: readonly string[];
  /** 見出しの下に添える一文 */
  subheading: string;
  /** 最初の発話（挨拶のあとに続く） */
  opening: string;
  /** 冒頭に出すクイック選択肢。押すとそのまま送信される */
  quickChoices: readonly string[];
};

export const CONCIERGES: readonly Concierge[] = [
  {
    id: "arca",
    initial: "A",
    name: "ARCA",
    area: "スキンケア",
    domain: "skincare",
    heading: ["今の悩みを、", "そのまま聞かせてください。"],
    subheading: "普段使っているものや、いつもの過ごし方も教えてください。",
    opening:
      "ARCAです。肌のことで、今いちばん気になっていることは何ですか？ 小さな違和感でも大丈夫です。",
    quickChoices: [
      "乾燥が気になる",
      "毛穴やキメが気になる",
      "日によって肌がゆらぐ",
      "何を使えばいいか分からない",
    ],
  },
  {
    id: "silqa",
    initial: "S",
    name: "SILQA",
    area: "ヘア・頭皮ケア",
    domain: "haircare",
    heading: ["髪と頭皮のこと、", "順番から整えましょう。"],
    subheading:
      "今お使いのシャンプーやトリートメント、乾かし方も教えてください。",
    opening:
      "SILQAです。髪や頭皮で、今いちばん気になっていることは何ですか？ 手ざわりの変化でも構いません。",
    quickChoices: [
      "パサつきや広がりが気になる",
      "頭皮がべたつく",
      "頭皮が乾燥してかゆい",
      "カラーの色落ちが早い",
    ],
  },
  {
    id: "soma",
    initial: "S",
    name: "SOMA",
    area: "ボディケア",
    domain: "bodycare",
    heading: ["体のケアも、", "続けられる形にしましょう。"],
    subheading: "入浴のあとの習慣や、今お使いのものも教えてください。",
    opening:
      "SOMAです。体のことで、今いちばん気になっていることは何ですか？ 部位が決まっていなくても大丈夫です。",
    quickChoices: [
      "全身の乾燥が気になる",
      "腕や脚のざらつきが気になる",
      "入浴後すぐ乾燥する",
      "汗のにおいが気になる",
    ],
  },
  {
    id: "tinta",
    initial: "T",
    name: "TINTA",
    area: "メイク・コスメ",
    domain: "makeup",
    heading: ["メイクの悩みは、", "順番と落とし方から。"],
    subheading: "使う場面や、何時間つけているかも教えてください。",
    opening:
      "TINTAです。メイクで、今いちばん気になっていることは何ですか？ 崩れ方や色持ちのことでも構いません。",
    quickChoices: [
      "夕方には崩れてしまう",
      "リップの色落ちが早い",
      "テカリを抑えたい",
      "毛穴をカバーしたい",
    ],
  },
  {
    id: "unea",
    initial: "U",
    name: "UNEA",
    area: "ネイル・ハンド",
    domain: "nailcare",
    heading: ["爪と手のこと、", "無理なく続けましょう。"],
    subheading: "水仕事の頻度や、今お使いのものも教えてください。",
    opening:
      "UNEAです。爪や手で、今いちばん気になっていることは何ですか？ 乾燥や割れやすさなど、どんなことでも大丈夫です。",
    quickChoices: [
      "爪が割れやすい・二枚爪になる",
      "手がカサカサする",
      "ささくれや甘皮が気になる",
      "水仕事が多い",
    ],
  },
];

export const DEFAULT_CONCIERGE: Concierge = CONCIERGES[0];

export function findConcierge(id: string): Concierge {
  return CONCIERGES.find((c) => c.id === id) ?? DEFAULT_CONCIERGE;
}

export function conciergeForDomain(domain: Domain): Concierge {
  return CONCIERGES.find((c) => c.domain === domain) ?? DEFAULT_CONCIERGE;
}

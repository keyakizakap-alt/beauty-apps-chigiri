/**
 * 相談先（美容コンシェルジュ）。
 *
 * 分野ごとに担当を分け、会話の入口を「誰に相談するか」から始められるようにする。
 *
 * 現在の推薦エンジンが扱えるのはスキンケアのみ。
 * 他の分野は ready:false とし、UI では「準備中」と明示して選択できないようにする。
 * 押せるのに何も起きない導線は作らない。
 */
export type Concierge = {
  id: string;
  /** アバターに出す頭文字 */
  initial: string;
  name: string;
  area: string;
  ready: boolean;
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
    ready: true,
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
    ready: false,
    heading: [],
    subheading: "",
    opening: "",
    quickChoices: [],
  },
  {
    id: "soma",
    initial: "S",
    name: "SOMA",
    area: "ボディケア",
    ready: false,
    heading: [],
    subheading: "",
    opening: "",
    quickChoices: [],
  },
  {
    id: "tinta",
    initial: "T",
    name: "TINTA",
    area: "メイク・コスメ",
    ready: false,
    heading: [],
    subheading: "",
    opening: "",
    quickChoices: [],
  },
  {
    id: "unea",
    initial: "U",
    name: "UNEA",
    area: "ネイル・ハンド",
    ready: false,
    heading: [],
    subheading: "",
    opening: "",
    quickChoices: [],
  },
];

export const DEFAULT_CONCIERGE: Concierge = CONCIERGES[0];

export function findConcierge(id: string): Concierge {
  return CONCIERGES.find((c) => c.id === id) ?? DEFAULT_CONCIERGE;
}

/**
 * 相談先（美容コンシェルジュ）。
 *
 * 現在の推薦エンジンはスキンケアのみに対応している。
 * 他の分野は ready:false とし、UI で「準備中」と明示する。
 * 押せるのに何も起きない導線は作らない。
 */
export type Concierge = {
  id: string;
  initial: string;
  name: string;
  area: string;
  ready: boolean;
  /** 会話の最初の一言 */
  opening: string;
  /** 最初に出すクイック選択肢 */
  quickChoices: string[];
};

export const CONCIERGES: readonly Concierge[] = [
  {
    id: "arca",
    initial: "A",
    name: "ARCA",
    area: "スキンケア",
    ready: true,
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
    opening: "",
    quickChoices: [],
  },
  {
    id: "soma",
    initial: "S",
    name: "SOMA",
    area: "ボディケア",
    ready: false,
    opening: "",
    quickChoices: [],
  },
  {
    id: "tinta",
    initial: "T",
    name: "TINTA",
    area: "メイク・コスメ",
    ready: false,
    opening: "",
    quickChoices: [],
  },
  {
    id: "unea",
    initial: "U",
    name: "UNEA",
    area: "ネイル・ハンド",
    ready: false,
    opening: "",
    quickChoices: [],
  },
];

export const DEFAULT_CONCIERGE = CONCIERGES[0];

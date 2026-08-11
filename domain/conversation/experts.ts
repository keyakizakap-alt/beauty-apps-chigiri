/**
 * 相談できる分野（専門家）の定義。
 *
 * スキンケアだけを扱っていたが、髪・体・生活の相談も同じ場所で
 * 受けられるようにする。分野ごとに聞くことは違うが、
 * 「今あるもの・今の習慣から整える」という考え方は共通で、
 * 一度伺った条件（時間・予算・避けたいもの）は分野をまたいで引き継ぐ。
 *
 * 分野の選択・聞き取り・組み立ては、すべてここと care-plan で決める。
 * AI は関与しない（同じ答えなら同じ内容になる）。
 */

import { ExpertIdSchema, type ExpertId } from "@/schemas/profile";
import type { QuickReply } from "./quick-reply";

/** 語彙はスキーマ側が持つ。ここで二重に列挙しない。 */
export const EXPERT_IDS = ExpertIdSchema.options;
export type { ExpertId };

export const DEFAULT_EXPERT: ExpertId = "skincare";

export function isExpertId(v: unknown): v is ExpertId {
  return ExpertIdSchema.safeParse(v).success;
}

/** 聞き取りの語彙。自由文からの拾い上げも、選択肢の提示もこれ1つで賄う。 */
export type Topic = {
  id: string;
  label: string;
  /** 自由文から拾うための表現 */
  match: RegExp;
  /** 選択肢として押されたときに送る文 */
  send: string;
};

export type Expert = {
  id: ExpertId;
  /** 選択ボタンに出す短い名前 */
  label: string;
  /** 相手が誰かを示す一行 */
  title: string;
  mark: string;
  /** この分野で何をするか */
  tagline: string;
  /**
   * 手持ちのカタログから商品まで提案できるか。
   * カタログは現状スキンケアのみ。無いものを「ある」ことにしない。
   */
  recommendsProducts: boolean;
  /** 最初の問いかけ */
  opening: string;
  /** 気になっていることの選択肢 */
  concerns: Topic[];
  /** いまの手入れ・習慣の選択肢 */
  habits: Topic[];
  /** 手入れ・習慣を尋ねる文 */
  habitQuestion: string;
  /** 気をつけたいことを尋ねる文 */
  constraintQuestion: string;
  /** 商品の提案ができない分野で、その理由を伝える文 */
  scopeNote: string | null;
};

/* ------------------------------------------------------------------ *
 * ヘアケア
 * ------------------------------------------------------------------ */

const HAIR_CONCERNS: Topic[] = [
  {
    id: "hair_dry",
    label: "パサつき",
    match: /パサ|ぱさ|乾燥した髪|髪が乾燥|ごわつ/,
    send: "髪のパサつきが気になります",
  },
  {
    id: "hair_frizz",
    label: "うねり・広がり",
    match: /うねり|うねる|広がり|広がる|くせ毛|クセ毛|まとまらな/,
    send: "うねりや広がりが気になります",
  },
  {
    id: "hair_damage",
    label: "ダメージ・枝毛",
    match: /ダメージ|枝毛|切れ毛|傷ん|痛んだ髪|きしむ|絡ま/,
    send: "ダメージや枝毛が気になります",
  },
  {
    id: "scalp_oil",
    label: "頭皮のべたつき",
    match: /頭皮.*(べた|ベタ|脂|あぶら)|髪が(べた|ペタ)|夕方.*(べた|ベタ)/,
    send: "頭皮のべたつきが気になります",
  },
  {
    id: "scalp_dry",
    label: "頭皮の乾燥・フケ",
    match: /フケ|ふけ|頭皮.*(乾燥|かゆ|痒)|頭がかゆ/,
    send: "頭皮の乾燥やフケが気になります",
  },
  {
    id: "hair_volume",
    label: "ぺたんこ",
    match: /ぺたんこ|ペタンコ|ボリューム|根元が立たな|トップが/,
    send: "根元がぺたんこになるのが気になります",
  },
  {
    id: "hair_color",
    label: "カラーの色落ち",
    match: /色落ち|退色|カラー.*(落ち|もち|持ち)|ブリーチ/,
    send: "カラーの色落ちが気になります",
  },
];

const HAIR_HABITS: Topic[] = [
  {
    id: "air_dry",
    label: "自然乾燥が多い",
    match: /自然乾燥|乾かさ(ない|ず)|そのまま寝/,
    send: "洗ったあとは自然乾燥にすることが多いです",
  },
  {
    id: "dry_fully",
    label: "毎回しっかり乾かす",
    match: /しっかり乾かし|毎回乾かし|ドライヤー.*(使|かけ)/,
    send: "毎回ドライヤーでしっかり乾かしています",
  },
  {
    id: "heat_styling",
    label: "アイロン・コテを使う",
    match: /アイロン|コテ|巻いて|ストレートアイロン/,
    send: "アイロンやコテをよく使います",
  },
  {
    id: "wash_daily",
    label: "毎日洗う",
    match: /毎日洗|毎日シャンプー|1日2回洗/,
    send: "毎日シャンプーしています",
  },
  {
    id: "treatment",
    label: "トリートメントは使っている",
    match: /トリートメント|コンディショナー|リンス|ヘアオイル|ヘアミルク/,
    send: "トリートメントやヘアオイルは使っています",
  },
];

/* ------------------------------------------------------------------ *
 * ボディケア
 * ------------------------------------------------------------------ */

const BODY_CONCERNS: Topic[] = [
  {
    id: "body_dry",
    label: "乾燥・粉ふき",
    match: /(体|からだ|カラダ|脚|足|腕|背中|お腹).*(乾燥|かさつ|カサつ)|粉ふき|粉を吹/,
    send: "体の乾燥が気になります",
  },
  {
    id: "body_itch",
    label: "かゆみ",
    match: /かゆ|痒|むずむず/,
    send: "肌のかゆみが気になります",
  },
  {
    id: "body_rough",
    label: "ざらつき（ひじ・ひざ）",
    match: /ざらつ|ザラつ|ごわご|ひじ|ひざ|肘|膝|かかと|踵/,
    send: "ひじやひざのざらつきが気になります",
  },
  {
    id: "body_bumps",
    label: "背中・胸のブツブツ",
    match: /背中.*(ブツブツ|ぶつぶつ|できもの)|胸元.*(ブツブツ|ぶつぶつ)|二の腕.*(ブツブツ|ぶつぶつ)/,
    send: "背中や胸元のブツブツが気になります",
  },
  {
    id: "body_odor",
    label: "におい・汗",
    match: /におい|ニオイ|匂い|臭|汗が|汗ばむ/,
    send: "汗やにおいが気になります",
  },
  {
    id: "body_uv",
    label: "日焼け",
    match: /日焼け|焼けた|紫外線.*(体|腕|脚)/,
    send: "体の日焼けが気になります",
  },
];

const BODY_HABITS: Topic[] = [
  {
    id: "hot_bath",
    label: "熱めのお湯につかる",
    match: /熱(い|め).*(風呂|湯|シャワー)|42度|43度|長風呂/,
    send: "お風呂は熱めのお湯につかることが多いです",
  },
  {
    id: "scrub_wash",
    label: "ナイロンタオルでこする",
    match: /ナイロン|タオルでこす|ゴシゴシ|ごしごし|ボディブラシ/,
    send: "ナイロンタオルでゴシゴシ洗っています",
  },
  {
    id: "no_moisturize",
    label: "体には何も塗っていない",
    match: /(体|からだ).*(何も塗|塗ってな|保湿してな)|ボディクリーム.*(使ってな|持ってな)/,
    send: "体には特に何も塗っていません",
  },
  {
    id: "body_lotion",
    label: "ボディクリームは使っている",
    match: /ボディ(クリーム|ミルク|ローション|オイル)|ワセリン|保湿剤/,
    send: "ボディクリームは使っています",
  },
  {
    id: "shower_only",
    label: "シャワーだけ",
    match: /シャワーだけ|湯船につから|浴槽に入らな/,
    send: "お風呂はシャワーだけで済ませています",
  },
];

/* ------------------------------------------------------------------ *
 * ヘルスケア（生活習慣の整理のみ。診断も治療も扱わない）
 * ------------------------------------------------------------------ */

const HEALTH_CONCERNS: Topic[] = [
  {
    id: "sleep",
    label: "睡眠のリズム",
    match: /睡眠|寝不足|寝つ|眠れ|夜更かし|早起き|起きられ/,
    send: "睡眠のリズムを整えたいです",
  },
  {
    id: "hydration",
    label: "水分のとり方",
    match: /水分|水を飲|喉が渇|カフェイン|コーヒーばかり/,
    send: "水分のとり方を整えたいです",
  },
  {
    id: "meals",
    label: "食事の時間",
    match: /食事|朝ごはん|朝食|夜食|間食|食べる時間|外食/,
    send: "食事の時間を整えたいです",
  },
  {
    id: "movement",
    label: "体を動かす習慣",
    match: /運動|歩く|階段|ストレッチ|座りっぱなし|デスクワーク/,
    send: "体を動かす習慣をつくりたいです",
  },
  {
    id: "screen",
    label: "画面を見る時間",
    match: /スマホ|画面|パソコン|ブルーライト|目が疲れ/,
    send: "画面を見る時間を見直したいです",
  },
  {
    id: "pace",
    label: "気持ちの余裕",
    match: /忙し|余裕がな|気が休まら|落ち着かな|ストレス/,
    send: "毎日に少し余裕をつくりたいです",
  },
];

const HEALTH_HABITS: Topic[] = [
  {
    id: "late_night",
    label: "就寝が遅い",
    match: /(1|2|3|１|２|３)時に寝|深夜|夜中まで|寝るのが遅/,
    send: "寝るのが遅くなりがちです",
  },
  {
    id: "irregular_wake",
    label: "起きる時刻がまちまち",
    match: /起きる時間.*(バラバラ|まちまち|違)|休みの日は昼まで/,
    send: "起きる時刻が日によってまちまちです",
  },
  {
    id: "skip_breakfast",
    label: "朝食を抜くことが多い",
    match: /朝(食|ごはん).*(抜|食べな|とらな)/,
    send: "朝食を抜くことが多いです",
  },
  {
    id: "desk_bound",
    label: "座っている時間が長い",
    match: /座りっぱ|ずっと座|デスクワーク|在宅/,
    send: "一日じゅう座っていることが多いです",
  },
  {
    id: "night_screen",
    label: "寝る直前まで画面を見る",
    match: /寝る(直前|前).*(スマホ|画面|見)|布団の中でスマホ/,
    send: "寝る直前までスマホを見ています",
  },
];

/* ------------------------------------------------------------------ *
 * スキンケア（既存の流れを持つ分野。語彙は routine-builder 側と共有）
 * ------------------------------------------------------------------ */

const SKIN_CONCERNS: Topic[] = [
  { id: "dryness", label: "乾燥", match: /乾燥|かさつ/, send: "乾燥が気になります" },
  { id: "pores", label: "毛穴", match: /毛穴/, send: "毛穴が気になります" },
  {
    id: "oiliness",
    label: "ベタつき",
    match: /皮脂|テカ|ベタつ|べたつ/,
    send: "皮脂やベタつきが気になります",
  },
  { id: "dullness", label: "くすみ", match: /くすみ|くすん/, send: "くすみが気になります" },
  {
    id: "sensitivity",
    label: "肌あれ",
    match: /肌あれ|肌荒れ|ゆらぎ|敏感/,
    send: "肌あれしやすいです",
  },
  {
    id: "texture",
    label: "日によってゆらぐ",
    match: /日によって|ざらつ|キメ/,
    send: "日によって肌がゆらぎます",
  },
];

/* ------------------------------------------------------------------ */

export const EXPERTS: Record<ExpertId, Expert> = {
  skincare: {
    id: "skincare",
    label: "スキンケア",
    title: "スキンケアの相談",
    mark: "◍",
    tagline: "手持ちの化粧品から、朝と夜の順番を組み立てます。",
    recommendsProducts: true,
    opening:
      "肌のことでいちばん気になっているところから、ゆっくり聞かせてください。",
    concerns: SKIN_CONCERNS,
    habits: [],
    habitQuestion: "",
    constraintQuestion: "",
    scopeNote: null,
  },

  haircare: {
    id: "haircare",
    label: "ヘアケア",
    title: "ヘアケアの相談",
    mark: "≋",
    tagline: "洗い方と乾かし方から、今の髪に合う手順を整えます。",
    recommendsProducts: false,
    opening:
      "髪や頭皮のことで、いちばん気になっているのはどんなところですか。",
    concerns: HAIR_CONCERNS,
    habits: HAIR_HABITS,
    habitQuestion:
      "いま、髪はどんなふうに洗って乾かしていますか。\n当てはまるものを選んでいただくだけでも大丈夫です。",
    constraintQuestion:
      "髪や頭皮のことで、気をつけていることはありますか。\n特になければ「特にない」で構いません。",
    scopeNote:
      "ヘアケアは商品のカタログをまだ持っていないため、具体的な商品名の提案はしません。いまお使いのものと手順の見直しでご案内します。",
  },

  bodycare: {
    id: "bodycare",
    label: "ボディケア",
    title: "ボディケアの相談",
    mark: "◯",
    tagline: "洗い方とお風呂上がりの手順から、体の乾燥を整えます。",
    recommendsProducts: false,
    opening: "体のことで、いちばん気になっているのはどんなところですか。",
    concerns: BODY_CONCERNS,
    habits: BODY_HABITS,
    habitQuestion:
      "いま、お風呂ではどんなふうに洗っていますか。\n当てはまるものを選んでいただくだけでも大丈夫です。",
    constraintQuestion:
      "体のことで、気をつけていることはありますか。\n特になければ「特にない」で構いません。",
    scopeNote:
      "ボディケアは商品のカタログをまだ持っていないため、具体的な商品名の提案はしません。いまお使いのものと手順の見直しでご案内します。",
  },

  healthcare: {
    id: "healthcare",
    label: "ヘルスケア",
    title: "生活リズムの相談",
    mark: "☾",
    tagline: "睡眠・食事・体を動かす時間を、続く形に置き直します。",
    recommendsProducts: false,
    opening:
      "毎日の過ごし方で、いちばん整えたいのはどんなところですか。",
    concerns: HEALTH_CONCERNS,
    habits: HEALTH_HABITS,
    habitQuestion:
      "いまの一日の流れを、ざっくり教えてください。\n当てはまるものを選んでいただくだけでも大丈夫です。",
    constraintQuestion:
      "生活の中で、動かせない予定や譲れないことはありますか。\n特になければ「特にない」で構いません。",
    scopeNote:
      "ここで扱うのは生活習慣の整理だけです。体調そのものの判断や、症状・お薬のご相談はお受けできません。気になる症状があるときは医療機関へご相談ください。",
  },
};

export const EXPERT_LIST: Expert[] = EXPERT_IDS.map((id) => EXPERTS[id]);

/**
 * 肌の話としてしか意味を持たない項目。
 *
 * 条件の抽出器は肌の語彙で書かれているため、
 * 「髪のパサつき」を肌の乾燥、「ひじのざらつき」を肌のキメと読み違える。
 * 別の分野の発言でこれらを書き換えてしまうと、引き継ぎのときに
 * 「肌のご相談で伺った」と言えなくなる（言っていないことになる）。
 *
 * 時間・予算・避けたい成分は分野をまたいで意味が変わらないので共有する。
 */
export const SKIN_ONLY_FIELDS = [
  "skinType",
  "concerns",
  "avoidTextures",
] as const;

/** その分野の発言から書き換えてよい項目だけを残す */
export function scopePatchToExpert<T extends Record<string, unknown>>(
  expert: ExpertId,
  patch: T,
): Partial<T> {
  if (EXPERTS[expert].recommendsProducts) return { ...patch };
  const scoped: Partial<T> = { ...patch };
  for (const field of SKIN_ONLY_FIELDS) delete scoped[field as keyof T];
  return scoped;
}

/** 自由文から、その分野の関心事を拾う（決定論的な文字列一致のみ） */
export function detectTopics(expert: ExpertId, text: string): string[] {
  const normalized = text.normalize("NFKC");
  return EXPERTS[expert].concerns
    .filter((t) => t.match.test(normalized))
    .map((t) => t.id);
}

/** 自由文から、いまの手入れ・習慣を拾う */
export function detectHabits(expert: ExpertId, text: string): string[] {
  const normalized = text.normalize("NFKC");
  return EXPERTS[expert].habits
    .filter((t) => t.match.test(normalized))
    .map((t) => t.id);
}

/** 分野内での表示名 */
export function topicLabel(expert: ExpertId, id: string): string {
  const e = EXPERTS[expert];
  return (
    e.concerns.find((t) => t.id === id)?.label ??
    e.habits.find((t) => t.id === id)?.label ??
    id
  );
}

export function toQuickReplies(topics: Topic[]): QuickReply[] {
  return topics.map((t) => ({ label: t.label, send: t.send }));
}

/**
 * 分野の切り替えを求める発言か。
 *
 * 画面上の選択が本来の入口だが、会話の中で言われることもある。
 * 「髪」「体」だけでは他の話題と紛れるため、切り替えを表す言い回しを伴う場合に限る。
 */
/** 切り替えの意思を表す動詞 */
const SWITCH_VERB = "(相談|聞き|教え|戻|変え|切り替え|整え|お願い)";

/**
 * 分野を指す言葉と動詞のあいだは、助詞や短い修飾語しか置かない前提にする。
 * 離れているほど「話題に触れただけ」の可能性が高くなるため、距離で切る。
 *
 * 「体調管理」は体ではなく生活の話なので、ボディケア側から除いておく。
 */
const SWITCH_CUES: Array<{ expert: ExpertId; pattern: RegExp }> = [
  { expert: "haircare", pattern: new RegExp(`(髪|ヘア|頭皮|シャンプー)[^。！？\\n]{0,8}?${SWITCH_VERB}`) },
  {
    expert: "healthcare",
    pattern: new RegExp(`(生活|睡眠|健康|ヘルスケア|体調)[^。！？\\n]{0,8}?${SWITCH_VERB}`),
  },
  {
    expert: "bodycare",
    pattern: new RegExp(`(からだ|ボディ|全身|体(?!調))[^。！？\\n]{0,8}?${SWITCH_VERB}`),
  },
  {
    expert: "skincare",
    pattern: new RegExp(`(肌|スキンケア|化粧品)[^。！？\\n]{0,8}?${SWITCH_VERB}`),
  },
];

export function detectExpertSwitch(text: string): ExpertId | null {
  const normalized = text.normalize("NFKC");
  for (const cue of SWITCH_CUES) {
    if (cue.pattern.test(normalized)) return cue.expert;
  }
  return null;
}

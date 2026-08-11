import type { SafetyNotice } from "@/schemas/recommendation";
import type { ExpertId } from "@/schemas/profile";
import { BANNED_PATTERNS } from "./catalog";

export const DISCLAIMER =
  "本サービスは美容情報の整理を目的としたもので、医療上の診断や治療を提供するものではありません。肌に異常がある場合は使用を中止し、医師や専門家へ相談してください。表示している情報は AI が生成した文章を含みます。";

/**
 * 受診勧奨レベルのシグナル。
 * これが立った場合、推薦は行わない（減点ではなく停止）。
 */
const RED_FLAG_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(強い|激しい|ひどい)?痛(み|い)/, label: "痛み" },
  { pattern: /腫れ|腫れて|むくんで痛/, label: "腫れ" },
  { pattern: /出血|血が出/, label: "出血" },
  { pattern: /膿|化膿/, label: "化膿" },
  { pattern: /水ぶくれ|水疱/, label: "水疱" },
  { pattern: /やけど|火傷/, label: "熱傷" },
  { pattern: /急激に(悪化|ひどく)|どんどん悪化|悪化し続け/, label: "急激な悪化" },
  { pattern: /じゅくじゅく|ただれ/, label: "びらん" },
  { pattern: /アナフィラキシー|呼吸が苦し|息が苦し/, label: "全身症状" },
  { pattern: /顔が腫れ|唇が腫れ|まぶたが腫れ/, label: "顔面の腫脹" },
];

/** 医療的な相談を求めていると判断されるシグナル */
const MEDICAL_REQUEST_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /アトピー|皮膚炎|酒さ|しゅさ|帯状疱疹|水虫/, label: "疾患名" },
  { pattern: /治し(たい|て)|治る|完治|治療/, label: "治療の相談" },
  { pattern: /処方|皮膚科の薬|ステロイド|抗生物質/, label: "医薬品" },
];

/**
 * 生命に関わる可能性のあるシグナル。
 *
 * 分野を問わず最優先で拾う。ここで拾ったときは、
 * 提案も助言も行わず、相談先だけをお伝えする。
 */
const CRISIS_PATTERNS =
  /死にたい|消えたい|生きているのが(つら|辛)|自殺|自傷|リストカット|OD(した|して)|オーバードーズ/;

const CRISIS_MESSAGE =
  "つらい状態が書かれていました。ここでお答えするより、話を聞ける窓口につながっていただくほうが確かです。" +
  "こころの健康相談統一ダイヤル（0570-064-556）で、お住まいの地域の相談窓口につながります。" +
  "いますぐ危険がある場合は 119 番へご連絡ください。";

/**
 * 体調そのものに関わるシグナル。
 *
 * ヘルスケアの相談では生活習慣の整理までしか扱わない。
 * ここに当たる内容は、生活習慣の話に置き換えずに止める。
 */
const HEALTH_URGENT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /胸(が|の)痛|動悸|息切れ|息苦し/, label: "胸や呼吸の症状" },
  { pattern: /めまい|立ちくらみ|失神|意識が(飛|遠)/, label: "めまい・意識の症状" },
  /*
   * 温度そのものは日常語（湯温など）でも出るため、
   * 発熱を指していると読める形に限って拾う。
   */
  { pattern: /高熱|熱が下がら|(3[89]|40)度.{0,3}(熱|発熱)|熱が(3[89]|40)度/, label: "発熱" },
  { pattern: /しびれ|ろれつ|手足が動か/, label: "しびれ・麻痺" },
  { pattern: /血を吐|血便|不正出血/, label: "出血" },
  { pattern: /体重が(急|一気)|急に(\d+)?キロ(痩|や)せ/, label: "急激な体重の変化" },
  { pattern: /一睡もでき|眠れない日が(続|何日)|何日も眠れ/, label: "続く不眠" },
];

/**
 * 判断を求められているが、こちらでは扱えない領域。
 * 分野を問わず、化粧品と生活習慣の外にあるもの。
 */
const OUT_OF_SCOPE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /サプリ(メント)?|(市販|飲み|処方)薬|薬を(飲|服用|使)|服用/, label: "薬・サプリメント" },
  { pattern: /ダイエット|断食|ファスティング|糖質制限|何キロ(痩|落と)/, label: "減量" },
];

/**
 * 止めるほどではないが、こちらの前提を先に伝えるべき状態。
 *
 * 妊娠・授乳中は「使ってよい／いけない」を判断できないが、
 * 相談そのものを断ると、いま持っているものを整理する手段まで失われる。
 * 進めたうえで、判断はしないことを明示する。
 */
const CAUTION_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /妊娠|授乳|妊活|マタニティ/,
    message:
      "妊娠・授乳中に使ってよいかどうかの判断は、このサービスでは行いません。" +
      "手持ちのものをどう組み合わせるかまではご案内できますので、" +
      "個々の成分については、かかりつけの医師や薬剤師へご確認ください。",
  },
];

export type SafetyGate =
  | { kind: "ok"; notices: SafetyNotice[] }
  | { kind: "stop"; notices: SafetyNotice[] };

/**
 * ユーザーの自由入力に対する安全ゲート。
 * 推薦処理より前に実行し、stop の場合は商品提案も手順の提示も一切行わない。
 *
 * @param expert 相談中の分野。ヘルスケアでは扱える範囲がさらに狭い。
 */
export function evaluateSafety(
  freeText: string,
  expert: ExpertId = "skincare",
): SafetyGate {
  const text = freeText.normalize("NFKC");
  const notices: SafetyNotice[] = [];

  if (CRISIS_PATTERNS.test(text)) {
    notices.push({ level: "stop", message: CRISIS_MESSAGE });
    return { kind: "stop", notices };
  }

  const urgent = HEALTH_URGENT_PATTERNS.filter((r) => r.pattern.test(text));
  if (urgent.length > 0) {
    notices.push({
      level: "stop",
      message:
        `「${urgent.map((r) => r.label).join("・")}」に当てはまる可能性のある状態が書かれていました。` +
        "体調そのものの判断は、このサービスでは行いません。生活習慣の話に置き換えずに、" +
        "医療機関へご相談ください。続いているようでしたら、早めのほうが安心です。",
    });
    return { kind: "stop", notices };
  }

  const redFlags = RED_FLAG_PATTERNS.filter((r) => r.pattern.test(text));
  if (redFlags.length > 0) {
    notices.push({
      level: "stop",
      message:
        `「${redFlags.map((r) => r.label).join("・")}」に当てはまる可能性のある状態が書かれていました。` +
        "この状態はスキンケア商品の使い方で解決できる範囲を超えている可能性があります。" +
        "商品の提案は行いません。使用中の化粧品はいったん中止し、皮膚科などの医療機関にご相談ください。",
    });
    return { kind: "stop", notices };
  }

  const medical = MEDICAL_REQUEST_PATTERNS.filter((r) => r.pattern.test(text));
  if (medical.length > 0) {
    notices.push({
      level: "stop",
      message:
        "医学的な診断・治療に関わる内容が含まれていました。CHIGIRI Beauty は化粧品の使い方を整理するサービスで、" +
        "疾患の判断や治療の提案はできません。診断や治療については医師にご相談ください。" +
        "医師の治療を受けながら使える化粧品の整理をご希望の場合は、その旨をお知らせください。",
    });
    return { kind: "stop", notices };
  }

  const outOfScope = OUT_OF_SCOPE_PATTERNS.filter((r) => r.pattern.test(text));
  if (outOfScope.length > 0) {
    notices.push({
      level: "stop",
      message:
        `「${outOfScope.map((r) => r.label).join("・")}」に関わる内容が含まれていました。` +
        (expert === "healthcare"
          ? "ここで扱えるのは、睡眠・食事の時刻・体を動かす時間といった生活習慣の置き方までです。"
          : "ここで扱えるのは、化粧品の使い方と日々の手入れの順番までです。") +
        "この点については医師・薬剤師・管理栄養士など、判断できる方へご相談ください。" +
        "それ以外のことでしたら、続けて伺えます。",
    });
    return { kind: "stop", notices };
  }

  for (const c of CAUTION_PATTERNS) {
    if (c.pattern.test(text)) notices.push({ level: "info", message: c.message });
  }

  return { kind: "ok", notices };
}

/**
 * AI が生成した文章の表現チェック。
 * 禁止表現が含まれる場合は false を返し、呼び出し側がフォールバックする。
 */
export function isExpressionSafe(text: string): {
  safe: boolean;
  hits: string[];
} {
  const normalized = text.normalize("NFKC");
  const hits = BANNED_PATTERNS.filter((p) => normalized.includes(p));
  return { safe: hits.length === 0, hits };
}

/** 複数文字列をまとめて検査する */
export function areExpressionsSafe(texts: string[]): {
  safe: boolean;
  hits: string[];
} {
  const hits = new Set<string>();
  for (const t of texts) {
    for (const h of isExpressionSafe(t).hits) hits.add(h);
  }
  return { safe: hits.size === 0, hits: [...hits] };
}

/** 成分表示だけからは断定できない、という不確実性の明示 */
export const INGREDIENT_UNCERTAINTY_NOTE =
  "成分名は公開されている情報に基づく分類です。配合濃度・処方・使用量は公開されていないため、" +
  "刺激の強さや効果の程度をこの情報だけで判断することはできません。心配な場合はパッチテストを行ってください。";

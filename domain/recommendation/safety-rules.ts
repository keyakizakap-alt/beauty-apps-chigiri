import type { SafetyNotice } from "@/schemas/recommendation";
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
  // ネイル: 爪の色調変化と痛みは、自己判断で扱ってよい範囲を超える
  { pattern: /爪.{0,10}(黒|黒い線|茶色|褐色)|(黒|茶色).{0,6}線.{0,6}爪/, label: "爪の色調変化" },
  { pattern: /爪.{0,6}(剥が|はが|取れ|抜け)/, label: "爪の剥離" },
  // 頭皮
  { pattern: /頭皮.{0,8}(できもの|しこり|強いかゆみ|激しいかゆみ)/, label: "頭皮の異常" },
  { pattern: /抜け毛.{0,8}(急|大量|increas)|急に(髪|毛)が抜け/, label: "急激な脱毛" },
  // 目もと
  { pattern: /目.{0,6}(充血|痛|開かな)|まぶた.{0,6}(ただれ|腫れ)/, label: "目もとの異常" },
];

/** 医療的な相談を求めていると判断されるシグナル */
const MEDICAL_REQUEST_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /アトピー|皮膚炎|酒さ|しゅさ|帯状疱疹|水虫/, label: "疾患名" },
  { pattern: /治し(たい|て)|治る|完治|治療/, label: "治療の相談" },
  { pattern: /処方|皮膚科の薬|ステロイド|抗生物質/, label: "医薬品" },
];

export type SafetyGate =
  | { kind: "ok"; notices: SafetyNotice[] }
  | { kind: "stop"; notices: SafetyNotice[] };

/**
 * ユーザーの自由入力に対する安全ゲート。
 * 推薦処理より前に実行し、stop の場合は商品提案を一切行わない。
 */
export function evaluateSafety(freeText: string): SafetyGate {
  const text = freeText.normalize("NFKC");
  const notices: SafetyNotice[] = [];

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

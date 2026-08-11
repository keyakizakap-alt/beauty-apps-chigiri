import { isStated, type Profile } from "@/schemas/profile";
import type { Recommendation } from "@/schemas/recommendation";
import { CATEGORY_LABEL, getProduct } from "@/domain/recommendation/catalog";
import { domainConfig } from "@/domain/recommendation/domains";
import { CONCERN_LABEL, SKIN_LABEL } from "@/domain/recommendation/routine-builder";

/**
 * AI を使わない説明生成。
 *
 * これは「劣化版」ではなく、正しさの基準側。
 * engine.ts が既に採用理由・注意事項・不採用理由を持っているため、
 * ここでは会話用の本文を組み立てるだけでよい。
 * AI が落ちても、ユーザーが受け取る情報量は落ちない。
 *
 * 文章の方針:
 * - 設定値の読み上げにしない。「何をしたか」から書く。
 * - ユーザーが言っていない初期値を、言ったことのように書かない。
 *   仮に置いた項目は仮だと明示し、訂正を促す。
 * - 画面の構造に依存する表現（「下のリスト」など）を本文に書かない。
 */

/* ------------------------------------------------------------------ *
 * 条件の言い換え
 * ------------------------------------------------------------------ */

/**
 * ユーザーが自分で指定した条件だけを、会話らしく言い換える。
 * 何も指定されていなければ空文字を返す（言うことがないなら黙る）。
 */
export function describeStatedConditions(profile: Profile): string {
  const bits: string[] = [];

  if (isStated(profile, "concerns") && profile.concerns.length > 0) {
    const list = profile.concerns.map((c) => CONCERN_LABEL[c]).join("と");
    bits.push(`${list}が気になるとのことなので、そこを軸にしました`);
  }

  if (isStated(profile, "skinType") && domainConfig(profile.domain).usesSkinType) {
    bits.push(
      `${SKIN_LABEL[profile.skinType]}に合う表示のあるものを優先しています`,
    );
  }

  if (
    isStated(profile, "avoidIngredients") &&
    profile.avoidIngredients.length > 0
  ) {
    bits.push("避けたいと言われた成分を含むものは、はじめから候補に入れていません");
  }

  if (isStated(profile, "morningMinutes") || isStated(profile, "nightMinutes")) {
    bits.push(
      `朝${profile.morningMinutes}分・夜${profile.nightMinutes}分に収まる工程数にしています`,
    );
  }

  if (bits.length === 0) return "";
  return `${bits.join("。")}。`;
}

/**
 * こちらが仮に置いた項目を伝え、訂正を促す一文。
 * 仮置きが無ければ空文字。
 */
export function describeAssumptions(profile: Profile): string {
  const assumed: string[] = [];

  // 肌の傾向は、肌に直接触れる分野でだけ意味を持つ。
  // 髪や爪の相談で「肌の傾向は普通肌」と断るのは的外れになる。
  if (!isStated(profile, "skinType") && domainConfig(profile.domain).usesSkinType) {
    assumed.push(`肌の傾向は${SKIN_LABEL[profile.skinType]}`);
  }
  if (!isStated(profile, "budgetYen")) {
    assumed.push(`買い足しの予算は${profile.budgetYen.toLocaleString()}円`);
  }
  if (
    !isStated(profile, "morningMinutes") &&
    !isStated(profile, "nightMinutes")
  ) {
    assumed.push(
      `使える時間は朝${profile.morningMinutes}分・夜${profile.nightMinutes}分`,
    );
  }

  if (assumed.length === 0) return "";

  return (
    `${assumed.join("、")}。このあたりはまだうかがえていないので、いったんこの前提で組んでいます。` +
    `違っていたら教えてください。すぐ組み直します。`
  );
}

/* ------------------------------------------------------------------ *
 * ルーティン提示時の本文
 * ------------------------------------------------------------------ */

export function fallbackChatReply(
  profile: Profile,
  rec: Omit<Recommendation, "ai">,
  fallbackReason: string | null,
): string {
  const paragraphs: string[] = [];

  // 1. 何を見て組んだか（設定値の読み上げにしない）
  const stated = describeStatedConditions(profile);
  if (stated) paragraphs.push(stated);

  // 2. 組んだ結果
  const m = rec.routines.morning;
  const n = rec.routines.night;
  paragraphs.push(
    `朝は${m.steps.length}工程で約${m.estimatedMinutes}分、夜は${n.steps.length}工程で約${n.estimatedMinutes}分になりました。`,
  );

  // 3. 重複の扱い
  if (rec.duplications.length > 0) {
    const d = rec.duplications[0];
    const kept = getProduct(d.keptProductId);
    const count = d.duplicateProductIds.length + 1;
    paragraphs.push(
      `${CATEGORY_LABEL[d.category]}が${count}点ありましたが、同じ工程に重ねて使う必要はないので、` +
        `今回は${kept ? `「${kept.brand} ${kept.name}」` : "1点"}を軸にしています。` +
        `残りは使い切ってから考えれば十分です。`,
    );
  }

  // 4. 買い足し
  if (rec.purchaseSuggestion) {
    const p = getProduct(rec.purchaseSuggestion.productId);
    if (p) {
      paragraphs.push(
        `足りていなかったのは${CATEGORY_LABEL[rec.purchaseSuggestion.category]}だけでした。` +
          `「${p.brand} ${p.name}」（${p.price.toLocaleString()}円）を候補にしています。`,
      );
    }
  } else if (rec.savings.ownedTotalCount > 0 && rec.gaps.length === 0) {
    paragraphs.push(
      "いまの手持ちで必要な役割はそろっているので、買い足しはなくて大丈夫です。",
    );
  }

  // 5. 仮に置いた前提の断り
  const assumptions = describeAssumptions(profile);
  if (assumptions) paragraphs.push(assumptions);

  // 6. AI が使えなかった場合の断り（隠さない）
  if (fallbackReason) {
    paragraphs.push(
      `なお、いまは AI による文章生成が使えなかったため、システムが計算した内容をそのままお伝えしています。` +
        `ルーティンの中身と根拠は通常時と変わりません。（理由: ${fallbackReason}）`,
    );
  }

  return paragraphs.join("\n\n");
}

/* ------------------------------------------------------------------ *
 * 手持ちが未登録のときの本文
 * ------------------------------------------------------------------ */

/**
 * 手持ち商品をたずねる文。
 * 商品リストを画面に出すかどうかは UI 側の判断なので、
 * ここでは「下のリスト」のような画面依存の表現を使わない。
 */
export function askForInventory(
  profile: Profile,
  brandHint: string[],
): string {
  const paragraphs: string[] = [];
  const noun = domainConfig(profile.domain).itemNoun;

  const stated = describeStatedConditions(profile);
  if (stated) {
    paragraphs.push(stated.replace(/しました。$/, "していきますね。"));
  }

  if (brandHint.length > 0) {
    paragraphs.push(
      `${brandHint.slice(0, 3).join("、")}——このあたりでしょうか。` +
        `どれをお使いか選んでいただければ、そこから組み立てます。`,
    );
  } else {
    paragraphs.push(
      `まず、いまお使いの${noun}を教えてください。商品名をそのまま書いていただいても、選んでいただいても大丈夫です。`,
    );
  }

  paragraphs.push(
    "使い切っていないものをすべて選んでください。あまり使えていないものも含めて構いません。役割が重なっているものは、こちらで見つけます。",
  );

  const assumptions = describeAssumptions(profile);
  if (assumptions) paragraphs.push(assumptions);

  return paragraphs.join("\n\n");
}

/** 不足している入力を日本語で列挙する */
export const MISSING_LABEL: Record<string, string> = {
  ownedProductIds: "手持ちの化粧品",
  skinType: "肌の傾向",
  concerns: "気になっているところ",
  budgetYen: "買い足しに使える予算",
};

export function missingPrompt(missing: string[]): string {
  if (missing.length === 0) return "";
  const labels = missing.map((m) => MISSING_LABEL[m] ?? m);
  return `${labels.join("と")}を教えていただけると、より正確に組み立てられます。`;
}

import type { Profile } from "@/schemas/profile";
import type { Recommendation } from "@/schemas/recommendation";
import { CATEGORY_LABEL, getProduct } from "@/domain/recommendation/catalog";
import { CONCERN_LABEL, SKIN_LABEL } from "@/domain/recommendation/routine-builder";

/**
 * AI を使わない説明生成。
 *
 * これは「劣化版」ではなく、正しさの基準側。
 * engine.ts が既に採用理由・注意事項・不採用理由を持っているため、
 * ここでは会話用の本文を組み立てるだけでよい。
 * AI が落ちても、ユーザーが受け取る情報量は落ちない。
 */

export function fallbackChatReply(
  profile: Profile,
  rec: Omit<Recommendation, "ai">,
  fallbackReason: string | null,
): string {
  // 要約は結果カードの見出しとして表示されるため、ここでは繰り返さず
  // 「どう組んだか」を補足する。
  const lines: string[] = [describeProfile(profile), ""];

  const m = rec.routines.morning;
  const n = rec.routines.night;
  lines.push(
    `朝は${m.steps.length}工程（約${m.estimatedMinutes}分）、夜は${n.steps.length}工程（約${n.estimatedMinutes}分）で組みました。`,
  );

  if (rec.duplications.length > 0) {
    const d = rec.duplications[0];
    lines.push(
      `${CATEGORY_LABEL[d.category]}の役割が重なっていたので、1点にまとめています。`,
    );
  }

  if (rec.purchaseSuggestion) {
    const p = getProduct(rec.purchaseSuggestion.productId);
    if (p) {
      lines.push(
        `不足していたのは${CATEGORY_LABEL[rec.purchaseSuggestion.category]}だけです。予算内で「${p.brand} ${p.name}」（${p.price.toLocaleString()}円）を候補にしました。`,
      );
    }
  } else if (rec.noPurchaseNeededReason) {
    lines.push(rec.noPurchaseNeededReason);
  }

  if (fallbackReason) {
    lines.push("");
    lines.push(
      `（AI による文章生成が利用できなかったため、システムが計算した内容をそのまま表示しています。ルーティンの中身と根拠は通常時と同じです。理由: ${fallbackReason}）`,
    );
  }

  return lines.join("\n");
}

/** プロファイル確認用の読み上げ文 */
export function describeProfile(profile: Profile): string {
  const bits: string[] = [`肌傾向は${SKIN_LABEL[profile.skinType]}`];
  if (profile.concerns.length > 0) {
    bits.push(
      `気になっているのは${profile.concerns.map((c) => CONCERN_LABEL[c]).join("・")}`,
    );
  }
  bits.push(`買い足し予算は${profile.budgetYen.toLocaleString()}円`);
  bits.push(`朝${profile.morningMinutes}分・夜${profile.nightMinutes}分`);
  return `${bits.join("、")}として計算しました。`;
}

/** 不足している入力を日本語で列挙する */
export const MISSING_LABEL: Record<string, string> = {
  ownedProductIds: "手持ちの化粧品",
  skinType: "肌傾向",
  concerns: "気になっていること",
  budgetYen: "買い足しに使える予算",
};

export function missingPrompt(missing: string[]): string {
  if (missing.length === 0) return "";
  const labels = missing.map((m) => MISSING_LABEL[m] ?? m);
  return `${labels.join("と")}を教えていただけると、より正確に組み立てられます。`;
}

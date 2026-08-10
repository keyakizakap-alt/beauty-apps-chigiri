import "server-only";
import { isOverBudget } from "./llm-cost";

/**
 * 外部AIサービスへデータを送ってよいかを決める唯一の場所。
 *
 * 設計の要点は「うっかり送信できる経路を作らない」こと。
 * 文章の約束ではなく、型で縛る:
 *
 *   - 外部 API を呼ぶ関数（callOrcaRouter）は ExternalAiGrant を引数に要求する。
 *   - ExternalAiGrant はこのモジュールの decideExternalAi() でしか作れない。
 *   - したがって、ポリシー判定を通らずに外部送信するコードは書けない。
 *
 * 判定の順序（厳しいものから）:
 *   1. 運用側のキルスイッチ（環境変数）
 *   2. 利用者の設定（既定は「端末内のみ」= 送らない）
 *   3. APIキーの有無
 *
 * 既定値の考え方:
 *   利用者が明示的に許可しない限り、外部へは何も送らない。
 *   「初期設定のままなら安全側」に倒すため、opt-out ではなく opt-in にしている。
 */

declare const grantBrand: unique symbol;

/**
 * 外部送信の許可証。
 * 構造的部分型で偽造されないよう、ユニークシンボルで印を付ける。
 */
export type ExternalAiGrant = {
  readonly [grantBrand]: "external-ai";
  readonly issuedAt: number;
};

export type ExternalAiDenialReason =
  | "disabled_by_operator"
  | "user_local_only"
  | "not_configured"
  | "budget_exceeded";

export type ExternalAiDecision =
  | { allowed: true; grant: ExternalAiGrant }
  | { allowed: false; reason: ExternalAiDenialReason };

/**
 * 運用側のキルスイッチ。
 * 明示的に "on" と書かれていない限り、外部送信そのものを禁止する。
 * 未設定のまま本番へ出しても外部へ出ない側に倒すため、既定は無効。
 */
export function externalAiEnabledByOperator(): boolean {
  return (process.env.CHIGIRI_EXTERNAL_AI ?? "off").toLowerCase() === "on";
}

export function decideExternalAi(input: {
  /** 利用者が明示的に外部AIの利用を許可したか */
  userAllows: boolean;
  /** APIキーが設定されているか */
  configured: boolean;
}): ExternalAiDecision {
  if (!externalAiEnabledByOperator()) {
    return { allowed: false, reason: "disabled_by_operator" };
  }
  if (!input.userAllows) {
    return { allowed: false, reason: "user_local_only" };
  }
  if (!input.configured) {
    return { allowed: false, reason: "not_configured" };
  }
  // 1日の費用上限。超えたら決定論的な応答へ切り替える。
  // 品質は落ちるが、想定外の呼び出しが続いても請求が伸び続けない。
  if (isOverBudget()) {
    return { allowed: false, reason: "budget_exceeded" };
  }
  return {
    allowed: true,
    grant: { issuedAt: Date.now() } as ExternalAiGrant,
  };
}

/** UI へ出す説明（なぜ外部AIを使わなかったか） */
export const DENIAL_MESSAGE: Record<ExternalAiDenialReason, string> = {
  disabled_by_operator:
    "このサービスでは外部AIへの送信を無効にしています。すべて内部の決定論的な処理で応答しています。",
  user_local_only:
    "「端末内のみ」設定のため、外部AIへは何も送信していません。すべて内部の決定論的な処理で応答しています。",
  not_configured:
    "外部AIの接続情報が設定されていないため、内部の決定論的な処理で応答しています。",
  budget_exceeded:
    "本日のAI利用費が上限に達したため、内部の決定論的な処理で応答しています。結果の中身は変わりません。",
};

/**
 * OrcaRouter 呼び出しの観測ログ。
 *
 * 保存してよいもの: リクエストID / タスク種別 / 選択モデル / 応答時間 /
 *                   成否 / JSON検証結果 / フォールバック有無 / 推定トークン数
 * 保存してはいけないもの: 氏名・顔写真・詳細な健康情報・API キー・入力本文
 *
 * MVP では標準出力への構造化ログのみ（DB を必須にしない方針のため）。
 */

export type LlmTaskType =
  | "slot_extraction"
  | "routine_explanation"
  | "short_description";

export type LlmLogRecord = {
  requestId: string | null;
  task: LlmTaskType;
  requestedModel: string;
  selectedModel: string | null;
  latencyMs: number;
  ok: boolean;
  jsonValid: boolean | null;
  fallback: boolean;
  fallbackReason: string | null;
  estimatedTokens: number | null;
};

const buffer: LlmLogRecord[] = [];
const MAX_BUFFER = 100;

export function logLlmCall(record: LlmLogRecord): void {
  buffer.push(record);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  // 入力本文は含めない
  console.log(
    JSON.stringify({ type: "llm_call", at: new Date().toISOString(), ...record }),
  );
}

/** 直近のログ（デモ時の可観測性確認用） */
export function recentLlmLogs(): LlmLogRecord[] {
  return [...buffer];
}

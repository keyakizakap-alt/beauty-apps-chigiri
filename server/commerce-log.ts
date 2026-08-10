import "server-only";

/**
 * コマース事象の監査ログ。
 *
 * 残すもの: 事象種別 / 商品・販売者・オファーの ID / 価格 / 阻止理由 / 時刻
 * 残さないもの: IP、ユーザーエージェント、肌の悩み、アレルギー、
 *               手持ち商品の一覧、自由入力の本文
 *
 * 「誰が」ではなく「何が起きたか」だけを記録する。
 * KPI（承認率・阻止率・提携有無による順位変化）はこの粒度で算出できる。
 */

export type CommerceEvent =
  | { event: "handoff_issued"; offerId: string; merchantId: string; priceYen: number }
  | { event: "handoff_blocked"; offerId: string; blockers: readonly string[] }
  | { event: "handoff_redirected"; merchantId: string }
  | { event: "handoff_rejected"; reason: string }
  | { event: "purchase_declined"; category: string };

export type CommerceLogRecord = CommerceEvent & { at: string };

const buffer: CommerceLogRecord[] = [];
const MAX_BUFFER = 200;

export function logCommerceEvent(e: CommerceEvent): void {
  const record: CommerceLogRecord = { ...e, at: new Date().toISOString() };
  buffer.push(record);
  if (buffer.length > MAX_BUFFER) buffer.shift();
  console.log(JSON.stringify({ type: "commerce_event", ...record }));
}

export function recentCommerceEvents(): CommerceLogRecord[] {
  return [...buffer];
}

/** 設計書 §17 のコマース KPI（プロセス内の集計） */
export function commerceKpi(): {
  handoffIssued: number;
  handoffBlocked: number;
  redirected: number;
  rejected: number;
  declined: number;
  approvalRate: number | null;
} {
  const count = (name: CommerceEvent["event"]) =>
    buffer.filter((r) => r.event === name).length;

  const issued = count("handoff_issued");
  const blocked = count("handoff_blocked");
  const declined = count("purchase_declined");
  const decisions = issued + declined;

  return {
    handoffIssued: issued,
    handoffBlocked: blocked,
    redirected: count("handoff_redirected"),
    rejected: count("handoff_rejected"),
    declined,
    approvalRate: decisions === 0 ? null : Math.round((issued / decisions) * 100) / 100,
  };
}

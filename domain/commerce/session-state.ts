import type { AgentStep, CommerceState } from "@/schemas/commerce";

/**
 * 設計書 §9.1 の状態モデル。
 *
 * INTENT_CAPTURED
 *   -> INVENTORY_CONFIRMED
 *   -> ROUTINE_GENERATED
 *   -> NEED_ASSESSED
 *       -> NO_PURCHASE_NEEDED           （成功の終端。失敗ではない）
 *       -> CANDIDATES_COMPARED
 *           -> AWAITING_USER_APPROVAL
 *               -> PURCHASE_HANDOFF_READY
 *               -> DECLINED             （成功の終端）
 *
 * AWAITING_USER_APPROVAL から PURCHASE_HANDOFF_READY への遷移だけは、
 * ユーザーの明示操作なしには起こしてはいけない。
 * それをコメントではなくコードで表すために、遷移関数に
 * userInitiated フラグを要求する。
 */

const TRANSITIONS: Record<CommerceState, readonly CommerceState[]> = {
  INTENT_CAPTURED: ["INVENTORY_CONFIRMED"],
  INVENTORY_CONFIRMED: ["ROUTINE_GENERATED"],
  ROUTINE_GENERATED: ["NEED_ASSESSED"],
  NEED_ASSESSED: ["NO_PURCHASE_NEEDED", "CANDIDATES_COMPARED"],
  CANDIDATES_COMPARED: ["AWAITING_USER_APPROVAL", "DECLINED"],
  AWAITING_USER_APPROVAL: ["PURCHASE_HANDOFF_READY", "DECLINED"],
  // 終端
  NO_PURCHASE_NEEDED: [],
  PURCHASE_HANDOFF_READY: [],
  DECLINED: [],
};

/** ユーザーの明示操作なしには入れない状態 */
const USER_GATED: ReadonlySet<CommerceState> = new Set<CommerceState>([
  "PURCHASE_HANDOFF_READY",
]);

export const TERMINAL_STATES: ReadonlySet<CommerceState> = new Set<CommerceState>(
  ["NO_PURCHASE_NEEDED", "PURCHASE_HANDOFF_READY", "DECLINED"],
);

/** 「買わない」も成功として扱う終端 */
export const SUCCESS_TERMINALS: ReadonlySet<CommerceState> =
  new Set<CommerceState>([
    "NO_PURCHASE_NEEDED",
    "PURCHASE_HANDOFF_READY",
    "DECLINED",
  ]);

export type TransitionResult =
  | { ok: true; state: CommerceState }
  | { ok: false; reason: "illegal_transition" | "user_action_required" };

export function canTransition(from: CommerceState, to: CommerceState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(
  from: CommerceState,
  to: CommerceState,
  options: { userInitiated: boolean } = { userInitiated: false },
): TransitionResult {
  if (!canTransition(from, to)) {
    return { ok: false, reason: "illegal_transition" };
  }
  if (USER_GATED.has(to) && !options.userInitiated) {
    return { ok: false, reason: "user_action_required" };
  }
  return { ok: true, state: to };
}

export const STATE_LABEL: Record<CommerceState, string> = {
  INTENT_CAPTURED: "希望と制約を読み取りました",
  INVENTORY_CONFIRMED: "手持ちの商品を確認しました",
  ROUTINE_GENERATED: "朝と夜のルーティンを組みました",
  NEED_ASSESSED: "買い足しが要るかを判定しました",
  NO_PURCHASE_NEEDED: "買い足しは不要と判断しました",
  CANDIDATES_COMPARED: "候補を比較しました",
  AWAITING_USER_APPROVAL: "確認をお待ちしています",
  PURCHASE_HANDOFF_READY: "販売サイトへの引き継ぎを用意しました",
  DECLINED: "今回は買わないことにしました",
};

/**
 * エージェントの経過を UI に見せるための記録。
 * 何を根拠にどこまで進んだかを、ユーザーが後から追えるようにする。
 */
export class AgentTrace {
  private readonly steps: AgentStep[] = [];
  private current: CommerceState = "INTENT_CAPTURED";

  constructor(detail = "入力された希望・予算・避けたい条件を構造化しました") {
    this.steps.push({
      state: "INTENT_CAPTURED",
      label: STATE_LABEL.INTENT_CAPTURED,
      detail,
      requiresUserAction: false,
      at: new Date().toISOString(),
    });
  }

  get state(): CommerceState {
    return this.current;
  }

  /**
   * 状態を進める。不正な遷移は例外にせず false を返し、記録も残さない。
   * 「進んだことにして処理を続ける」経路を作らないため、
   * 呼び出し側は戻り値を見て分岐する。
   */
  advance(
    to: CommerceState,
    detail: string,
    options: { userInitiated?: boolean } = {},
  ): boolean {
    const result = transition(this.current, to, {
      userInitiated: options.userInitiated ?? false,
    });
    if (!result.ok) return false;

    this.current = result.state;
    this.steps.push({
      state: result.state,
      label: STATE_LABEL[result.state],
      detail,
      requiresUserAction: result.state === "AWAITING_USER_APPROVAL",
      at: new Date().toISOString(),
    });
    return true;
  }

  snapshot(): AgentStep[] {
    return [...this.steps];
  }
}

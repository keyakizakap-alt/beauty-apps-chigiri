import { describe, expect, it } from "vitest";
import {
  AgentTrace,
  SUCCESS_TERMINALS,
  TERMINAL_STATES,
  canTransition,
  transition,
} from "@/domain/commerce/session-state";

describe("エージェント状態機械", () => {
  it("設計書どおりの経路をたどれる", () => {
    expect(canTransition("INTENT_CAPTURED", "INVENTORY_CONFIRMED")).toBe(true);
    expect(canTransition("INVENTORY_CONFIRMED", "ROUTINE_GENERATED")).toBe(true);
    expect(canTransition("ROUTINE_GENERATED", "NEED_ASSESSED")).toBe(true);
    expect(canTransition("NEED_ASSESSED", "NO_PURCHASE_NEEDED")).toBe(true);
    expect(canTransition("NEED_ASSESSED", "CANDIDATES_COMPARED")).toBe(true);
    expect(canTransition("CANDIDATES_COMPARED", "AWAITING_USER_APPROVAL")).toBe(
      true,
    );
  });

  it("段階を飛ばす遷移を許さない", () => {
    expect(canTransition("INTENT_CAPTURED", "PURCHASE_HANDOFF_READY")).toBe(false);
    expect(canTransition("ROUTINE_GENERATED", "CANDIDATES_COMPARED")).toBe(false);
    expect(canTransition("NEED_ASSESSED", "AWAITING_USER_APPROVAL")).toBe(false);
  });

  it("承認なしに引き継ぎへ進めない", () => {
    const r = transition("AWAITING_USER_APPROVAL", "PURCHASE_HANDOFF_READY", {
      userInitiated: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("user_action_required");
  });

  it("ユーザー操作があれば引き継ぎへ進める", () => {
    const r = transition("AWAITING_USER_APPROVAL", "PURCHASE_HANDOFF_READY", {
      userInitiated: true,
    });
    expect(r.ok).toBe(true);
  });

  it("買わない判断はユーザー操作フラグ無しでも記録できる", () => {
    expect(transition("AWAITING_USER_APPROVAL", "DECLINED").ok).toBe(true);
    expect(transition("CANDIDATES_COMPARED", "DECLINED").ok).toBe(true);
  });

  it("終端からはどこへも遷移しない", () => {
    for (const state of TERMINAL_STATES) {
      expect(canTransition(state, "AWAITING_USER_APPROVAL")).toBe(false);
      expect(canTransition(state, "NEED_ASSESSED")).toBe(false);
    }
  });

  it("購入不要と辞退を成功の終端として扱う", () => {
    expect(SUCCESS_TERMINALS.has("NO_PURCHASE_NEEDED")).toBe(true);
    expect(SUCCESS_TERMINALS.has("DECLINED")).toBe(true);
    expect(SUCCESS_TERMINALS.has("PURCHASE_HANDOFF_READY")).toBe(true);
  });
});

describe("AgentTrace", () => {
  it("経過を順に記録する", () => {
    const t = new AgentTrace("条件を読み取りました");
    expect(t.advance("INVENTORY_CONFIRMED", "手持ち5点")).toBe(true);
    expect(t.advance("ROUTINE_GENERATED", "朝3工程・夜4工程")).toBe(true);
    expect(t.state).toBe("ROUTINE_GENERATED");
    expect(t.snapshot()).toHaveLength(3);
  });

  it("不正な遷移は記録も状態変更もしない", () => {
    const t = new AgentTrace();
    expect(t.advance("PURCHASE_HANDOFF_READY", "飛ばして引き継ぎ")).toBe(false);
    expect(t.state).toBe("INTENT_CAPTURED");
    expect(t.snapshot()).toHaveLength(1);
  });

  it("承認なしの引き継ぎを拒否する", () => {
    const t = new AgentTrace();
    t.advance("INVENTORY_CONFIRMED", "");
    t.advance("ROUTINE_GENERATED", "");
    t.advance("NEED_ASSESSED", "");
    t.advance("CANDIDATES_COMPARED", "");
    t.advance("AWAITING_USER_APPROVAL", "");

    expect(t.advance("PURCHASE_HANDOFF_READY", "承認なし")).toBe(false);
    expect(t.state).toBe("AWAITING_USER_APPROVAL");

    expect(
      t.advance("PURCHASE_HANDOFF_READY", "承認あり", { userInitiated: true }),
    ).toBe(true);
    expect(t.state).toBe("PURCHASE_HANDOFF_READY");
  });

  it("承認待ちの地点に印を付ける", () => {
    const t = new AgentTrace();
    t.advance("INVENTORY_CONFIRMED", "");
    t.advance("ROUTINE_GENERATED", "");
    t.advance("NEED_ASSESSED", "");
    t.advance("CANDIDATES_COMPARED", "");
    t.advance("AWAITING_USER_APPROVAL", "");

    const steps = t.snapshot();
    const awaiting = steps.find((s) => s.state === "AWAITING_USER_APPROVAL");
    expect(awaiting?.requiresUserAction).toBe(true);
    expect(steps.filter((s) => s.requiresUserAction)).toHaveLength(1);
  });
});

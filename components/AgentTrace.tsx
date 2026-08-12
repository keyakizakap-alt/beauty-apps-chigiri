"use client";

import type { AgentStep, CommerceState } from "@/schemas/commerce";

/**
 * エージェントがどこまで進んだかの可視化。
 *
 * 「AI が何をしたか分からないまま購入まで進む」ことを避けるための表示。
 * 承認が必要な地点は色と文言で明示し、そこで止まっていることを見せる。
 */

const TERMINAL_TONE: Partial<Record<CommerceState, string>> = {
  NO_PURCHASE_NEEDED: "text-matcha",
  DECLINED: "text-matcha",
  PURCHASE_HANDOFF_READY: "text-ai",
};

export default function AgentTrace({
  trace,
  state,
  defaultOpen = false,
}: {
  trace: AgentStep[];
  state: CommerceState;
  defaultOpen?: boolean;
}) {
  if (trace.length === 0) return null;

  return (
    <details className="chigiri-card p-4" open={defaultOpen}>
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <span aria-hidden className="text-ai">
          ◍
        </span>
        AIがたどった手順（{trace.length}ステップ）
        <span className="ml-auto text-xs font-normal text-sumi/45">
          押すと開きます
        </span>
      </summary>

      <ol className="mt-3 space-y-0">
        {trace.map((step, i) => {
          const isLast = i === trace.length - 1;
          return (
            <li key={`${step.state}-${i}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    step.requiresUserAction
                      ? "bg-sakura ring-4 ring-sakuraSoft"
                      : isLast
                        ? "bg-ai"
                        : "bg-beige"
                  }`}
                />
                {!isLast && <span className="w-px flex-1 bg-beige" />}
              </div>
              <div className={`pb-3 ${isLast ? "" : ""}`}>
                <p
                  className={`text-xs font-medium ${
                    TERMINAL_TONE[step.state] ?? "text-sumi/80"
                  }`}
                >
                  {step.label}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-sumi/60">
                  {step.detail}
                </p>
                {step.requiresUserAction && (
                  <p className="mt-1 inline-block rounded-full bg-sakuraSoft px-2 py-0.5 text-[10px] text-sakura">
                    ここから先はあなたの操作が必要です
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-1 border-t border-beige pt-3 text-[11px] leading-relaxed text-sumi/50">
        現在の状態：<span className="font-medium text-sumi/70">{state}</span>
        <br />
        商品の選定・除外・順位づけはサービス側で行い、
        AI が担当しているのは説明文の作成だけです。
      </p>
    </details>
  );
}

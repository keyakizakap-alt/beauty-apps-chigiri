"use client";

import { useState } from "react";
import type { Product } from "@/schemas/product";
import type { Routine, RoutinePlan } from "@/schemas/recommendation";
import RoutineTimeline from "./RoutineTimeline";

/**
 * ルーティンの案を切り替えて見せる。
 *
 * 単一の正解を押しつけないための表示だが、
 * 「たくさん出す」ことが目的ではないので、意味のある案だけを並べる。
 * どの案も同じ基準で組んでいることを明記し、
 * 案ごとに商品の選び方が変わっているように見せない。
 */
export default function RoutinePlans({
  plans,
  fallback,
  products,
  arrangementCount,
}: {
  plans: RoutinePlan[];
  /** plans が無い（過去の保存データなど）場合に表示する標準の並び */
  fallback: { morning: Routine; night: Routine };
  products: Map<string, Product>;
  arrangementCount: number;
}) {
  const [active, setActive] = useState(0);

  if (plans.length === 0) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <RoutineTimeline routine={fallback.morning} products={products} />
        <RoutineTimeline routine={fallback.night} products={products} />
      </div>
    );
  }

  const plan = plans[Math.min(active, plans.length - 1)];

  return (
    <section className="space-y-3">
      {plans.length > 1 && (
        <div>
          <div
            role="tablist"
            aria-label="ルーティンの案"
            className="flex flex-wrap gap-1.5"
          >
            {plans.map((p, i) => {
              const selected = i === active;
              return (
                <button
                  key={p.kind}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  onClick={() => setActive(i)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                    selected
                      ? "border-ai bg-ai text-white"
                      : "border-beige bg-white text-sumi/70 hover:border-ai/40"
                  }`}
                >
                  {p.label}
                  <span
                    className={`ml-1.5 tabular-nums ${
                      selected ? "text-white/70" : "text-sumi/40"
                    }`}
                  >
                    {p.totalSteps}工程
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-xs leading-relaxed text-sumi/65">
            {plan.description}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <RoutineTimeline routine={plan.routines.morning} products={products} />
        <RoutineTimeline routine={plan.routines.night} products={products} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-sumi/50">
        <span>
          合計 {plan.totalSteps} 工程（朝 {plan.routines.morning.steps.length} ／
          夜 {plan.routines.night.steps.length}）
        </span>
        <span>目安 約{plan.totalMinutes}分</span>
        <span>手持ち {plan.ownedUsedCount} 点を活用</span>
      </div>

      {arrangementCount > 1 && (
        <details className="rounded-xl border border-beige/70 bg-white/60 px-3.5 py-2.5">
          <summary className="cursor-pointer text-xs text-sumi/70">
            手持ちからは
            <span className="mx-1 font-medium tabular-nums text-ai">
              {arrangementCount.toLocaleString()}通り
            </span>
            の組み立て方があります
          </summary>
          <p className="mt-2 text-[11px] leading-relaxed text-sumi/60">
            朝・夜それぞれの工程に、その時間帯に使える手持ち商品のどれを充てるかの組み合わせ数です。
            この中から、関心・肌傾向・使用感・注意点で採点して選んだ
            {plans.length}案を表示しています。
            すべてを並べても選べないため、意味のある案だけに絞っています。
          </p>
        </details>
      )}
    </section>
  );
}

"use client";

import { CATEGORY_LABEL } from "@/domain/recommendation/catalog";
import type { Product } from "@/schemas/product";
import type { Routine } from "@/schemas/recommendation";

/**
 * 朝・夜ルーティンのタイムライン表示。
 * 採用理由と注意事項は折りたたみ（details）にして、初見の情報量を抑える。
 */
export default function RoutineTimeline({
  routine,
  products,
}: {
  routine: Routine;
  products: Map<string, Product>;
}) {
  const isMorning = routine.timing === "morning";

  return (
    <section className="chigiri-card p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">
          <span aria-hidden className="mr-1.5">
            {isMorning ? "☀" : "☾"}
          </span>
          {isMorning ? "朝のルーティン" : "夜のルーティン"}
        </h3>
        <p className="text-xs text-ink/55">
          {routine.steps.length}工程 ／ 目安 約{routine.estimatedMinutes}分
          <span className="text-ink/40">（使える時間 {routine.budgetMinutes}分）</span>
        </p>
      </header>

      {routine.steps.length === 0 ? (
        <p className="rounded-lg bg-greige px-3 py-4 text-sm text-ink/60">
          この時間帯に組めるルーティンがありません。手持ち商品を追加するか、
          不足している役割を確認してください。
        </p>
      ) : (
        <ol className="relative space-y-0">
          {routine.steps.map((step, i) => {
            const p = products.get(step.productId);
            const last = i === routine.steps.length - 1;
            return (
              <li key={step.productId} className="relative flex gap-3 pb-4 last:pb-0">
                {/* タイムラインの縦線 */}
                {!last && (
                  <span
                    aria-hidden
                    className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-line"
                  />
                )}
                <span
                  aria-hidden
                  className="z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest text-xs font-medium text-white"
                >
                  {step.order}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium tracking-wide text-forest">
                    {CATEGORY_LABEL[step.category]}
                  </p>
                  <p className="text-sm font-medium leading-snug">
                    {p ? `${p.brand} ${p.name}` : step.productId}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink/60">
                    {step.purpose}
                  </p>

                  {step.cautions.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {step.cautions.map((c) => (
                        <li
                          key={c}
                          className="text-xs leading-relaxed text-clay"
                        >
                          注意：{c}
                        </li>
                      ))}
                    </ul>
                  )}

                  <details className="group mt-1.5">
                    <summary className="cursor-pointer list-none text-xs text-forest/80 underline underline-offset-2 marker:hidden">
                      なぜこれを選んだか
                    </summary>
                    <p className="mt-1.5 rounded-lg bg-greige px-3 py-2 text-xs leading-relaxed text-ink/75">
                      {step.reason}
                    </p>
                  </details>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

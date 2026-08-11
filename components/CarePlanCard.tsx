"use client";

import type { CarePlan } from "@/schemas/recommendation";
import { EXPERTS } from "@/domain/conversation/experts";

/**
 * 髪・体・生活の手順。
 *
 * この分野では商品カタログを持っていないので、商品カードは出さない。
 * 出せないものを「準備中」と濁すのではなく、
 * 何が出せて何が出せないかをその場に書く。
 *
 * 並びは「順番 → 買う前にできること → 気をつけること」。
 * いちばん役に立つ順で、買い足しの話はいちばん後ろに置く。
 */
export default function CarePlanCard({ plan }: { plan: CarePlan }) {
  const expert = EXPERTS[plan.expert];

  return (
    <div className="space-y-4">
      <section className="chigiri-card p-4">
        <p className="text-[10px] font-medium tracking-[0.18em] text-moriSoft">
          {expert.label.toUpperCase()}
        </p>
        <h3 className="mt-1.5 text-base font-semibold leading-snug">
          {plan.headline}
        </h3>

        {plan.basis.length > 0 && (
          <p className="mt-2 text-[11px] leading-relaxed text-sumi/50">
            前提：{plan.basis.join(" ／ ")}
          </p>
        )}

        <ol className="mt-4 space-y-3">
          {plan.steps.map((s) => (
            <li key={s.order} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ai/10 text-xs font-medium tabular-nums text-ai">
                {s.order}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="text-sm font-medium leading-snug">{s.title}</p>
                  <span className="rounded-full bg-kinari px-2 py-0.5 text-[10px] text-sumi/55">
                    {s.cadence}
                  </span>
                  {!s.core && (
                    <span className="text-[10px] text-sumi/40">
                      余裕のある日に
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-sumi/70">
                  {s.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 買う前にできること。この順番に意味があるので、買い足しより前に置く。 */}
      {plan.beforeBuying.length > 0 && (
        <section className="chigiri-card border-matcha/30 bg-matchaSoft/40 p-4">
          <h4 className="text-sm font-semibold text-mori">
            買い足す前に、できること
          </h4>
          <ul className="mt-2 space-y-1.5">
            {plan.beforeBuying.map((b) => (
              <li key={b} className="text-xs leading-relaxed text-sumi/75">
                ・{b}
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.considerNext.length > 0 && (
        <section className="chigiri-card p-4">
          <h4 className="text-sm font-semibold">
            それでも足りないと感じたら
          </h4>
          <ul className="mt-2 space-y-1">
            {plan.considerNext.map((c) => (
              <li key={c} className="text-xs leading-relaxed text-sumi/75">
                ・{c}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-sumi/45">
            この分野は商品データを持っていないため、種類までのご案内にとどめています。
            商品名を挙げるには、価格や成分を確認できる情報が必要です。
          </p>
        </section>
      )}

      {plan.cautions.length > 0 && (
        <section className="chigiri-card border-sakura/30 bg-sakuraSoft/30 p-4">
          <h4 className="text-sm font-semibold">気をつけていただきたいこと</h4>
          <ul className="mt-2 space-y-1.5">
            {plan.cautions.map((c) => (
              <li key={c} className="text-xs leading-relaxed text-sumi/75">
                ・{c}
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="chigiri-card p-4">
        <summary className="cursor-pointer text-xs text-sumi/55">
          この手順の作り方
        </summary>
        <div className="mt-2 space-y-2 text-[11px] leading-relaxed text-sumi/60">
          <p>
            伺った内容に対応する手順を規則どおりに並べたものです。AI
            は使っていないため、同じ内容をお話しいただければ、いつでも同じ順番になります。
          </p>
          {plan.scopeNote && <p>{plan.scopeNote}</p>}
          <p>{plan.disclaimer}</p>
        </div>
      </details>
    </div>
  );
}

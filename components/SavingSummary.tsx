"use client";

import type { Savings } from "@/schemas/recommendation";

/**
 * 結果画面で最も強調する指標。
 * 「増やした数」ではなく「増やさずに済んだ数」を主役にする。
 */
export default function SavingSummary({
  summary,
  savings,
}: {
  summary: string;
  savings: Savings;
}) {
  const rate = Math.round(savings.utilizationRate * 100);

  return (
    <section className="rounded-card border border-forest/15 bg-gradient-to-b from-white to-greige/70 p-4 sm:p-5">
      <p className="text-[15px] font-medium leading-relaxed sm:text-base">
        {summary}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          label="手持ち活用率"
          value={`${rate}%`}
          sub={`${savings.ownedUsedCount} / ${savings.ownedTotalCount} 点`}
          accent
        />
        <Metric
          label="買い足し点数"
          value={`${savings.newItemCount} 点`}
          sub={
            savings.additionalCostYen > 0
              ? `+${savings.additionalCostYen.toLocaleString()}円`
              : "追加費用なし"
          }
        />
        <Metric
          label="買わずに済んだ点数"
          value={`${savings.avoidedItemCount} 点`}
          sub="手持ちで代替できた役割"
        />
        <Metric
          label="削減できた推定額"
          value={`約${savings.avoidedCostYen.toLocaleString()}円`}
          sub="カテゴリー中央価格で試算"
          accent
        />
      </dl>

      <p className="mt-3 text-[11px] leading-relaxed text-ink/45">
        削減額は「同じ役割をすべて新しく買いそろえた場合」との比較で、
        カタログ内の各カテゴリーの中央価格を用いた推定です。実際の購入額を保証するものではありません。
      </p>
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 ${
        accent ? "border-forest/25 bg-white" : "border-line/70 bg-white/70"
      }`}
    >
      <dt className="chigiri-label">{label}</dt>
      <dd
        className={`mt-0.5 text-lg font-semibold tabular-nums ${accent ? "text-forest" : "text-ink"}`}
      >
        {value}
      </dd>
      <dd className="text-[11px] leading-tight text-ink/50">{sub}</dd>
    </div>
  );
}

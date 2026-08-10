"use client";

import type { ComparisonRow, OfferComparison } from "@/schemas/commerce";
import { CATEGORY_LABEL } from "@/domain/recommendation/catalog";

/**
 * 候補比較。
 * 「なぜこれを選んだか」と同じ強さで「なぜ他を選ばなかったか」を出す。
 */
export default function OfferComparisonPanel({
  comparison,
  selectedOfferId,
  onSelect,
  stoppedProductIds,
}: {
  comparison: OfferComparison;
  selectedOfferId: string | null;
  onSelect: (row: ComparisonRow) => void;
  stoppedProductIds: ReadonlySet<string>;
}) {
  const label = CATEGORY_LABEL[comparison.category];

  if (comparison.rows.length === 0) {
    return (
      <section className="chigiri-card p-5">
        <p className="chigiri-label">{label}の候補</p>
        <div className="mt-3 rounded-lg bg-matchaSoft px-4 py-4">
          <p className="text-sm font-medium text-matcha">
            条件に合う候補がなかったため、購入は提案しません。
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-sumi/70">
            {comparison.emptyReason}
          </p>
        </div>
        <TippingPointNote comparison={comparison} />
      </section>
    );
  }

  return (
    <section className="chigiri-card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-base font-semibold">{label}の候補を比べました</h2>
        <p className="text-xs text-sumi/50">
          {comparison.rows.length}件／買うのは最大1点
        </p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-sumi/60">
        順位は価格・役割・肌傾向・注意点だけで決めています。
        提携報酬は順位に一切含めていません。
      </p>

      <ul className="mt-4 space-y-3">
        {comparison.rows.map((row) => {
          const isSelected = row.offer.offerId === selectedOfferId;
          const wasStopped = stoppedProductIds.has(row.offer.productId);
          return (
            <li key={row.offer.offerId}>
              <button
                type="button"
                onClick={() => onSelect(row)}
                aria-pressed={isSelected}
                className={`w-full rounded-xl border p-3.5 text-left transition-colors ${
                  isSelected
                    ? "border-ai bg-ai/[0.04]"
                    : "border-beige bg-white hover:border-ai/40"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {row.selected && (
                      <span className="inline-block rounded-full bg-ai px-2 py-0.5 text-[10px] text-white">
                        AIの第1候補
                      </span>
                    )}
                    <p className="mt-1 text-xs text-sumi/55">{row.brand}</p>
                    <p className="text-[15px] font-medium leading-snug">
                      {row.productName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[15px] font-medium tabular-nums">
                      {row.offer.price.toLocaleString()}円
                    </p>
                    {row.volume && (
                      <p className="text-[11px] text-sumi/50">{row.volume}</p>
                    )}
                  </div>
                </div>

                {row.highlights.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {row.highlights.map((h) => (
                      <li
                        key={h}
                        className="rounded-full bg-kinari px-2 py-0.5 text-[11px] text-sumi/70"
                      >
                        {h}
                      </li>
                    ))}
                  </ul>
                )}

                <p
                  className={`mt-2 text-xs leading-relaxed ${
                    row.selected ? "text-sumi/75" : "text-sumi/60"
                  }`}
                >
                  {row.selected ? (
                    row.reason
                  ) : (
                    <>
                      <span className="font-medium text-sumi/70">
                        選ばなかった理由：
                      </span>
                      {row.notChosenReason}
                    </>
                  )}
                </p>

                {wasStopped && (
                  <p className="mt-2 rounded-lg bg-sakuraSoft px-2.5 py-1.5 text-[11px] leading-relaxed text-sakura">
                    以前この商品を「続かなかった」と記録しています。
                    同じものを買い直す前に、続かなかった理由を思い出してみてください。
                  </p>
                )}

                {row.cautions.length > 0 && (
                  <p className="mt-2 text-[11px] leading-relaxed text-sumi/55">
                    注意：{row.cautions.join("／")}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <TippingPointNote comparison={comparison} />
    </section>
  );
}

/**
 * 反実仮想の表示。
 * 「いまの結論が、どの条件で変わるのか」をユーザーが自分で確かめられるようにする。
 */
function TippingPointNote({ comparison }: { comparison: OfferComparison }) {
  const t = comparison.tippingPoint;
  if (t.kind === "none" && t.budgetYen === null && !t.message) return null;

  return (
    <div className="mt-4 rounded-xl border border-ai/20 bg-ai/[0.03] p-3.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-ai">
        <span aria-hidden>⇄</span>
        この結論が変わる境目
      </p>
      <p className="mt-1 text-xs leading-relaxed text-sumi/75">{t.message}</p>
    </div>
  );
}

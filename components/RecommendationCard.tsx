"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CATEGORY_LABEL } from "@/domain/recommendation/catalog";
import type { Product } from "@/schemas/product";
import type { Recommendation } from "@/schemas/recommendation";
import type { Profile } from "@/schemas/profile";
import ProductInsight from "./ProductInsight";
import RoutinePlans from "./RoutinePlans";
import SavingSummary from "./SavingSummary";
import EvidencePanel from "./EvidencePanel";

/**
 * 推薦結果ひとまとまりの表示。
 * チャット内にも結果ページにも同じものを差し込む。
 */
export default function RecommendationCard({
  rec,
  profile,
}: {
  rec: Recommendation;
  /** 渡すと、手持ちの成分と条件の突き合わせを表示する */
  profile?: Profile;
}) {
  const products = useMemo(
    () => new Map<string, Product>(rec.products.map((p) => [p.id, p])),
    [rec.products],
  );

  const suggestion = rec.purchaseSuggestion;
  const suggested = suggestion ? products.get(suggestion.productId) : undefined;

  // ルーティンで実際に使った手持ちだけを読み解きの対象にする
  const ownedInUse = useMemo(() => {
    const used = new Set([
      ...rec.routines.morning.steps.map((s) => s.productId),
      ...rec.routines.night.steps.map((s) => s.productId),
    ]);
    return rec.products.filter(
      (p) => used.has(p.id) && p.id !== suggestion?.productId,
    );
  }, [rec.routines, rec.products, suggestion?.productId]);

  return (
    <div className="space-y-4">
      <SavingSummary summary={rec.summary} savings={rec.savings} />

      <RoutinePlans
        plans={rec.plans}
        fallback={rec.routines}
        products={products}
        arrangementCount={rec.arrangementCount}
      />

      {/* いま使っているものの読み解き */}
      {profile && ownedInUse.length > 0 && (
        <section className="chigiri-card p-4">
          <h3 className="text-base font-semibold">
            いま使っているものを読み解く
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-sumi/65">
            それぞれに何が入っていて、あなたの条件のどこと対応し、どこが
            確認できていないかを並べます。提案した商品との違いも比べられます。
          </p>
          <ul className="mt-3 space-y-2.5">
            {ownedInUse.map((p) => (
              <li key={p.id} className="rounded-xl border border-beige/70 px-3 py-2.5">
                <p className="text-[11px] text-sumi/60">{p.brand}</p>
                <p className="text-sm font-medium leading-snug">{p.name}</p>
                <p className="mt-0.5 text-[11px] text-sumi/55">
                  {CATEGORY_LABEL[p.category]}
                </p>
                <ProductInsight
                  product={p}
                  profile={profile}
                  compareWith={
                    suggested && suggested.category === p.category
                      ? suggested
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 買い足し提案 */}
      <section className="chigiri-card p-4">
        <h3 className="text-base font-semibold">買い足すなら、この1点</h3>
        {suggestion && suggested ? (
          <div className="mt-3 rounded-lg border border-ai/25 bg-white p-3">
            <p className="text-[11px] font-medium tracking-wide text-ai">
              {CATEGORY_LABEL[suggestion.category]}の役割が不足
            </p>
            <p className="mt-0.5 text-sm text-sumi/60">{suggested.brand}</p>
            <p className="text-[15px] font-medium leading-snug">{suggested.name}</p>
            <p className="mt-1 text-sm tabular-nums">
              参考価格 {suggestion.price.toLocaleString()}円
              {suggested.volume && (
                <span className="ml-1 text-xs text-sumi/50">／ {suggested.volume}</span>
              )}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-sumi/70">
              {suggestion.reason}
            </p>

            {suggestion.runnerUpIds.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-ai/80 underline underline-offset-2">
                  次点の候補も見る
                </summary>
                <ul className="mt-1.5 space-y-1">
                  {suggestion.runnerUpIds.map((id) => {
                    const p = products.get(id);
                    return (
                      <li key={id} className="text-xs text-sumi/60">
                        {p ? `${p.brand} ${p.name}（${p.price.toLocaleString()}円）` : id}
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Link
                href={`/approve?category=${suggestion.category}`}
                className="rounded-lg bg-ai px-4 py-2.5 text-center text-xs font-medium text-white"
              >
                候補を比べて決める
              </Link>
              {suggested.officialUrl && (
              <a
                href={suggested.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-ai px-4 py-2.5 text-center text-xs text-ai"
              >
                公式サイトで確認する
              </a>
            )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-sumi/50">
              「候補を比べて決める」では、他の候補との比較・販売者・送料の扱い・
              選ばなかった理由を確認したうえで、承認するかどうかを選べます。
              承認するまで販売サイトへは移動しません。
            </p>
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-matchaSoft px-4 py-4">
            <p className="flex items-center gap-2 text-sm font-medium text-matcha">
              <span aria-hidden>🌿</span>
              今回、買い足しは必要ありません
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-sumi/75">
              {rec.noPurchaseNeededReason ??
                "手持ちの商品だけで必要な役割がそろっています。"}
            </p>
            <Link
              href="/ledger"
              className="mt-2.5 inline-block text-xs text-matcha underline underline-offset-2"
            >
              買わずに済んだ記録を見る
            </Link>
          </div>
        )}

        {rec.purchaseSuggestions.length > 0 && (
          <div className="mt-3">
            <p className="chigiri-label mb-1.5">
              設定した上限内での追加候補
            </p>
            <ul className="space-y-1">
              {rec.purchaseSuggestions.map((s) => {
                const p = products.get(s.productId);
                return (
                  <li key={s.productId} className="text-xs text-sumi/65">
                    {CATEGORY_LABEL[s.category]}：
                    {p ? `${p.brand} ${p.name}（${s.price.toLocaleString()}円）` : s.productId}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* 重複・不足・不採用 */}
      {(rec.duplications.length > 0 ||
        rec.gaps.length > 0 ||
        rec.unused.length > 0) && (
        <section className="chigiri-card p-4">
          <h3 className="text-base font-semibold">手持ちの整理</h3>

          {rec.duplications.length > 0 && (
            <div className="mt-3">
              <p className="chigiri-label mb-1.5">役割が重複している商品</p>
              <ul className="space-y-2">
                {rec.duplications.map((d) => (
                  <li
                    key={d.category}
                    className="rounded-lg border border-sakura/30 bg-sakuraSoft/40 px-3 py-2"
                  >
                    <p className="text-xs font-medium text-sakura">
                      {CATEGORY_LABEL[d.category]}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-sumi/75">
                      {d.note}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rec.gaps.length > 0 && (
            <div className="mt-3">
              <p className="chigiri-label mb-1.5">不足している役割</p>
              <ul className="flex flex-wrap gap-1.5">
                {rec.gaps.map((g) => (
                  <li
                    key={`${g.category}-${g.timing}`}
                    className="rounded-full border border-beige bg-white px-2.5 py-1 text-xs"
                  >
                    {g.timing === "morning" ? "朝" : "夜"}・
                    {CATEGORY_LABEL[g.category]}
                    <span className="ml-1 text-[10px] text-sumi/45">
                      {g.severity === "critical" ? "必須" : "推奨"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rec.unused.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-ai underline underline-offset-2">
                今回使わない商品と、その理由（{rec.unused.length}件）
              </summary>
              <ul className="mt-2 space-y-2">
                {rec.unused.map((u) => {
                  const p = products.get(u.productId);
                  return (
                    <li
                      key={u.productId}
                      className="rounded-lg border border-beige/70 px-3 py-2"
                    >
                      <p className="text-sm leading-snug">
                        {p ? `${p.brand} ${p.name}` : u.productId}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-sumi/65">
                        {u.reason}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </section>
      )}

      <EvidencePanel evidence={rec.evidence} ai={rec.ai} />

      {rec.safety.map((s) => (
        <p
          key={s.message}
          className="rounded-lg bg-kinari px-3 py-2.5 text-[11px] leading-relaxed text-sumi/60"
        >
          {s.message}
        </p>
      ))}

      <p className="rounded-lg border border-beige bg-white px-3 py-3 text-[11px] leading-relaxed text-sumi/70">
        {rec.disclaimer}
      </p>
    </div>
  );
}

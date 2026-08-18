"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CATEGORY_LABEL, getProduct } from "@/domain/recommendation/catalog";
import { useLedger, type Followup } from "@/lib/ledger";
import ConsentGate from "@/components/ConsentGate";
import ProductThumb from "@/components/ProductThumb";

/**
 * 「買わずに済んだ記録」と、購入後の継続フィードバック。
 *
 * 一般的な EC の購入履歴と逆で、見送った判断を中心に置く。
 * 買った商品については「続いたか」だけを聞き、次回の候補表示に反映する。
 */
export default function LedgerPage() {
  const {
    ledger,
    hydrated,
    summary,
    setConsent,
    recordFollowup,
    clearAll,
  } = useLedger();

  /** フォローアップを聞くべき購入（まだ答えていないもの） */
  const pendingFollowups = useMemo(() => {
    const answered = new Set(ledger.followups.map((f) => f.productId));
    const seen = new Set<string>();
    return ledger.entries
      .filter((e) => e.kind === "approved" && e.productId)
      .filter((e) => {
        const id = e.productId as string;
        if (answered.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  }, [ledger]);

  const latestFollowups = useMemo(() => {
    const map = new Map<string, Followup>();
    for (const f of ledger.followups) {
      const prev = map.get(f.productId);
      if (!prev || prev.at < f.at) map.set(f.productId, f);
    }
    return [...map.values()].sort((a, b) => b.at.localeCompare(a.at));
  }, [ledger]);

  if (!hydrated) {
    return (
      <Shell>
        <p className="text-sm text-sumi/50">読み込んでいます…</p>
      </Shell>
    );
  }

  if (!ledger.consent) {
    return (
      <Shell>
        <ConsentGate onAccept={() => setConsent(true)} />
        <p className="text-xs leading-relaxed text-sumi/55">
          同意するまで、この端末には何も記録していません。
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* サマリー */}
      <section className="chigiri-card overflow-hidden">
        <div className="bg-matchaSoft px-5 py-6">
          <p className="text-xs font-medium tracking-wide text-matcha">
            買わずに済んだ記録
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-matcha">
            {summary.declinedYen.toLocaleString()}
            <span className="ml-1 text-base font-normal">円</span>
          </p>
          <p className="mt-1 text-xs text-sumi/65">
            {summary.declinedCount}件の買い足しを見送りました
            {summary.noPurchaseCount > 0 &&
              `／${summary.noPurchaseCount}回は「買い足し不要」と判定`}
          </p>
        </div>

        <dl className="grid grid-cols-3 divide-x divide-beige border-t border-beige text-center">
          <Stat label="買った回数" value={`${summary.approvedCount}`} />
          <Stat
            label="使った金額"
            value={`${summary.approvedYen.toLocaleString()}円`}
          />
          <Stat
            label="続いている率"
            value={
              summary.continuationRate === null
                ? "—"
                : `${Math.round(summary.continuationRate * 100)}%`
            }
          />
        </dl>
      </section>

      {/* 継続フィードバック */}
      {pendingFollowups.length > 0 && (
        <section className="chigiri-card p-4">
          <h2 className="text-sm font-semibold">その後、どうですか</h2>
          <p className="mt-1 text-xs leading-relaxed text-sumi/60">
            買った商品が続いているかどうかは、次に同じ役割が不足したときの判断に効きます。
            「続かなかった」と答えた商品は、次回の候補で注意として表示します。
          </p>
          <ul className="mt-3 space-y-3">
            {pendingFollowups.map((e) => {
              const p = e.productId ? getProduct(e.productId) : undefined;
              if (!e.productId) return null;
              return (
                <li key={e.id} className="rounded-xl border border-beige p-3">
                  <div className="flex items-start gap-2.5">
                    {p && <ProductThumb product={p} size={44} className="shrink-0" />}
                    <p className="min-w-0 flex-1 text-sm leading-snug">
                      {p ? `${p.brand} ${p.name}` : e.productId}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(
                      [
                        ["continuing", "使い続けている"],
                        ["stopped", "続かなかった"],
                        ["unopened", "まだ開けていない"],
                      ] as const
                    ).map(([outcome, label]) => (
                      <button
                        key={outcome}
                        type="button"
                        onClick={() =>
                          recordFollowup(e.productId as string, outcome)
                        }
                        className="chigiri-chip chigiri-chip-off text-xs"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 判断の履歴 */}
      <section className="chigiri-card p-4">
        <h2 className="text-sm font-semibold">判断の履歴</h2>
        {ledger.entries.length === 0 ? (
          <p className="mt-2 text-xs text-sumi/55">
            まだ記録がありません。候補の比較画面で「買わない」または「承認」を選ぶと、ここに残ります。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {[...ledger.entries].reverse().map((e) => {
              const p = e.productId ? getProduct(e.productId) : undefined;
              return (
                <li
                  key={e.id}
                  className="flex items-start gap-3 rounded-lg border border-beige/70 px-3 py-2"
                >
                  <span
                    className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                      e.kind === "approved"
                        ? "bg-ai/10 text-ai"
                        : "bg-matchaSoft text-matcha"
                    }`}
                  >
                    {e.kind === "approved"
                      ? "買った"
                      : e.kind === "declined"
                        ? "見送った"
                        : "不要と判定"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-snug">
                      {CATEGORY_LABEL[e.category]}
                      {p && `／${p.brand} ${p.name}`}
                    </p>
                    <p className="text-[11px] text-sumi/50">
                      {new Date(e.at).toLocaleString("ja-JP")}
                      {e.priceYen !== null &&
                        `・${e.priceYen.toLocaleString()}円`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 回答済みフィードバック */}
      {latestFollowups.length > 0 && (
        <section className="chigiri-card p-4">
          <h2 className="text-sm font-semibold">使用後の記録</h2>
          <ul className="mt-2 space-y-1.5">
            {latestFollowups.map((f) => {
              const p = getProduct(f.productId);
              return (
                <li key={f.productId} className="text-xs text-sumi/70">
                  {p ? `${p.brand} ${p.name}` : f.productId}：
                  {f.outcome === "continuing"
                    ? "使い続けている"
                    : f.outcome === "stopped"
                      ? "続かなかった"
                      : "まだ開けていない"}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 削除 */}
      <section className="chigiri-card p-4">
        <h2 className="text-sm font-semibold">記録の削除</h2>
        <p className="mt-1 text-xs leading-relaxed text-sumi/60">
          この端末に保存した記録をすべて消します。取り消しはできません。
        </p>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm("この端末の記録をすべて削除します。よろしいですか？")
            ) {
              clearAll();
            }
          }}
          className="mt-3 rounded-lg border border-sakura/50 px-4 py-2 text-xs text-sakura"
        >
          記録をすべて削除する
        </button>
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-5">
      <nav className="flex flex-wrap items-center gap-x-1.5 text-xs text-sumi/50">
        <Link href="/" className="underline underline-offset-2">
          CHIGIRI Beauty
        </Link>
        <span>/</span>
        <span>買わずに済んだ記録</span>
        <Link
          href="/result"
          className="ml-auto text-ai underline underline-offset-2"
        >
          ルーティンへ
        </Link>
      </nav>
      {children}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-3">
      <dt className="text-[11px] text-sumi/55">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HandoffResponseSchema,
  OffersResponseSchema,
  type AgentStep,
  type CommerceState,
  type ComparisonRow,
  type OfferComparison,
  type OfferValidation,
  type PurchaseHandoff,
} from "@/schemas/commerce";
import { CategorySchema, type Category } from "@/schemas/product";
import { CATEGORY_LABEL } from "@/domain/recommendation/catalog";
import { useProfile } from "@/lib/storage";
import { stoppedProductIds, useLedger } from "@/lib/ledger";
import AgentTrace from "@/components/AgentTrace";
import OfferComparisonPanel from "@/components/OfferComparison";
import ApprovalSheet from "@/components/ApprovalSheet";
import ConsentGate from "@/components/ConsentGate";

/**
 * 候補比較 → 承認 → 引き継ぎ の画面。
 *
 * ここで守っていること:
 * - 承認するまで外部 URL をクライアントへ渡さない。
 *   （承認後に発行される署名付きの内部リンクだけを扱う）
 * - 「買わない」を承認と同じ大きさの選択肢として置く。
 */
export default function ApproveClient() {
  const params = useSearchParams();
  const { profile, hydrated } = useProfile();
  const { ledger, hydrated: ledgerHydrated, setConsent, record } = useLedger();

  const category = useMemo<Category | null>(() => {
    const parsed = CategorySchema.safeParse(params.get("category"));
    return parsed.success ? parsed.data : null;
  }, [params]);

  const [comparison, setComparison] = useState<OfferComparison | null>(null);
  const [trace, setTrace] = useState<AgentStep[]>([]);
  const [state, setState] = useState<CommerceState>("INTENT_CAPTURED");
  const [selected, setSelected] = useState<ComparisonRow | null>(null);
  const [handoff, setHandoff] = useState<PurchaseHandoff | null>(null);
  const [validation, setValidation] = useState<OfferValidation | null>(null);
  const [declined, setDeclined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopped = useMemo(() => stoppedProductIds(ledger), [ledger]);

  /* 候補を取得する */
  useEffect(() => {
    if (!hydrated || !category) return;
    if (profile.ownedProductIds.length === 0) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const res = await fetch("/api/commerce/offers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile, category, limit: 3 }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.error ?? `サーバーエラー (${res.status})`);
        }
        const parsed = OffersResponseSchema.safeParse(await res.json());
        if (!parsed.success) throw new Error("応答の形式が想定と異なりました");
        if (cancelled) return;

        setComparison(parsed.data.comparison);
        setTrace(parsed.data.trace);
        setState(parsed.data.state);
        setSelected(
          parsed.data.comparison.rows.find((r) => r.selected) ?? null,
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "不明なエラー");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // 予算などを変えた場合は結果ページから再度遷移してくる想定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, category]);

  /* 承認 */
  const approve = useCallback(
    async (acknowledgedUnverified: boolean) => {
      if (!selected) return;
      setPending(true);
      setError(null);
      setValidation(null);

      try {
        const res = await fetch("/api/commerce/handoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile,
            offerId: selected.offer.offerId,
            acknowledgedPriceYen: selected.offer.price,
            acknowledgedUnverified,
          }),
        });

        const json = await res.json().catch(() => null);

        if (res.status === 409 && json) {
          const parsed = HandoffResponseSchema.safeParse(json);
          if (parsed.success) {
            setValidation(parsed.data.validation);
            setTrace(parsed.data.trace);
            setState(parsed.data.state);
            return;
          }
        }

        if (!res.ok) {
          throw new Error(json?.error ?? `サーバーエラー (${res.status})`);
        }

        const parsed = HandoffResponseSchema.safeParse(json);
        if (!parsed.success) throw new Error("応答の形式が想定と異なりました");

        setHandoff(parsed.data.handoff);
        setValidation(parsed.data.validation);
        setTrace(parsed.data.trace);
        setState(parsed.data.state);

        if (parsed.data.handoff && category) {
          record({
            kind: "approved",
            category,
            productId: parsed.data.handoff.offer.productId,
            priceYen: parsed.data.handoff.offer.price,
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "不明なエラー");
      } finally {
        setPending(false);
      }
    },
    [selected, profile, category, record],
  );

  /* 買わない */
  const decline = useCallback(() => {
    if (!category) return;
    setDeclined(true);
    setState("DECLINED");
    record({
      kind: "declined",
      category,
      productId: selected?.offer.productId ?? null,
      priceYen: selected?.offer.price ?? null,
    });
  }, [category, selected, record]);

  /* ------------------------------------------------------------------ */

  if (!category) {
    return (
      <Shell>
        <p className="chigiri-card p-5 text-sm">
          対象のカテゴリーが指定されていません。
          <Link href="/result" className="ml-2 text-ai underline underline-offset-2">
            結果に戻る
          </Link>
        </p>
      </Shell>
    );
  }

  if (!hydrated || !ledgerHydrated) {
    return (
      <Shell>
        <p className="text-sm text-sumi/50">読み込んでいます…</p>
      </Shell>
    );
  }

  if (profile.ownedProductIds.length === 0) {
    return (
      <Shell>
        <div className="chigiri-card p-5">
          <p className="text-sm">
            手持ちの化粧品が未登録のため、買い足しの判断ができません。
          </p>
          <Link
            href="/inventory"
            className="mt-3 inline-block rounded-lg bg-ai px-4 py-2 text-sm text-white"
          >
            手持ちを選ぶ
          </Link>
        </div>
      </Shell>
    );
  }

  if (declined) {
    return (
      <Shell category={category}>
        <DeclinedPanel
          category={category}
          savedYen={selected?.offer.price ?? 0}
          declineOutcome={comparison?.declineOutcome ?? null}
        />
        <AgentTrace trace={trace} state="DECLINED" />
      </Shell>
    );
  }

  return (
    <Shell category={category}>
      {!ledger.consent && <ConsentGate onAccept={() => setConsent(true)} />}

      {loading && (
        <p className="flex items-center gap-2 py-8 text-sm text-sumi/60">
          <span aria-hidden className="chigiri-thinking-dot text-ai">
            ●
          </span>
          {CATEGORY_LABEL[category]}の候補を、価格と条件で比べています…
        </p>
      )}

      {error && !comparison && (
        <p className="chigiri-card p-4 text-sm">
          候補を取得できませんでした（{error}）。
        </p>
      )}

      {comparison && (
        <>
          <OfferComparisonPanel
            comparison={comparison}
            selectedOfferId={selected?.offer.offerId ?? null}
            onSelect={(row) => {
              setSelected(row);
              setValidation(null);
              setError(null);
            }}
            stoppedProductIds={stopped}
          />

          {selected && (
            <ApprovalSheet
              row={selected}
              category={category}
              duplicateNote={null}
              otherRows={comparison.rows.filter(
                (r) => r.offer.offerId !== selected.offer.offerId,
              )}
              onApprove={approve}
              onDecline={decline}
              handoff={handoff}
              validation={validation}
              pending={pending}
              error={error}
            />
          )}

          {comparison.rows.length === 0 && (
            <div className="chigiri-card p-5">
              <p className="text-sm leading-relaxed">
                {comparison.declineOutcome}
              </p>
              <Link
                href="/result"
                className="mt-3 inline-block rounded-lg border border-ai px-4 py-2 text-sm text-ai"
              >
                ルーティンに戻る
              </Link>
            </div>
          )}

          <AgentTrace trace={trace} state={state} />
        </>
      )}
    </Shell>
  );
}

function Shell({
  children,
  category,
}: {
  children: React.ReactNode;
  category?: Category;
}) {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-5">
      <nav className="flex flex-wrap items-center gap-x-1.5 text-xs text-sumi/50">
        <Link href="/" className="underline underline-offset-2">
          CHIGIRI Beauty
        </Link>
        <span>/</span>
        <Link href="/result" className="underline underline-offset-2">
          ルーティン
        </Link>
        <span>/</span>
        <span>{category ? `${CATEGORY_LABEL[category]}の判断` : "確認"}</span>
      </nav>
      {children}
    </main>
  );
}

/** 「買わない」を選んだときの画面。失敗ではなく達成として見せる。 */
function DeclinedPanel({
  category,
  savedYen,
  declineOutcome,
}: {
  category: Category;
  savedYen: number;
  declineOutcome: string | null;
}) {
  return (
    <section className="chigiri-card overflow-hidden">
      <div className="bg-matchaSoft px-5 py-6 text-center">
        <p className="text-3xl" aria-hidden>
          🌿
        </p>
        <h2 className="mt-2 text-base font-semibold text-matcha">
          今回は買わない、で確定しました
        </h2>
        {savedYen > 0 && (
          <p className="mt-1 text-sm text-sumi/70">
            {savedYen.toLocaleString()}円の買い足しを見送りました
          </p>
        )}
      </div>
      <div className="space-y-3 p-5">
        <p className="text-xs leading-relaxed text-sumi/70">
          {declineOutcome ??
            `${CATEGORY_LABEL[category]}の工程は空いたままになりますが、手持ちで組んだルーティンはそのまま続けられます。`}
        </p>
        <p className="text-xs leading-relaxed text-sumi/60">
          この判断は端末内に記録しました。次に同じ役割が不足したとき、
          「前回は見送った」ことを踏まえて提案します。
        </p>
        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <Link
            href="/result"
            className="flex-1 rounded-xl bg-ai px-4 py-3 text-center text-sm text-white"
          >
            ルーティンに戻る
          </Link>
          <Link
            href="/ledger"
            className="flex-1 rounded-xl border border-beige bg-white px-4 py-3 text-center text-sm"
          >
            買わずに済んだ記録を見る
          </Link>
        </div>
      </div>
    </section>
  );
}

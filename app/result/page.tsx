"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import RecommendationCard from "@/components/RecommendationCard";
import { RecommendationSchema, type Recommendation } from "@/schemas/recommendation";
import { markStated, type Profile } from "@/schemas/profile";
import { useProfile } from "@/lib/storage";

/**
 * フォーム経由の結果ページ。
 * 予算スライダーで即座に再計算できるようにする（デモの再計算シナリオ）。
 */
export default function ResultPage() {
  const { profile, setProfile, hydrated } = useProfile();
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (p: Profile) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: p, skipLlm: false }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? `サーバーエラー (${res.status})`);
      }
      const parsed = RecommendationSchema.safeParse(await res.json());
      if (!parsed.success) throw new Error("応答の形式が想定と異なりました");
      setRec(parsed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hydrated && profile.ownedProductIds.length > 0) void run(profile);
    // 初回のみ実行する（以降は明示的な再計算ボタンから）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-5">
      <nav className="mb-5 flex flex-wrap items-center gap-x-1.5 text-xs text-sumi/50">
        <Link href="/" className="underline underline-offset-2">
          CHIGIRI Beauty
        </Link>
        <span>/</span>
        <Link href="/inventory" className="underline underline-offset-2">
          手持ちの化粧品
        </Link>
        <span>/</span>
        <span>結果</span>
        <Link href="/chat" className="ml-auto text-ai underline underline-offset-2">
          チャットで相談する
        </Link>
      </nav>

      {!hydrated ? (
        <p className="text-sm text-sumi/50">読み込んでいます…</p>
      ) : profile.ownedProductIds.length === 0 ? (
        <div className="chigiri-card p-5">
          <p className="text-sm">手持ちの化粧品がまだ選ばれていません。</p>
          <Link
            href="/inventory"
            className="mt-3 inline-block rounded-lg bg-ai px-4 py-2 text-sm text-white"
          >
            手持ちを選ぶ
          </Link>
        </div>
      ) : (
        <>
          {/* 予算変更による再計算 */}
          <section className="chigiri-card mb-5 p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[200px] flex-1">
                <label htmlFor="budget" className="chigiri-label mb-1.5 block">
                  買い足し予算：{profile.budgetYen.toLocaleString()}円
                </label>
                <input
                  id="budget"
                  type="range"
                  min={0}
                  max={10000}
                  step={500}
                  value={profile.budgetYen}
                  onChange={(e) =>
                    setProfile(
                      markStated(
                        { ...profile, budgetYen: Number(e.target.value) },
                        "budgetYen",
                      ),
                    )
                  }
                  className="w-full accent-ai"
                />
              </div>
              <button
                type="button"
                onClick={() => void run(profile)}
                disabled={loading}
                className="rounded-lg bg-ai px-4 py-2.5 text-sm text-white disabled:opacity-40"
              >
                {loading ? "計算中…" : "この予算で再計算"}
              </button>
            </div>
          </section>

          {loading && !rec && (
            <p className="flex items-center gap-2 py-10 text-sm text-sumi/60">
              <span aria-hidden className="chigiri-thinking-dot text-ai">
                ●
              </span>
              手持ち商品の役割を整理しています…
            </p>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-sakura/40 bg-sakuraSoft/50 px-3 py-3 text-sm">
              <p>結果を取得できませんでした（{error}）。</p>
              <button
                type="button"
                onClick={() => void run(profile)}
                className="mt-2 rounded-lg border border-ai px-3 py-1.5 text-xs text-ai"
              >
                もう一度試す
              </button>
            </div>
          )}

          {rec && <RecommendationCard rec={rec} profile={profile} />}
        </>
      )}
    </main>
  );
}

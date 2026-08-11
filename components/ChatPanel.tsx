"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatResponseSchema, type Recommendation } from "@/schemas/recommendation";
import { markStated, type Profile } from "@/schemas/profile";
import { useProfile } from "@/lib/storage";
import { CONCIERGES, DEFAULT_CONCIERGE } from "@/domain/concierges";
import ChigiriMark from "./ChigiriMark";
import ConciergeSidebar from "./ConciergeSidebar";
import ProfileForm from "./ProfileForm";
import ProductSelector from "./ProductSelector";
import RecommendationCard from "./RecommendationCard";

/**
 * 相談画面。
 * 会話は入口で、判断そのものはサーバー側の決定論的エンジンが行う。
 * ここには推薦ロジックを一切置かない。
 */

type Bubble = {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: number;
  rec?: Recommendation | null;
  /** サーバーが「まだ聞けていない」と判断した項目 */
  missing?: string[];
};

const THINKING_STEPS = [
  "うかがった条件を整理しています",
  "手持ちから使えないものを外しています",
  "それぞれの役割を分類しています",
  "朝と夜に必要な工程を確認しています",
  "役割が重なっているものを探しています",
  "足りていない役割だけを取り出しています",
  "説明を組み立てています",
];

let bubbleSeq = 0;
const nextId = () => `b${++bubbleSeq}`;

function formatTime(at: number): string {
  if (Date.now() - at < 60_000) return "いま";
  return new Date(at).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatPanel() {
  const { profile, setProfile, hydrated } = useProfile();
  const [conciergeId, setConciergeId] = useState(DEFAULT_CONCIERGE.id);
  const concierge =
    CONCIERGES.find((c) => c.id === conciergeId) ?? DEFAULT_CONCIERGE;

  const [messages, setMessages] = useState<Bubble[]>([
    {
      id: "opening",
      role: "assistant",
      text: DEFAULT_CONCIERGE.opening,
      at: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "profile" | "inventory">("none");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const atStart = messages.length <= 1;

  useEffect(() => {
    if (!atStart) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading, atStart]);

  useEffect(() => {
    if (!loading) {
      setThinkingStep(0);
      return;
    }
    const t = setInterval(
      () => setThinkingStep((s) => (s + 1) % THINKING_STEPS.length),
      900,
    );
    return () => clearInterval(t);
  }, [loading]);

  const send = useCallback(
    async (text: string, overrideProfile?: Profile) => {
      const trimmed = text.trim();
      if (trimmed.length === 0 || loading) return;

      const activeProfile = overrideProfile ?? profile;
      setError(null);
      setInput("");
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "user", text: trimmed, at: Date.now() },
      ]);
      setLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history: [],
            profile: activeProfile,
          }),
        });

        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.error ?? `サーバーエラー (${res.status})`);
        }

        const parsed = ChatResponseSchema.safeParse(await res.json());
        if (!parsed.success) {
          throw new Error("応答の形式が想定と異なりました");
        }

        setProfile(parsed.data.profile);
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            text: parsed.data.reply,
            at: Date.now(),
            rec: parsed.data.recommendation,
            missing: parsed.data.missing,
          },
        ]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "不明なエラー";
        setError(msg);
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            at: Date.now(),
            text:
              `申し訳ありません。うまく処理できませんでした（${msg}）。\n` +
              "もう一度お試しいただくか、「マイアイテム」から手持ちを選んで組み立てることもできます。",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, profile, setProfile],
  );

  const toggleOwned = useCallback(
    (id: string) => {
      setProfile((prev) =>
        markStated(
          {
            ...prev,
            ownedProductIds: prev.ownedProductIds.includes(id)
              ? prev.ownedProductIds.filter((x) => x !== id)
              : [...prev.ownedProductIds, id],
          },
          "ownedProductIds",
        ),
      );
    },
    [setProfile],
  );

  /** 設定パネルから直接組み立てる（予算変更の再計算もここ） */
  const recalc = useCallback(
    (next: Profile) => {
      setProfile(next);
      void send("いまの条件で組み立ててください", next);
      setPanel("none");
    },
    [send, setProfile],
  );

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-inkSoft">
        読み込んでいます…
      </div>
    );
  }

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[minmax(300px,360px)_1fr]">
      {/* サイドバー：デスクトップは常時表示 */}
      <aside className="hidden border-r border-line lg:block">
        <div className="sticky top-0 h-dvh">
          <ConciergeSidebar
            activeId={conciergeId}
            onSelect={setConciergeId}
            ownedCount={profile.ownedProductIds.length}
          />
        </div>
      </aside>

      {/* サイドバー：モバイルはシート */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="閉じる"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 bg-forestDeep/25"
          />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-sm shadow-lift">
            <ConciergeSidebar
              activeId={conciergeId}
              onSelect={(id) => {
                setConciergeId(id);
                setSidebarOpen(false);
              }}
              ownedCount={profile.ownedProductIds.length}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-h-dvh flex-col bg-mist">
        {/* ヘッダー */}
        <header className="sticky top-0 z-20 bg-mist/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="chigiri-tap flex items-center gap-2 rounded-full border border-line bg-cream px-3 lg:hidden"
            >
              <ChigiriMark size={20} />
              <span className="text-[13px] font-semibold tracking-brand text-forest">
                CHIGIRI
              </span>
            </button>

            <p className="hidden items-center gap-2 text-[13px] text-forest lg:flex">
              <span aria-hidden className="h-2 w-2 rounded-full bg-sage" />
              {concierge.name}・{concierge.area}
            </p>

            <div className="ml-auto flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setPanel(panel === "inventory" ? "none" : "inventory")
                }
                aria-expanded={panel === "inventory"}
                className="chigiri-pill"
              >
                マイアイテム
                {profile.ownedProductIds.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-sageSoft px-1.5 text-[11px] text-forest">
                    {profile.ownedProductIds.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setPanel(panel === "profile" ? "none" : "profile")}
                aria-expanded={panel === "profile"}
                className="chigiri-pill"
              >
                今日の調子
              </button>
              <Link href="/database" className="chigiri-pill hidden sm:inline-flex">
                公式情報
              </Link>
            </div>
          </div>

          {panel !== "none" && (
            <div className="border-y border-line bg-cream">
              <div className="mx-auto max-h-[62vh] w-full max-w-3xl overflow-y-auto px-4 py-5 sm:px-6">
                {panel === "profile" ? (
                  <ProfileForm profile={profile} onChange={setProfile} />
                ) : (
                  <ProductSelector
                    selectedIds={profile.ownedProductIds}
                    onToggle={toggleOwned}
                  />
                )}
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => recalc(profile)}
                    disabled={loading || profile.ownedProductIds.length === 0}
                    className="chigiri-btn-primary flex-1"
                  >
                    この内容で組み立てる
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanel("none")}
                    className="chigiri-btn-ghost"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            </div>
          )}
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-6 sm:px-6">
          {/* 会話の冒頭だけ、大きな見出しを出す */}
          {atStart && (
            <div className="pt-4 sm:pt-8">
              <p className="chigiri-eyebrow">
                {concierge.name}・{concierge.area}
              </p>
              <h1 className="mt-4 text-[30px] font-normal leading-[1.5] tracking-tight text-forest sm:text-[44px]">
                今の悩みを、
                <br />
                そのまま聞かせてください。
              </h1>
              <p className="mt-4 text-[14px] leading-relaxed text-inkSoft sm:text-[15px]">
                普段使っているものや、いつもの過ごし方も教えてください。
              </p>
            </div>
          )}

          <ul className="mt-7 space-y-5">
            {messages.map((m) => (
              <li key={m.id}>
                {m.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-card rounded-br-md bg-forest px-4 py-3">
                      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-cream">
                        {m.text}
                      </p>
                      <p className="mt-1 text-right text-[10px] text-cream/60">
                        {formatTime(m.at)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream shadow-soft"
                      >
                        <ChigiriMark size={20} />
                      </span>
                      <div className="min-w-0 flex-1 rounded-card rounded-tl-md border border-line bg-cream px-4 py-3.5 shadow-soft">
                        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
                          {m.text}
                        </p>
                        <p className="mt-1.5 text-[10px] text-inkSoft">
                          {formatTime(m.at)}
                        </p>
                      </div>
                    </div>

                    {m.rec && (
                      <div className="sm:pl-12">
                        <RecommendationCard rec={m.rec} />
                      </div>
                    )}

                    {/* 「選んでください」と書いた直後に、実際に選べるものを出す */}
                    {m.missing?.includes("ownedProductIds") &&
                      m.id === messages[messages.length - 1]?.id && (
                        <section className="chigiri-card p-4 sm:ml-12">
                          <h2 className="mb-3 text-sm font-semibold text-forest">
                            お使いのものを選んでください
                          </h2>
                          <ProductSelector
                            selectedIds={profile.ownedProductIds}
                            onToggle={toggleOwned}
                            compact
                          />
                          <button
                            type="button"
                            onClick={() => recalc(profile)}
                            disabled={
                              loading || profile.ownedProductIds.length === 0
                            }
                            className="chigiri-btn-primary mt-3 w-full"
                          >
                            {profile.ownedProductIds.length === 0
                              ? "1点以上選んでください"
                              : `この${profile.ownedProductIds.length}点で組み立てる`}
                          </button>
                        </section>
                      )}
                  </div>
                )}
              </li>
            ))}

            {loading && (
              <li>
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream shadow-soft"
                  >
                    <ChigiriMark size={20} />
                  </span>
                  <div
                    className="rounded-card rounded-tl-md border border-line bg-cream px-4 py-3.5 shadow-soft"
                    aria-live="polite"
                  >
                    <p className="flex items-center gap-2 text-[14px] text-ink">
                      <span aria-hidden className="chigiri-thinking-dot text-sage">
                        ●
                      </span>
                      {THINKING_STEPS[thinkingStep]}
                    </p>
                    <p className="mt-1 text-[10px] text-inkSoft">
                      商品の選定はサーバー側の決まった手順で行っています
                    </p>
                  </div>
                </div>
              </li>
            )}
          </ul>

          {/* クイック選択肢 */}
          {atStart && concierge.quickChoices.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2 sm:pl-12">
              {concierge.quickChoices.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void send(q)}
                  className="chigiri-chip chigiri-chip-off"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <div ref={endRef} />
        </main>

        {/* 入力欄 */}
        <footer className="sticky bottom-0 bg-mist/90 backdrop-blur">
          <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-2 sm:px-6">
            {error && (
              <p className="mb-2 rounded-soft border border-clay/30 bg-claySoft px-3 py-2 text-xs text-ink">
                {error}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
              className="flex items-center gap-2 rounded-panel border border-line bg-cream py-2 pl-3 pr-2 shadow-soft"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sageSoft"
              >
                <ChigiriMark size={18} />
              </span>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                placeholder="気になっていることを入力"
                aria-label="気になっていることを入力"
                className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[14px] outline-none placeholder:text-inkSoft"
              />
              <button
                type="submit"
                disabled={loading || input.trim().length === 0}
                aria-label="送信"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sage text-cream transition-colors hover:bg-forestSoft disabled:opacity-40"
              >
                <span aria-hidden className="text-lg leading-none">
                  ↑
                </span>
              </button>
            </form>
            <p className="mt-2 text-center text-[10px] leading-relaxed text-inkSoft">
              名前・住所などの個人情報は入力しないでください。強い症状があるときは医療機関へご相談ください。
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

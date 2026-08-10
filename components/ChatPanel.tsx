"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatResponseSchema, type Recommendation } from "@/schemas/recommendation";
import { markStated, type Profile, type ProfileField } from "@/schemas/profile";
import { useProfile } from "@/lib/storage";
import ProfileForm from "./ProfileForm";
import ProductSelector from "./ProductSelector";
import RecommendationCard from "./RecommendationCard";

/**
 * チャット本体。
 * 会話は入口で、判断そのものはサーバー側の決定論的エンジンが行う。
 * ここには推薦ロジックを一切置かない。
 */

type Bubble = {
  id: string;
  role: "user" | "assistant";
  text: string;
  rec?: Recommendation | null;
  /** サーバーが「まだ聞けていない」と判断した項目 */
  missing?: string[];
};

const THINKING_STEPS = [
  "入力された条件を整理しています",
  "手持ち商品から使えないものを外しています",
  "商品の役割を分類しています",
  "朝と夜に必要な工程を確認しています",
  "役割が重なっている商品を探しています",
  "不足している役割だけを取り出しています",
  "説明文を組み立てています",
];

const OPENING =
  "こんにちは。CHIGIRI Beauty です。\n" +
  "新しい商品をたくさん勧めるのではなく、いま持っているものを組み直して、足りない分だけをお伝えします。\n\n" +
  "肌の傾向、気になっていること、買い足しに使える予算、いま使っている化粧品を、話せる範囲で教えてください。";

const SUGGESTIONS = [
  "混合肌で、毛穴と乾燥が気になります。予算は3000円くらいです",
  "朝は3分しか時間がありません",
  "予算を1000円に変えて計算し直して",
  "アルコールが入っているものは避けたいです",
];

let bubbleSeq = 0;
const nextId = () => `b${++bubbleSeq}`;

export default function ChatPanel() {
  const { profile, setProfile, hydrated } = useProfile();
  const [messages, setMessages] = useState<Bubble[]>([
    { id: "opening", role: "assistant", text: OPENING },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "profile" | "inventory">("none");

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

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
        { id: nextId(), role: "user", text: trimmed },
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

        const json = await res.json();
        const parsed = ChatResponseSchema.safeParse(json);
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
            text:
              `申し訳ありません。処理中に問題が発生しました（${msg}）。\n` +
              "もう一度お試しいただくか、右上の「条件」から手持ち商品を選んで再計算してください。",
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

  /** 設定パネルから直接再計算する（予算変更のデモ用） */
  const recalc = useCallback(
    (next: Profile) => {
      setProfile(next);
      void send("いまの条件で組み直してください", next);
      setPanel("none");
    },
    [send, setProfile],
  );

  if (!hydrated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-sumi/50">
        読み込んでいます…
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-beige/70 bg-washi/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-wide">
              CHIGIRI Beauty
            </p>
            <p className="truncate text-[11px] text-sumi/50">
              買う前に、今あるものをつなぐ。
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => setPanel(panel === "inventory" ? "none" : "inventory")}
              className="rounded-lg border border-beige bg-white px-2.5 py-1.5 text-xs"
            >
              手持ち{profile.ownedProductIds.length > 0 && `（${profile.ownedProductIds.length}）`}
            </button>
            <button
              type="button"
              onClick={() => setPanel(panel === "profile" ? "none" : "profile")}
              className="rounded-lg border border-beige bg-white px-2.5 py-1.5 text-xs"
            >
              条件
            </button>
          </div>
        </div>

        {panel !== "none" && (
          <div className="border-t border-beige/70 bg-white/95">
            <div className="mx-auto max-h-[65vh] max-w-3xl overflow-y-auto px-4 py-4">
              {panel === "profile" ? (
                <ProfileForm profile={profile} onChange={setProfile} />
              ) : (
                <ProductSelector
                  selectedIds={profile.ownedProductIds}
                  onToggle={toggleOwned}
                />
              )}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => recalc(profile)}
                  disabled={loading || profile.ownedProductIds.length === 0}
                  className="flex-1 rounded-lg bg-ai px-4 py-2.5 text-sm text-white disabled:opacity-40"
                >
                  この条件で組み立てる
                </button>
                <button
                  type="button"
                  onClick={() => setPanel("none")}
                  className="rounded-lg border border-beige px-4 py-2.5 text-sm"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        <ul className="space-y-4">
          {messages.map((m) => (
            <li key={m.id}>
              {m.role === "user" ? (
                <div className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-ai px-3.5 py-2.5 text-sm leading-relaxed text-white">
                    {m.text}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-start">
                    <p className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-beige/70 bg-white px-3.5 py-2.5 text-sm leading-relaxed">
                      {m.text}
                    </p>
                  </div>
                  {m.rec && <RecommendationCard rec={m.rec} />}

                  {/* 「選んでください」と書いた直後に、実際に選べるものを出す */}
                  {m.missing?.includes("ownedProductIds") &&
                    m.id === messages[messages.length - 1]?.id && (
                      <section className="chigiri-card p-4">
                        <h3 className="mb-3 text-sm font-semibold">
                          お使いの化粧品を選んでください
                        </h3>
                        <ProductSelector
                          selectedIds={profile.ownedProductIds}
                          onToggle={toggleOwned}
                          compact
                        />
                        <button
                          type="button"
                          onClick={() => recalc(profile)}
                          disabled={loading || profile.ownedProductIds.length === 0}
                          className="mt-3 w-full rounded-lg bg-ai px-4 py-2.5 text-sm text-white disabled:opacity-40"
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
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-beige/70 bg-white px-3.5 py-2.5">
                  <p className="flex items-center gap-2 text-sm text-sumi/70">
                    <span aria-hidden className="chigiri-thinking-dot text-ai">
                      ●
                    </span>
                    {THINKING_STEPS[thinkingStep]}
                  </p>
                  <p className="mt-1 text-[11px] text-sumi/45">
                    商品の選定はサーバー側の決定論的ロジックが担当しています
                  </p>
                </div>
              </div>
            </li>
          )}
        </ul>

        {messages.length <= 1 && (
          <div className="mt-5">
            <p className="chigiri-label mb-2">こんなふうに話しかけてください</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border border-beige bg-white px-3 py-1.5 text-left text-xs text-sumi/75 hover:border-ai/40"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-sumi/50">
              手持ちの化粧品は、上の「手持ち」から選ぶこともできます。
            </p>
          </div>
        )}

        <div ref={endRef} />
      </main>

      <footer className="sticky bottom-0 border-t border-beige/70 bg-washi/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          {error && (
            <p className="mb-2 rounded-lg border border-sakura/40 bg-sakuraSoft/50 px-3 py-2 text-xs text-sumi/80">
              {error}
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-end gap-2"
          >
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
              placeholder="肌の悩み、予算、持っている化粧品など"
              aria-label="メッセージ"
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-beige bg-white px-3 py-2.5 text-sm outline-none focus:border-ai"
            />
            <button
              type="submit"
              disabled={loading || input.trim().length === 0}
              className="h-[44px] shrink-0 rounded-xl bg-ai px-4 text-sm text-white disabled:opacity-40"
            >
              送る
            </button>
          </form>
          <p className="mt-2 text-[10px] leading-relaxed text-sumi/45">
            本サービスは美容情報の整理を目的としたもので、医療上の診断や治療を提供するものではありません。
            肌に異常がある場合は使用を中止し、医師や専門家へ相談してください。
          </p>
        </div>
      </footer>
    </div>
  );
}

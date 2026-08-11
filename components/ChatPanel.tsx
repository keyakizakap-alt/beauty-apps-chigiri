"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatResponseSchema, type Recommendation } from "@/schemas/recommendation";
import { markStated, type Profile } from "@/schemas/profile";
import { PRODUCTS } from "@/domain/recommendation/catalog";
import { useProfile } from "@/lib/storage";
import { usePrivacy } from "@/lib/privacy";
import {
  useConversations,
  type StoredMessage,
} from "@/lib/conversations";
import ProfileForm from "./ProfileForm";
import ProductSelector from "./ProductSelector";
import RecommendationCard from "./RecommendationCard";
import ConversationSidebar from "./ConversationSidebar";
import AiConsentCard from "./AiConsentCard";
import { ChigiriMark } from "./AppSplash";
import {
  conciergeForDomain,
  findConcierge,
  type Concierge,
} from "@/domain/concierges";

/**
 * チャット本体。
 * 会話は入口で、判断そのものはサーバー側の決定論的エンジンが行う。
 * ここには推薦ロジックを一切置かない。
 *
 * 画面は「相談ログのサイドバー＋対話」の二段構成。
 * 過去の相談を開き直すと、そのときの条件と生成済みルーティンまで戻る。
 */

type Bubble = {
  id: string;
  role: "user" | "assistant";
  text: string;
  rec?: Recommendation | null;
  /** サーバーが「まだ聞けていない」と判断した項目 */
  missing?: string[];
  at: string;
};

const OPENING_ID = "opening";

const THINKING_STEPS = [
  "入力された条件を整理しています",
  "手持ち商品から使えないものを外しています",
  "商品の役割を分類しています",
  "朝と夜に必要な工程を確認しています",
  "役割が重なっている商品を探しています",
  "不足している役割だけを取り出しています",
  "説明文を組み立てています",
];

let bubbleSeq = 0;
const nextId = () => `b${Date.now().toString(36)}-${++bubbleSeq}`;

/**
 * 時間帯に合わせた挨拶と、相談先からの最初の一言。
 * 描画後（クライアント）でのみ組み立てる。
 */
function openingBubble(concierge: Concierge): Bubble {
  const h = new Date().getHours();
  const greeting =
    h < 5 ? "こんばんは" : h < 11 ? "おはようございます" : h < 18 ? "こんにちは" : "こんばんは";

  return {
    id: OPENING_ID,
    role: "assistant",
    at: new Date().toISOString(),
    text:
      `${greeting}。${concierge.opening}\n\n` +
      "うまく言葉にできなくても大丈夫です。今いちばん気になることから、ゆっくり聞かせてください。",
  };
}

const toStored = (b: Bubble): StoredMessage => ({
  id: b.id,
  role: b.role,
  text: b.text,
  rec: b.rec ?? null,
  missing: b.missing ?? [],
  at: b.at,
});

const toBubble = (m: StoredMessage): Bubble => ({
  id: m.id,
  role: m.role,
  text: m.text,
  rec: m.rec,
  missing: m.missing,
  at: m.at,
});

export default function ChatPanel() {
  const { profile, setProfile, hydrated: profileHydrated } = useProfile();
  const {
    settings: privacy,
    hydrated: privacyHydrated,
    setAllowExternalAi,
  } = usePrivacy();
  const {
    hydrated: convHydrated,
    storage,
    conversations,
    activeId,
    startNew,
    select,
    remove,
    syncActive,
  } = useConversations();

  /**
   * 表示中の相談と、その発言。
   *
   * 発言だけを別の state に持つと、相談を切り替えた直後の一瞬だけ
   * 「新しい相談 ID ＋ 前の相談の発言」という組み合わせが成立してしまい、
   * 保存側が前の相談の内容を新しい相談へ書き込む。
   * 取り違えを起こしようがないよう、常に組で持つ。
   */
  const [session, setSession] = useState<{
    id: string;
    messages: Bubble[];
  } | null>(null);

  const messages = session?.messages ?? [];

  /** 表示中の相談の発言だけを差し替える */
  const setMessages = useCallback(
    (updater: (prev: Bubble[]) => Bubble[]) =>
      setSession((prev) =>
        prev ? { ...prev, messages: updater(prev.messages) } : prev,
      ),
    [],
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "profile" | "inventory" | "settings">("none");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 相談先は分野そのもの。プロファイルの分野から引く。
  const concierge = conciergeForDomain(profile.domain);
  const conciergeId = concierge.id;

  const endRef = useRef<HTMLDivElement>(null);
  /** 保存時に読む最新のプロファイル（発言の変化だけで保存を起こすため） */
  const profileRef = useRef(profile);
  profileRef.current = profile;
  /** 送信時に読む最新のプライバシー設定 */
  const privacyRef = useRef(privacy);
  privacyRef.current = privacy;

  const ready = profileHydrated && convHydrated && privacyHydrated;

  /* 起動時・相談の切り替え時に、その相談の内容を読み込む */
  useEffect(() => {
    if (!ready) return;

    if (!activeId) {
      startNew(profileRef.current);
      return;
    }
    if (session?.id === activeId) return;

    const conversation = conversations.find((c) => c.id === activeId);

    setSession({
      id: activeId,
      messages:
        conversation && conversation.messages.length > 0
          ? conversation.messages.map(toBubble)
          : [openingBubble(concierge)],
    });
    setPanel("none");
    setError(null);

    // 過去の相談を開いたときは、そのときの条件まで戻す。
    // 「何を前提に出した結論か」が分からないと振り返りにならないため。
    if (conversation && conversation.messages.length > 0) {
      setProfile(conversation.profile);
    }
    // conversations を依存に入れると保存のたびに再読み込みされるため入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeId, session?.id, startNew, setProfile]);

  /* 発言が変わったら相談ログへ保存する */
  useEffect(() => {
    if (!ready || !session) return;
    // 表示中の相談と保存先が一致しているときだけ書き込む
    if (session.id !== activeId) return;
    const persistable = session.messages.filter((m) => m.id !== OPENING_ID);
    if (persistable.length === 0) return;
    syncActive(persistable.map(toStored), profileRef.current);
  }, [session, ready, activeId, syncActive]);

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
      setSidebarOpen(false);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "user", text: trimmed, at: new Date().toISOString() },
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
            // 既定は false。利用者が明示的に許可したときだけ外部AIを使う。
            allowExternalAi: privacyRef.current.allowExternalAi,
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
            rec: parsed.data.recommendation,
            missing: parsed.data.missing,
            at: new Date().toISOString(),
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
            at: new Date().toISOString(),
            text:
              `申し訳ありません。処理中に問題が発生しました（${msg}）。\n` +
              "もう一度お試しいただくか、上の「条件」から手持ち商品を選んで再計算してください。",
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


  /**
   * 相談先の切り替え。
   *
   * 分野が変わると扱う商品も工程も変わるため、同じ相談の続きにはしない。
   * その分野の新しい相談として開き直す。手持ちの登録は分野ごとに
   * 意味が違うので引き継がない（ヘアの相談にスキンケアの手持ちを
   * 持ち込むと、役割の重複判定が成立しなくなるため）。
   */
  const handleSelectConcierge = useCallback(
    (id: string) => {
      const next = findConcierge(id);
      if (next.domain === profileRef.current.domain) return;

      const nextProfile: Profile = {
        ...profileRef.current,
        domain: next.domain,
        concerns: [],
        ownedProductIds: [],
        statedFields: [],
      };
      setProfile(nextProfile);
      setSidebarOpen(false);
      setPanel("none");
      startNew(nextProfile);
    },
    [setProfile, startNew],
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

  const handleNew = useCallback(() => {
    startNew(profileRef.current);
    setSidebarOpen(false);
  }, [startNew]);

  const handleSelect = useCallback(
    (id: string) => {
      select(id);
      setSidebarOpen(false);
    },
    [select],
  );

  const isFresh = useMemo(
    () => messages.filter((m) => m.id !== OPENING_ID).length === 0,
    [messages],
  );

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-sumi/50">
        読み込んでいます…
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-blush">
      {/* サイドバー（デスクトップ） */}
      <aside className="hidden w-[304px] shrink-0 border-r border-beige/70 lg:block">
        <div className="sticky top-0 h-dvh">
          <ConversationSidebar
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelect}
            onNew={handleNew}
            onDelete={remove}
            storage={storage}
            conciergeId={conciergeId}
            onSelectConcierge={handleSelectConcierge}
          />
        </div>
      </aside>

      {/* サイドバー（モバイルの引き出し） */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="相談ログを閉じる"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 bg-sumi/25"
          />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-[320px] border-r border-beige shadow-xl">
            <ConversationSidebar
              conversations={conversations}
              activeId={activeId}
              onSelect={handleSelect}
              onNew={handleNew}
              onDelete={remove}
              storage={storage}
              onClose={() => setSidebarOpen(false)}
              conciergeId={conciergeId}
              onSelectConcierge={handleSelectConcierge}
            />
          </div>
        </div>
      )}

      {/* 対話 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-beige/60 bg-blush/85 backdrop-blur">
          <div className="flex items-center gap-2 px-4 py-3 sm:px-6">
            {/*
              1024px 未満ではサイドバーを畳むため、履歴への入口はこのボタンだけになる。
              記号だけだと何が入っているか分からないので、名前と件数を出す。
            */}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-beige bg-white px-2.5 py-1.5 text-xs text-sumi/75 lg:hidden"
            >
              <span aria-hidden>☰</span>
              <span>相談ログ</span>
              {conversations.length > 0 && (
                <span className="rounded-full bg-ai px-1.5 text-[10px] leading-[1.4] text-white">
                  {conversations.length}
                </span>
              )}
            </button>

            {/* 状態表示 */}
            <p className="flex min-w-0 items-center gap-2 text-[13px] text-sumi/70">
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${
                  loading ? "chigiri-thinking-dot bg-sakura" : "bg-matcha"
                }`}
              />
              <span className="truncate">
                {loading ? "整理しています" : "相談できます"}
              </span>
            </p>

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setPanel(panel === "inventory" ? "none" : "inventory")
                }
                className="rounded-lg border border-beige bg-white px-2.5 py-1.5 text-xs"
              >
                手持ち
                {profile.ownedProductIds.length > 0 &&
                  `（${profile.ownedProductIds.length}）`}
              </button>
              <button
                type="button"
                onClick={() => setPanel(panel === "profile" ? "none" : "profile")}
                className="rounded-lg border border-beige bg-white px-2.5 py-1.5 text-xs"
              >
                条件
              </button>
              <button
                type="button"
                onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
                aria-expanded={panel === "settings"}
                title={
                  privacy.decided
                    ? privacy.allowExternalAi
                      ? "外部AIの利用を許可しています。設定で変更できます。"
                      : "外部へは何も送信していません。設定で変更できます。"
                    : "説明文の作り方をまだ選んでいません。設定で選べます。"
                }
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs ${
                  privacy.allowExternalAi
                    ? "border-beige bg-white text-sumi/60"
                    : "border-matcha/30 bg-matchaSoft text-matcha"
                }`}
              >
                <span aria-hidden>⚙</span>
                <span className="hidden sm:inline">設定</span>
                <span className="sr-only">
                  {privacy.allowExternalAi ? "AI説明を利用中" : "端末内で処理"}
                </span>
              </button>
              <p className="hidden rounded-full border border-beige bg-white px-3 py-1.5 text-xs text-sumi/60 lg:block">
                日本・韓国コスメ {PRODUCTS.length}点
              </p>
            </div>
          </div>

          {/*
            保存できていないことは、サイドバーを開かないと気づけない。
            消えてから知るのでは遅いので、対話画面の上部にも出す。
          */}
          {storage !== "ok" && (
            <p className="border-t border-sakura/30 bg-sakuraSoft/60 px-4 py-2 text-[11px] leading-relaxed text-sumi/75 sm:px-6">
              ⚠ この端末に保存できていないため、画面を閉じると相談内容は消えます。
              {storage === "unavailable"
                ? "ブラウザのプライベートモードや、保存をブロックする設定を確認してください。"
                : "保存領域が一杯です。相談ログから古いものを削除してください。"}
            </p>
          )}

          {panel !== "none" && (
            <div className="border-t border-beige/70 bg-white/95">
              <div className="mx-auto max-h-[65vh] max-w-3xl overflow-y-auto px-4 py-4">
                {panel === "profile" && (
                  <ProfileForm profile={profile} onChange={setProfile} />
                )}
                {panel === "inventory" && (
                  <ProductSelector
                    selectedIds={profile.ownedProductIds}
                    onToggle={toggleOwned}
                    domain={profile.domain}
                  />
                )}
                {panel === "settings" && (
                  <div className="space-y-4">
                    <AiConsentCard
                      onChoose={setAllowExternalAi}
                      current={privacy.decided ? privacy.allowExternalAi : null}
                    />
                    {/* データの送信先に関する設定 */}
                    <div className="mt-5 rounded-xl border border-beige bg-kinari/50 p-4">
                      <p className="text-sm font-medium">データの扱い</p>
                      <p className="mt-1.5 text-xs leading-relaxed text-sumi/70">
                        入力内容・相談ログ・手持ちの一覧は、この端末の中だけに保存しています。
                        サーバーには保存せず、機械学習にも使いません。
                      </p>
                      <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg bg-white p-3 text-xs leading-relaxed">
                        <input
                          type="checkbox"
                          checked={privacy.allowExternalAi}
                          onChange={(e) => setAllowExternalAi(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-ai"
                        />
                        <span>
                          <span className="font-medium">
                            外部AIサービスで説明文を作る
                          </span>
                          <br />
                          <span className="text-sumi/60">
                            オフのままなら、外部へは一切送信しません（既定）。
                            オンにすると、条件と確定済みルーティンが外部AIへ送られます。
                            アレルギー・避けたい成分の具体名は、オンでも送りません。
                          </span>
                        </span>
                      </label>
                      <Link
                        href="/privacy"
                        className="mt-2 inline-block text-xs text-ai underline underline-offset-2"
                      >
                        何が送られ、何が送られないかを詳しく見る
                      </Link>
                    </div>
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  {panel !== "settings" && (
                    <button
                      type="button"
                      onClick={() => recalc(profile)}
                      disabled={loading || profile.ownedProductIds.length === 0}
                      className="flex-1 rounded-lg bg-ai px-4 py-2.5 text-sm text-white disabled:opacity-40"
                    >
                      この条件で組み立てる
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPanel("none")}
                    className={`rounded-lg border border-beige px-4 py-2.5 text-sm ${
                      panel === "settings" ? "flex-1" : ""
                    }`}
                  >
                    閉じる
                  </button>
                </div>
              </div>
            </div>
          )}
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
          {/* 導入。初回の相談でだけ出す。 */}
          {isFresh && (
            <div className="mb-7">
              <p className="chigiri-eyebrow">
                {concierge.name}・{concierge.area}
              </p>
              <h1 className="mt-2.5 text-[28px] font-normal leading-[1.45] tracking-tight text-mori sm:text-[38px]">
                {concierge.heading.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </h1>
              <p className="mt-3 text-[13px] leading-relaxed text-sumi/60">
                {concierge.subheading}
              </p>
            </div>
          )}

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
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 shrink-0">
                        <ChigiriMark size={28} />
                      </span>
                      <p className="min-w-0 flex-1 whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-beige/60 bg-white px-4 py-3 text-sm leading-relaxed">
                        {m.text}
                      </p>
                    </div>

                    {m.rec && <RecommendationCard rec={m.rec} profile={profile} />}

                    {/* 「選んでください」と書いた直後に、実際に選べるものを出す */}
                    {m.missing?.includes("ownedProductIds") &&
                      m.id === messages[messages.length - 1]?.id && (
                        <section className="chigiri-card p-4">
                          <h3 className="mb-3 text-sm font-semibold">
                            お使いのものを選んでください
                          </h3>
                          <ProductSelector
                            selectedIds={profile.ownedProductIds}
                            onToggle={toggleOwned}
                            compact
                            domain={profile.domain}
                          />
                          <button
                            type="button"
                            onClick={() => recalc(profile)}
                            disabled={
                              loading || profile.ownedProductIds.length === 0
                            }
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
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0">
                    <ChigiriMark size={28} />
                  </span>
                  <div className="rounded-2xl rounded-tl-sm border border-beige/60 bg-white px-4 py-3">
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

          {isFresh && (
            <div className="mt-6">
              <p className="chigiri-label mb-2">こんなふうに話しかけてください</p>
              <div className="flex flex-wrap gap-2">
                {concierge.quickChoices.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    className="chigiri-chip chigiri-chip-off text-left"
                  >
                    {q}
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

        <footer className="sticky bottom-0 border-t border-beige/60 bg-blush/90 backdrop-blur">
          <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
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
              className="flex items-end gap-2 rounded-2xl border border-beige bg-white p-1.5 focus-within:border-ai/50"
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
                className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={loading || input.trim().length === 0}
                aria-label="送る"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ai text-white transition-opacity disabled:opacity-30"
              >
                <span aria-hidden className="text-lg leading-none">
                  ↑
                </span>
              </button>
            </form>
            <p className="mt-2 text-center text-[10px] leading-relaxed text-sumi/45">
              個人情報や詳しい症状は入力しないでください。商品情報は公式公開情報のみを表示します。
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

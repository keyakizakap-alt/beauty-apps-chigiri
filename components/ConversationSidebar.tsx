"use client";

import Link from "next/link";
import { ChigiriMark } from "./AppSplash";
import ConciergePicker from "./ConciergePicker";
import {
  deriveSnippet,
  type Conversation,
  type StorageState,
} from "@/lib/conversations";

/**
 * 相談ログのサイドバー。
 *
 * 過去の相談を開き直せることを主目的にしている。
 * 会話の見出しだけでは何の話だったか思い出せないため、
 * 直近の返答の抜粋も一緒に出す。
 */
export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  storage,
  onClose,
  conciergeId,
  onSelectConcierge,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  /** 端末への保存が効いているか */
  storage: StorageState;
  /** モバイルの引き出し表示から閉じる（デスクトップでは渡さない） */
  onClose?: () => void;
  /** 選択中の相談先 */
  conciergeId: string;
  onSelectConcierge: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col bg-blushSoft">
      {/* ブランド */}
      <div className="flex items-center gap-3 px-5 py-5">
        <Link href="/" className="shrink-0" aria-label="CHIGIRI Beauty のトップへ">
          <ChigiriMark size={42} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-[0.14em]">CHIGIRI</p>
          <p className="text-[11px] text-sumi/50">AI beauty companion</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-beige bg-white px-2 py-1 text-xs text-sumi/60 lg:hidden"
          >
            閉じる
          </button>
        )}
      </div>

      {/* ブランドと注意書きの間はまとめてスクロールさせる */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
      {/* 約束 */}
      <div className="mx-4 rounded-2xl border border-beige/70 bg-white px-4 py-4">
        <p className="text-[10px] font-medium tracking-[0.18em] text-moriSoft">
          OUR PROMISE
        </p>
        <p className="mt-1.5 text-[15px] font-medium leading-snug">
          買う前に、
          <br />
          今あるものをつなぐ。
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-sumi/60">
          人気順ではなく、あなたの手持ち・予算・続けやすさから一緒に考えます。
        </p>
      </div>

      {/* 相談先 */}
      <ConciergePicker activeId={conciergeId} onSelect={onSelectConcierge} />

      {/* 相談ログ */}
      <div className="mt-6 flex flex-col">
        <div className="flex items-center gap-2 px-5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium tracking-[0.18em] text-moriSoft">
              YOUR CONVERSATIONS
            </p>
            <p className="text-sm font-medium">相談ログ</p>
          </div>
          <button
            type="button"
            onClick={onNew}
            aria-label="新しい相談を始める"
            title="新しい相談を始める"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-beige bg-white text-lg leading-none text-sumi/70 transition-colors hover:border-ai/50 hover:text-ai"
          >
            <span aria-hidden>+</span>
          </button>
        </div>

        {/* 保存できていない場合は黙って進めない。消えることを先に伝える。 */}
        {storage !== "ok" && (
          <div className="mx-4 mt-2 rounded-lg border border-sakura/45 bg-sakuraSoft/60 px-3 py-2.5">
            <p className="text-[11px] font-medium text-sakura">
              ⚠ この端末に保存できていません
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-sumi/70">
              {storage === "unavailable"
                ? "ブラウザが保存領域を使わせない設定になっています（プライベートモードなど）。この画面を閉じると相談内容は消えます。"
                : "保存領域が一杯です。古い相談を削除すると保存できるようになります。"}
            </p>
          </div>
        )}

        <div className="mt-3 px-4 pb-4">
          {conversations.length === 0 ? (
            <p className="px-1 text-[11px] leading-relaxed text-sumi/45">
              まだ相談がありません。話しかけると、ここに記録されます。
              保存先はこの端末の中だけです。
            </p>
          ) : (
            <ul className="space-y-1.5">
              {conversations.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <li key={c.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      aria-current={isActive ? "true" : undefined}
                      className={`w-full rounded-xl border px-3 py-2.5 pr-9 text-left transition-colors ${
                        isActive
                          ? "border-ai/40 bg-white"
                          : "border-transparent bg-white/55 hover:border-beige hover:bg-white"
                      }`}
                    >
                      <p className="truncate text-[13px] font-medium leading-snug">
                        {c.title}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-sumi/50">
                        {deriveSnippet(c)}
                      </p>
                      <p className="mt-1 text-[10px] text-sumi/35">
                        {formatWhen(c.updatedAt)}
                        {c.messages.some((m) => m.rec) && "・ルーティンあり"}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `「${c.title}」を削除します。取り消しはできません。`,
                          )
                        ) {
                          onDelete(c.id);
                        }
                      }}
                      aria-label={`${c.title} を削除`}
                      className="absolute right-2 top-2.5 rounded-md px-1.5 py-0.5 text-xs text-sumi/30 opacity-0 transition-opacity hover:bg-sakuraSoft hover:text-sakura focus:opacity-100 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      </div>

      {/* 導線と注意書き */}
      <div className="border-t border-beige/60 px-5 py-4">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          <Link href="/inventory" className="text-ai underline underline-offset-2">
            手持ちを選ぶ
          </Link>
          <Link href="/result" className="text-ai underline underline-offset-2">
            ルーティン
          </Link>
          <Link href="/ledger" className="text-ai underline underline-offset-2">
            買わずに済んだ記録
          </Link>
        </div>
        <p className="mt-2.5 text-[10px] leading-relaxed text-sumi/45">
          {storage === "ok"
            ? `この端末に${conversations.length}件を保存しています。サーバーへは送っていません。`
            : "保存できていないため、閉じると消えます。"}
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-sumi/45">
          本サービスは医療上の診断・治療を提供するものではありません。
          異常がある場合は使用を中止し、専門家へご相談ください。
        </p>
      </div>
    </div>
  );
}

/** 相対時刻。何日も前のものは日付で出す。 */
function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.floor((Date.now() - then) / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
  });
}

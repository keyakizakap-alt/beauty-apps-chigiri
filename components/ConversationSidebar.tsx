"use client";

import Link from "next/link";
import { ChigiriMark } from "./AppSplash";
import {
  conversationExperts,
  deriveSnippet,
  type Conversation,
  type StorageState,
} from "@/lib/conversations";
import { EXPERTS } from "@/domain/conversation/experts";

/**
 * 相談ログのサイドバー。
 *
 * 過去の相談を開き直せることを主目的にしている。
 * 見出しだけでは何の話だったか思い出せないため、直近の返答の抜粋も出す。
 *
 * レイアウトの要点:
 * - 高さは3段（上：固定、中：伸びてスクロール、下：固定）に分ける。
 *   中段だけが伸縮するようにしないと、件数が増えたときに
 *   一覧の末尾が下段の裏へ隠れて切れる。
 * - 下段は導線のみに絞る。長い注意書きを置くと一覧の場所を奪う。
 */
export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  storage,
  onClose,
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
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-blushSoft">
      {/* 上段：ブランドと新規作成 */}
      <div className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="shrink-0" aria-label="CHIGIRI Beauty のトップへ">
            <ChigiriMark size={36} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold tracking-[0.12em]">CHIGIRI</p>
            <p className="truncate text-[10px] text-sumi/45">
              買う前に、今あるものをつなぐ。
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg border border-beige bg-white px-2.5 py-1 text-xs text-sumi/60 lg:hidden"
            >
              閉じる
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onNew}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-ai/30 bg-white px-3 py-2.5 text-[13px] font-medium text-ai transition-colors hover:bg-ai/5"
        >
          <span aria-hidden className="text-base leading-none">
            +
          </span>
          新しく相談する
        </button>
      </div>

      {/* 中段：一覧。ここだけが伸びてスクロールする。 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="shrink-0 px-4 pb-1.5 text-[11px] font-medium text-sumi/45">
          これまでの相談
          {conversations.length > 0 && `（${conversations.length}）`}
        </p>

        {storage !== "ok" && (
          <div className="mx-3 mb-2 shrink-0 rounded-lg border border-sakura/45 bg-sakuraSoft/60 px-3 py-2">
            <p className="text-[11px] font-medium text-sakura">
              保存できていません
            </p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-sumi/65">
              {storage === "unavailable"
                ? "ブラウザの設定で保存が止められています。閉じると消えます。"
                : "保存領域が一杯です。古い相談を削除してください。"}
            </p>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {conversations.length === 0 ? (
            <p className="px-1 py-2 text-[11px] leading-relaxed text-sumi/45">
              まだ相談がありません。話しかけると、ここに残ります。
            </p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <li key={c.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      aria-current={isActive ? "true" : undefined}
                      className={`w-full rounded-xl px-3 py-2.5 pr-8 text-left transition-colors ${
                        isActive
                          ? "bg-white shadow-[0_1px_2px_rgba(46,42,38,0.06)]"
                          : "hover:bg-white/70"
                      }`}
                    >
                      <div className="flex items-baseline gap-2">
                        <p
                          className={`min-w-0 flex-1 truncate text-[13px] leading-snug ${
                            isActive ? "font-medium" : "text-sumi/85"
                          }`}
                        >
                          {c.title}
                        </p>
                        <span className="shrink-0 text-[10px] text-sumi/35">
                          {formatWhen(c.updatedAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] leading-relaxed text-sumi/45">
                        {deriveSnippet(c)}
                      </p>

                      {/*
                        どの分野の話だったか。
                        見出しと抜粋だけでは、髪の話か肌の話か分からないことがある。
                      */}
                      <p className="mt-1 flex flex-wrap gap-1">
                        {conversationExperts(c).map((id) => (
                          <span
                            key={id}
                            className="rounded-full bg-kinari px-1.5 py-0.5 text-[9px] leading-[1.5] text-sumi/50"
                          >
                            {EXPERTS[id].mark} {EXPERTS[id].label}
                          </span>
                        ))}
                      </p>
                    </button>

                    {/*
                      削除。ホバーでしか出さないと触る端末で押せないため、
                      常に置いたうえで、普段は目立たない濃さにする。
                    */}
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
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-1 text-xs text-sumi/25 transition-colors hover:bg-sakuraSoft hover:text-sakura focus-visible:text-sakura"
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

      {/* 下段：導線のみ。注意書きは置かない。 */}
      <div className="shrink-0 border-t border-beige/60 px-4 py-3">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          <Link href="/inventory" className="text-sumi/60 hover:text-ai">
            手持ちを選ぶ
          </Link>
          <Link href="/result" className="text-sumi/60 hover:text-ai">
            ルーティン
          </Link>
          <Link href="/ledger" className="text-sumi/60 hover:text-ai">
            見送った記録
          </Link>
          <Link href="/privacy" className="text-sumi/60 hover:text-ai">
            データの扱い
          </Link>
        </div>
        <p className="mt-2 text-[10px] text-sumi/35">
          {storage === "ok"
            ? "この端末にだけ保存しています"
            : "保存できていません"}
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

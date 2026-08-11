"use client";

import Link from "next/link";
import ChigiriMark from "./ChigiriMark";
import { CONCIERGES } from "@/domain/concierges";

/**
 * 相談先を選ぶサイドバー。
 * デスクトップでは左に固定、モバイルではシートとして開く。
 */
export default function ConciergeSidebar({
  activeId,
  onSelect,
  ownedCount,
  onClose,
}: {
  activeId: string;
  onSelect: (id: string) => void;
  ownedCount: number;
  /** モバイルのシート表示時のみ渡す */
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto bg-ivory px-5 py-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream shadow-soft">
            <ChigiriMark size={26} title="CHIGIRI Beauty" />
          </span>
          <span>
            <span className="block text-[17px] font-semibold tracking-brand text-forest">
              CHIGIRI
            </span>
            <span className="block text-[11px] text-inkSoft">
              あなたの美容相談室
            </span>
          </span>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="相談先の選択を閉じる"
            className="chigiri-tap rounded-full border border-line px-3 text-sm text-inkSoft"
          >
            閉じる
          </button>
        )}
      </div>

      <section className="chigiri-card p-4">
        <p className="text-[13px] font-semibold text-forest">美容コンシェルジュ</p>
        <h2 className="mt-1.5 text-[15px] font-semibold text-ink">相談先を選ぶ</h2>
        <p className="mt-1.5 text-[11px] leading-relaxed text-inkSoft">
          買う前に、今あるものをつなぐ。人気順ではなく、あなたの手持ち・予算・続けやすさから一緒に考えます。
          いまご相談いただけるのはスキンケアのみです。
        </p>

        <ul className="mt-3 grid grid-cols-2 gap-2">
          {CONCIERGES.map((c) => {
            const active = c.id === activeId;
            const body = (
              <>
                <span
                  aria-hidden
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                    active
                      ? "bg-forest text-cream"
                      : "bg-greige text-inkSoft"
                  }`}
                >
                  {c.initial}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink">
                    {c.name}
                  </span>
                  <span className="block truncate text-[10px] text-inkSoft">
                    {c.area}
                  </span>
                  {!c.ready && (
                    <span className="mt-1 inline-block rounded-full bg-greige px-1.5 py-px text-[9px] text-inkSoft">
                      準備中
                    </span>
                  )}
                </span>
              </>
            );

            return (
              <li key={c.id} className={c.ready ? "" : "col-span-1"}>
                {c.ready ? (
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-pressed={active}
                    className={`chigiri-tap flex h-full w-full items-center gap-2 rounded-soft border px-2.5 py-2 text-left transition-colors ${
                      active
                        ? "border-sageLine bg-sageSoft"
                        : "border-line bg-cream hover:border-sageLine"
                    }`}
                  >
                    {body}
                  </button>
                ) : (
                  <div
                    aria-disabled="true"
                    className="flex h-full min-h-[44px] w-full items-center gap-2 rounded-soft border border-line bg-ivory px-2.5 py-2 opacity-70"
                  >
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-inkSoft">これまでの相談</p>
            <h2 className="mt-0.5 text-[15px] font-semibold text-ink">
              マイアイテム
            </h2>
          </div>
          <span className="rounded-full bg-sageSoft px-2.5 py-1 text-[11px] text-forest">
            {ownedCount}点
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-inkSoft">
          登録した手持ちの化粧品は、このブラウザに保存されます。次に開いたときもそのまま続けられます。
        </p>
        <Link
          href="/database"
          className="mt-3 inline-block text-[12px] text-forest underline underline-offset-4"
        >
          公式情報データベースを見る
        </Link>
      </section>

      <p className="mt-auto rounded-soft border border-line bg-cream px-3 py-3 text-[11px] leading-relaxed text-inkSoft">
        強い痛みや腫れなどがある場合は、製品の使用を止めて医療機関へご相談ください。
        本サービスは医療上の診断や治療を提供するものではありません。
      </p>
    </div>
  );
}

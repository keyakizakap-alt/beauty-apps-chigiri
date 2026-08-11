"use client";

import { CONCIERGES } from "@/domain/concierges";

/**
 * 相談先を選ぶ。
 *
 * 対応していない分野は「準備中」と明示し、押せないようにする。
 * 選べるように見えて何も起きない、という状態を作らないため。
 */
export default function ConciergePicker({
  activeId,
  onSelect,
}: {
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="mx-4 mt-4 shrink-0 rounded-2xl border border-beige/70 bg-white px-4 py-3.5">
      <p className="text-[10px] font-medium tracking-[0.18em] text-moriSoft">
        BEAUTY CONCIERGE
      </p>
      <p className="mt-1.5 text-sm font-medium">相談先を選ぶ</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-sumi/60">
        分野ごとに商品カタログと工程が切り替わります。
      </p>

      <ul className="mt-3 grid grid-cols-2 gap-2">
        {CONCIERGES.map((c) => {
          const active = c.id === activeId;

          const body = (
            <>
              <span
                aria-hidden
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                  active ? "bg-ai text-white" : "bg-kinari text-sumi/55"
                }`}
              >
                {c.initial}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold">
                  {c.name}
                </span>
                <span className="block text-[10px] leading-tight text-sumi/55">
                  {c.area}
                </span>
              </span>
            </>
          );

          return (
            <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-pressed={active}
                  className={`chigiri-tap flex h-full w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors ${
                    active
                      ? "border-moriSoft bg-matchaSoft"
                      : "border-beige bg-white hover:border-moriSoft"
                  }`}
                >
                  {body}
                </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

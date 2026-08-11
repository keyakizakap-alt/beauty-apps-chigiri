"use client";

import { EXPERT_LIST, EXPERTS, type ExpertId } from "@/domain/conversation/experts";

/**
 * 相談する分野を選ぶ。
 *
 * 「別のアプリに移る」のではなく「担当が代わる」だけ、という見え方にする。
 * 会話はそのまま続き、伺った条件も引き継がれるため、
 * 切り替えの重さを感じさせない置き方にしている。
 *
 * 話したことのある分野には印を付ける。
 * どこまで話したかを覚えておくのは利用者の仕事ではない。
 */
export default function ExpertPicker({
  active,
  visited,
  disabled,
  onSelect,
}: {
  active: ExpertId;
  /** これまでに話した分野 */
  visited: ExpertId[];
  disabled?: boolean;
  onSelect: (id: ExpertId) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      <span className="shrink-0 text-[10px] text-sumi/40">相談先</span>
      {EXPERT_LIST.map((e) => {
        const isActive = e.id === active;
        const seen = visited.includes(e.id) && !isActive;
        return (
          <button
            key={e.id}
            type="button"
            disabled={disabled || isActive}
            onClick={() => onSelect(e.id)}
            aria-current={isActive ? "true" : undefined}
            title={e.tagline}
            className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              isActive
                ? "border-ai bg-ai text-white"
                : "border-beige bg-white text-sumi/65 hover:border-ai/50 hover:text-ai disabled:opacity-50"
            }`}
          >
            <span aria-hidden>{e.mark}</span>
            <span>{e.label}</span>
            {seen && (
              <span
                aria-label="この分野は相談済みです"
                className="h-1.5 w-1.5 rounded-full bg-matcha"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** いま話している分野の一行説明 */
export function ExpertTagline({ expert }: { expert: ExpertId }) {
  return (
    <span className="truncate text-[11px] text-sumi/45">
      {EXPERTS[expert].tagline}
    </span>
  );
}

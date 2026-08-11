"use client";

import { EXPERT_LIST, EXPERTS, type ExpertId } from "@/domain/conversation/experts";

/**
 * 相談先を選ぶ。
 *
 * 選ぶのは「担当の切り替え」ではなく「別の相談を開く」操作。
 * 分野ごとに相談は独立していて、いま話している相談には何も起こらない。
 * 戻ってくれば続きがそのまま残っているので、
 * 途中で移ることを迷わせないよう、件数を添えて場所として見せる。
 */
export default function ExpertPicker({
  active,
  countByExpert,
  disabled,
  onSelect,
}: {
  active: ExpertId;
  /** 分野ごとの相談件数 */
  countByExpert: Record<ExpertId, number>;
  disabled?: boolean;
  onSelect: (id: ExpertId) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      <span className="shrink-0 text-[10px] text-sumi/40">相談先</span>
      {EXPERT_LIST.map((e) => {
        const isActive = e.id === active;
        const count = countByExpert[e.id] ?? 0;
        return (
          <button
            key={e.id}
            type="button"
            disabled={disabled || isActive}
            onClick={() => onSelect(e.id)}
            aria-current={isActive ? "true" : undefined}
            title={`${e.tagline}（${count}件の相談）`}
            className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              isActive
                ? "border-ai bg-ai text-white"
                : "border-beige bg-white text-sumi/65 hover:border-ai/50 hover:text-ai disabled:opacity-50"
            }`}
          >
            <span aria-hidden>{e.mark}</span>
            <span>{e.label}</span>
            {count > 0 && (
              <span
                aria-label={`${count}件の相談`}
                className={`rounded-full px-1 text-[9px] leading-[1.6] tabular-nums ${
                  isActive ? "bg-white/25" : "bg-kinari text-sumi/50"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** いま開いている分野の一行説明 */
export function ExpertTagline({ expert }: { expert: ExpertId }) {
  return (
    <span className="truncate text-[11px] text-sumi/45">
      {EXPERTS[expert].tagline}
    </span>
  );
}

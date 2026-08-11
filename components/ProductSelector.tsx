"use client";

import { useMemo, useState } from "react";
import { CATEGORY_LABEL, productsInDomain } from "@/domain/recommendation/catalog";
import { domainConfig } from "@/domain/recommendation/domains";
import type { Category, Domain } from "@/schemas/product";

/**
 * 手持ち商品の選択。
 * 商品カードを大量に並べない方針のため、カテゴリー別の一覧＋検索に絞る。
 */

export default function ProductSelector({
  selectedIds,
  onToggle,
  compact = false,
  domain,
}: {
  selectedIds: string[];
  onToggle: (id: string) => void;
  compact?: boolean;
  /** 表示する分野。相談中の分野の商品だけを出す。 */
  domain: Domain;
}) {
  const pool = useMemo(() => productsInDomain(domain), [domain]);
  const CATEGORIES: Category[] = useMemo(
    () => [...domainConfig(domain).order],
    [domain],
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().normalize("NFKC").toLowerCase();
    return pool.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (q.length === 0) return true;
      return `${p.brand} ${p.name}`.toLowerCase().includes(q);
    });
  }, [query, category, pool]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ブランド名・商品名で探す"
          aria-label="商品を検索"
          className="w-full rounded-lg border border-beige bg-white px-3 py-2 text-sm outline-none focus:border-ai"
        />
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={`chigiri-chip shrink-0 ${category === "all" ? "chigiri-chip-on" : "chigiri-chip-off"}`}
        >
          すべて
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`chigiri-chip shrink-0 ${category === c ? "chigiri-chip-on" : "chigiri-chip-off"}`}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      <p className="text-xs text-sumi/50">
        選択中 {selectedIds.length} 点 / この分野のカタログ {pool.length} 点
      </p>

      <ul
        className={`space-y-1.5 overflow-y-auto pr-1 ${compact ? "max-h-64" : "max-h-[28rem]"}`}
      >
        {filtered.map((p) => {
          const on = selected.has(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onToggle(p.id)}
                aria-pressed={on}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                  on
                    ? "border-ai bg-ai/5"
                    : "border-beige bg-white hover:border-ai/40"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                    on ? "border-ai bg-ai text-white" : "border-beige"
                  }`}
                >
                  {on ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-sumi/60">
                    {p.brand}
                  </span>
                  <span className="block text-sm leading-snug">{p.name}</span>
                  <span className="mt-0.5 block text-xs text-sumi/50">
                    {CATEGORY_LABEL[p.category]} ／ 参考 {p.price.toLocaleString()}円
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="rounded-lg border border-dashed border-beige px-3 py-6 text-center text-sm text-sumi/50">
            該当する商品がカタログにありません。
            <br />
            この分野のカタログは {pool.length} 点です。
          </li>
        )}
      </ul>
    </div>
  );
}

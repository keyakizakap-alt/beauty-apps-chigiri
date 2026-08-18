"use client";

import { useId, useMemo, useState } from "react";
import { CATEGORY_LABEL, productsInDomain } from "@/domain/recommendation/catalog";
import { domainConfig } from "@/domain/recommendation/domains";
import type { Category, Domain } from "@/schemas/product";
import type { CustomItem } from "@/schemas/profile";
import ProductThumb from "./ProductThumb";

/**
 * 手持ち商品の選択。
 * 商品カードを大量に並べない方針のため、カテゴリー別の一覧＋検索に絞る。
 */

export default function ProductSelector({
  selectedIds,
  onToggle,
  compact = false,
  domain,
  customItems = [],
  onAddCustom,
  onRemoveCustom,
}: {
  selectedIds: string[];
  onToggle: (id: string) => void;
  compact?: boolean;
  /** 表示する分野。相談中の分野の商品だけを出す。 */
  domain: Domain;
  /** 利用者が自分で追加した手持ち */
  customItems?: CustomItem[];
  onAddCustom?: (item: CustomItem) => void;
  onRemoveCustom?: (id: string) => void;
}) {
  const formId = useId();
  const [adding, setAdding] = useState(false);
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [cat, setCat] = useState<Category | "">("");
  const [timing, setTiming] = useState<"both" | "morning" | "night">("both");

  const mine = customItems.filter((c) => c.domain === domain);

  const resetForm = () => {
    setBrand("");
    setName("");
    setCat("");
    setTiming("both");
  };

  const submit = () => {
    if (!onAddCustom || name.trim().length === 0 || cat === "") return;
    onAddCustom({
      id: `my-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      domain,
      category: cat,
      brand: brand.trim() || "ブランド未記入",
      name: name.trim(),
      note: "",
      usageTiming:
        timing === "both" ? ["morning", "night"] : [timing],
    });
    resetForm();
    setAdding(false);
  };
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

      {/* 自分で追加する */}
      {onAddCustom && (
        <section className="rounded-xl border border-beige bg-kinari/50 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium">リストに無いものを追加する</p>
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              aria-expanded={adding}
              className="chigiri-tap rounded-full border border-beige bg-white px-3 text-xs text-ai"
            >
              {adding ? "閉じる" : "＋ 追加"}
            </button>
          </div>

          {mine.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {mine.map((c) => {
                const on = selected.has(c.id);
                return (
                  <li key={c.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggle(c.id)}
                      aria-pressed={on}
                      className={`chigiri-tap flex flex-1 items-start gap-2.5 rounded-lg border px-3 py-2 text-left ${
                        on ? "border-ai bg-white" : "border-beige bg-white"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                          on ? "border-ai bg-ai text-white" : "border-beige"
                        }`}
                      >
                        {on ? "\u2713" : ""}
                      </span>
                      <ProductThumb product={c} size={44} className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-sumi/60">
                          {c.brand}
                        </span>
                        <span className="block text-sm leading-snug">{c.name}</span>
                        <span className="mt-0.5 block text-xs text-sumi/50">
                          {CATEGORY_LABEL[c.category]} ／ ご自身で追加
                        </span>
                      </span>
                    </button>
                    {onRemoveCustom && (
                      <button
                        type="button"
                        onClick={() => onRemoveCustom(c.id)}
                        aria-label={`${c.name} を削除`}
                        className="chigiri-tap rounded-lg border border-beige bg-white px-2 text-xs text-sumi/50"
                      >
                        削除
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {adding && (
            <div className="mt-3 space-y-2.5">
              <div>
                <label htmlFor={`${formId}-brand`} className="chigiri-label mb-1 block">
                  ブランド（任意）
                </label>
                <input
                  id={`${formId}-brand`}
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  maxLength={40}
                  className="chigiri-tap w-full rounded-lg border border-beige bg-white px-3 text-sm outline-none focus:border-ai"
                />
              </div>
              <div>
                <label htmlFor={`${formId}-name`} className="chigiri-label mb-1 block">
                  商品名（必須）
                </label>
                <input
                  id={`${formId}-name`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  className="chigiri-tap w-full rounded-lg border border-beige bg-white px-3 text-sm outline-none focus:border-ai"
                />
              </div>
              <div>
                <p className="chigiri-label mb-1">役割（必須）</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCat(c)}
                      aria-pressed={cat === c}
                      className={`chigiri-chip ${cat === c ? "chigiri-chip-on" : "chigiri-chip-off"}`}
                    >
                      {CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="chigiri-label mb-1">使うタイミング</p>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["both", "どちらも"],
                      ["morning", "朝だけ"],
                      ["night", "夜だけ"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setTiming(v)}
                      aria-pressed={timing === v}
                      className={`chigiri-chip ${timing === v ? "chigiri-chip-on" : "chigiri-chip-off"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={name.trim().length === 0 || cat === ""}
                className="chigiri-btn-primary w-full"
              >
                手持ちに追加する
              </button>
              <p className="text-[10px] leading-relaxed text-sumi/50">
                ご自身で追加したものは、朝夜の並べ替えや役割の重なりの確認に使います。
                公式情報を持たないため、成分の読み解きや根拠の表示はできません。
              </p>
            </div>
          )}
        </section>
      )}

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
                <ProductThumb product={p} size={44} className="shrink-0" />
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

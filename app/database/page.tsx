"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChigiriMark } from "@/components/AppSplash";
import { CATEGORY_LABEL, PRODUCTS, claimText } from "@/domain/recommendation/catalog";
import { CONCERN_LABEL } from "@/domain/recommendation/routine-builder";
import { INGREDIENT_LABEL } from "@/domain/recommendation/filters";
import type { Category, ConcernTag, Product } from "@/schemas/product";

/**
 * 公式情報データベース。
 *
 * 件数はすべてカタログから動的に集計する（固定文言で件数を偽装しない）。
 * 公式ページとの突合が済んでいない項目は「未確認」と表示し、推測で埋めない。
 */

const CATEGORIES: Category[] = [
  "cleanser",
  "lotion",
  "serum",
  "moisturizer",
  "sunscreen",
];

const CONCERNS: ConcernTag[] = [
  "dryness",
  "oiliness",
  "pores",
  "dullness",
  "acne_prone",
  "texture",
  "uv_protection",
  "redness",
  "sensitivity",
];

const PRICE_BANDS = [
  { key: "all", label: "すべて", test: () => true },
  { key: "u1000", label: "〜1,000円", test: (p: Product) => p.price < 1000 },
  {
    key: "1000_2500",
    label: "1,000〜2,500円",
    test: (p: Product) => p.price >= 1000 && p.price < 2500,
  },
  {
    key: "2500_4000",
    label: "2,500〜4,000円",
    test: (p: Product) => p.price >= 2500 && p.price < 4000,
  },
  { key: "o4000", label: "4,000円〜", test: (p: Product) => p.price >= 4000 },
] as const;

const ORIGIN_LABEL: Record<string, string> = {
  jp: "日本",
  kr: "韓国",
  other: "その他",
};

export default function DatabasePage() {
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState<"all" | "jp" | "kr">("all");
  const [category, setCategory] = useState<Category | "all">("all");
  const [band, setBand] = useState<string>("all");
  const [concern, setConcern] = useState<ConcernTag | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const brands = useMemo(
    () => [...new Set(PRODUCTS.map((p) => p.brand))].sort(),
    [],
  );

  const counts = useMemo(
    () => ({
      total: PRODUCTS.length,
      jp: PRODUCTS.filter((p) => p.origin === "jp").length,
      kr: PRODUCTS.filter((p) => p.origin === "kr").length,
      verified: PRODUCTS.filter((p) => p.sourceCheckedAt !== null).length,
    }),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().normalize("NFKC").toLowerCase();
    const bandTest =
      PRICE_BANDS.find((b) => b.key === band)?.test ?? (() => true);
    return PRODUCTS.filter((p) => {
      if (origin !== "all" && p.origin !== origin) return false;
      if (category !== "all" && p.category !== category) return false;
      if (concern !== "all" && !p.concernTags.includes(concern)) return false;
      if (!bandTest(p)) return false;
      if (q.length > 0 && !`${p.brand} ${p.name}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [query, origin, category, band, concern]);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-8">
      <nav className="mb-6 flex items-center gap-2 text-xs text-sumi/60">
        <Link href="/" className="flex items-center gap-2 underline-offset-4 hover:underline">
          <ChigiriMark size={20} />
          CHIGIRI Beauty
        </Link>
        <span aria-hidden>/</span>
        <span>公式情報データベース</span>
      </nav>

      <header>
        <p className="chigiri-eyebrow">Official Product Database</p>
        <h1 className="mt-3 text-2xl font-semibold text-ai">
          公式情報データベース
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-sumi/60">
          メーカー・ブランドが公開している情報だけを登録しています。
          確認できていない項目は推測せず「未確認」と表示します。
        </p>
      </header>

      {/* 集計（データから動的に算出） */}
      <dl className="mt-5 grid grid-cols-3 gap-2">
        {[
          { label: "登録件数", value: `${counts.total}点` },
          { label: "日本", value: `${counts.jp}点` },
          { label: "韓国", value: `${counts.kr}点` },
        ].map((m) => (
          <div key={m.label} className="chigiri-card px-3 py-3 text-center">
            <dt className="text-[11px] text-sumi/60">{m.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold text-ai">{m.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 rounded-xl border border-sakura/30 bg-sakuraSoft/60 px-3 py-2.5 text-[11px] leading-relaxed text-sumi">
        公式ページとの突合が完了しているのは {counts.verified} / {counts.total} 点です。
        残りは編集時点の参考データで、価格・URL の再確認が必要です。
      </p>

      {/* 検索・絞り込み */}
      <section className="mt-6 space-y-3">
        <div>
          <label htmlFor="q" className="chigiri-label mb-1.5 block">
            ブランド・商品名で検索
          </label>
          <input
            id="q"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`${brands.slice(0, 3).join("、")} など`}
            className="chigiri-tap w-full rounded-xl border border-beige bg-white px-4 text-sm outline-none focus:border-ai"
          />
        </div>

        <Filter
          label="国"
          value={origin}
          options={[
            { value: "all", label: "すべて" },
            { value: "jp", label: `日本（${counts.jp}）` },
            { value: "kr", label: `韓国（${counts.kr}）` },
          ]}
          onChange={(v) => setOrigin(v as typeof origin)}
        />

        <Filter
          label="カテゴリー"
          value={category}
          options={[
            { value: "all", label: "すべて" },
            ...CATEGORIES.map((c) => ({
              value: c,
              label: CATEGORY_LABEL[c],
            })),
          ]}
          onChange={(v) => setCategory(v as typeof category)}
        />

        <Filter
          label="価格帯"
          value={band}
          options={PRICE_BANDS.map((b) => ({ value: b.key, label: b.label }))}
          onChange={setBand}
        />

        <Filter
          label="悩み"
          value={concern}
          options={[
            { value: "all", label: "すべて" },
            ...CONCERNS.map((c) => ({ value: c, label: CONCERN_LABEL[c] })),
          ]}
          onChange={(v) => setConcern(v as typeof concern)}
        />
      </section>

      <p className="mt-5 text-xs text-sumi/60" aria-live="polite">
        {filtered.length} 件 / {counts.total} 件
      </p>

      <ul className="mt-3 space-y-2.5">
        {filtered.map((p) => {
          const open = openId === p.id;
          return (
            <li key={p.id} className="chigiri-card overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : p.id)}
                aria-expanded={open}
                className="chigiri-tap flex w-full items-start gap-3 p-4 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] text-sumi/60">{p.brand}</span>
                  <span className="block text-sm font-medium leading-snug text-sumi">
                    {p.name}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Tag>{CATEGORY_LABEL[p.category]}</Tag>
                    <Tag>{ORIGIN_LABEL[p.origin]}</Tag>
                    {p.isQuasiDrug && <Tag>医薬部外品</Tag>}
                    <span className="text-xs tabular-nums text-sumi/60">
                      参考 {p.price.toLocaleString()}円
                      {p.volume && ` / ${p.volume}`}
                    </span>
                  </span>
                </span>
                <span aria-hidden className="mt-1 shrink-0 text-sumi/60">
                  {open ? "−" : "＋"}
                </span>
              </button>

              {open && (
                <div className="border-t border-beige px-4 py-4">
                  <Field label="公式に確認できる表現">
                    {p.allowedClaims
                      .map((c) => claimText(c))
                      .filter(Boolean)
                      .join("／") || "未確認"}
                  </Field>

                  <Field label="成分（公開情報に基づく分類）">
                    {p.ingredientTags.length > 0
                      ? p.ingredientTags
                          .map((i) => INGREDIENT_LABEL[i] ?? i)
                          .join("・")
                      : "未確認"}
                  </Field>

                  <Field label="悩みタグ">
                    {p.concernTags.length > 0
                      ? p.concernTags.map((c) => CONCERN_LABEL[c]).join("・")
                      : "未確認"}
                  </Field>

                  <Field label="使用タイミング">
                    {p.usageTiming
                      .map((t) => (t === "morning" ? "朝" : "夜"))
                      .join("・")}
                  </Field>

                  <Field label="出典の確認日">
                    {p.sourceCheckedAt ?? "未確認（編集時点の参考データ）"}
                  </Field>

                  <a
                    href={p.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chigiri-tap mt-3 inline-flex items-center rounded-full border border-forest px-4 text-xs text-ai"
                  >
                    公式サイトを開く
                  </a>

                  <p className="mt-3 text-[11px] leading-relaxed text-sumi/60">
                    配合濃度・処方・使用量は公開されていないため、この情報だけで
                    刺激の強さや効果の程度を判断することはできません。
                  </p>
                </div>
              )}
            </li>
          );
        })}

        {filtered.length === 0 && (
          <li className="rounded-card border border-dashed border-beige px-4 py-10 text-center text-sm text-sumi/60">
            条件に合う商品がありません。絞り込みを緩めてください。
          </li>
        )}
      </ul>
    </main>
  );
}

function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="chigiri-label mb-1.5">{label}</p>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={`chigiri-chip shrink-0 ${
              value === o.value ? "chigiri-chip-on" : "chigiri-chip-off"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-matchaSoft px-2 py-0.5 text-[10px] text-ai">
      {children}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 last:mb-0">
      <p className="chigiri-label">{label}</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-sumi">{children}</p>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { AiMeta, Evidence } from "@/schemas/recommendation";
import type { Product } from "@/schemas/product";
import { purchaseLinksFor } from "@/domain/commerce/purchase-links";

/**
 * 今回のルーティンで使った商品の一覧と、買える場所への導線。
 *
 * 以前はここに「どのモデルを使ったか」「外部へ送ったか」といった
 * 内部の動作を並べていたが、使う人にとっては読む必要のない情報だった。
 * 前面には商品と行き先だけを置き、内部の話は畳んでおく。
 *
 * sourceCheckedAt が null の商品は「公式ページとの突合が未完了」であり、
 * 根拠が確認済みであるかのようには表示しない。
 */

export default function EvidencePanel({
  evidence,
  ai,
  products,
}: {
  evidence: Evidence[];
  ai: AiMeta;
  /** 購入導線を組み立てるための商品情報 */
  products?: Map<string, Product>;
}) {
  const [openDetails, setOpenDetails] = useState(false);

  if (evidence.length === 0) return null;

  return (
    <section className="chigiri-card p-4 sm:p-5">
      <h3 className="text-base font-semibold">今回ご紹介したものはこちら</h3>
      <p className="mt-1 text-xs leading-relaxed text-sumi/55">
        それぞれ、公式に案内されている内容と、購入できる場所をまとめました。
      </p>

      <ul className="mt-3 space-y-2.5">
        {evidence.map((e) => {
          const product = products?.get(e.productId);
          const links = product ? purchaseLinksFor(product) : [];

          return (
            <li
              key={e.productId}
              className="rounded-xl border border-beige/70 bg-white p-3.5"
            >
              <p className="text-xs text-sumi/55">{e.brand}</p>
              <p className="text-[15px] font-medium leading-snug">{e.name}</p>

              {e.claims.length > 0 && (
                <p className="mt-1.5 text-xs leading-relaxed text-sumi/65">
                  {e.claims.join("／")}
                </p>
              )}

              {links.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {links.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                        link.kind === "product_page"
                          ? "bg-ai text-white"
                          : link.shop === "official"
                            ? "border border-ai/40 text-ai hover:bg-ai/5"
                            : "border border-beige bg-kinari/50 text-sumi/75 hover:border-ai/40"
                      }`}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              ) : (
                <a
                  href={e.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-ai underline underline-offset-2"
                >
                  公式サイトを見る
                </a>
              )}

              {e.sourceCheckedAt === null && (
                <p className="mt-2 text-[11px] leading-relaxed text-sumi/45">
                  価格は編集時点の参考です。最新の内容は移動先のページでご確認ください。
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* 内部の動作。読みたい人だけが開けばよい。 */}
      <details
        className="mt-4"
        open={openDetails}
        onToggle={(e) => setOpenDetails((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-xs text-sumi/45 hover:text-sumi/70">
          この提案の作り方
        </summary>
        <div className="mt-2 space-y-1.5 rounded-lg bg-kinari/60 px-3 py-2.5 text-[11px] leading-relaxed text-sumi/60">
          <p>
            使う商品と順番は、お伝えいただいた条件から計算して決めています。
            同じ条件なら、いつでも同じ結果になります。
          </p>
          <p>
            {ai.used
              ? `文章の言い回しには ${ai.model ?? "外部のAI"} を使いました（${ai.latencyMs ?? "-"}ms${
                  ai.cached ? "・前回の結果を再利用" : ""
                }）。文章だけで、選ぶ商品は変わりません。`
              : "文章もこの中で組み立てています。外部へは何も送っていません。"}
          </p>
          <p>
            出典は各ブランドの公開情報です。
            {evidence.filter((e) => e.sourceCheckedAt !== null).length}/
            {evidence.length} 件が公式ページと突合済みです。
          </p>
        </div>
      </details>
    </section>
  );
}

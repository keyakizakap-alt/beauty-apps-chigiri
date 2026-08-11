"use client";

import type { Product } from "@/schemas/product";
import type { Profile } from "@/schemas/profile";
import {
  analyzeFit,
  compareProducts,
  usageHorizon,
  HORIZON_DISCLAIMER,
} from "@/domain/analysis/insight";
import { searchLinksFor } from "@/domain/analysis/reviews";

/**
 * 商品ひとつの読み解き。
 *
 * 「何が入っていて、自分の条件と何が合っていないか」「提案品との違い」
 * 「どのくらい続けて様子を見るか」「利用者の声はどこで見られるか」を、
 * すべて折りたたみの中に置く。初見の情報量は増やさない。
 */
export default function ProductInsight({
  product,
  profile,
  compareWith,
}: {
  product: Product;
  profile: Profile;
  /** 買い足し候補。渡すと違いの比較表を出す */
  compareWith?: Product;
}) {
  const fit = analyzeFit(product, profile);
  const horizon = usageHorizon(product);
  const links = searchLinksFor(product);
  const diffs = compareWith ? compareProducts(product, compareWith) : [];

  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-xs text-ai underline underline-offset-2">
        成分と、自分に合っているかを見る
      </summary>

      <div className="mt-2 space-y-3 rounded-xl bg-kinari/60 px-3 py-3">
        {/* 配合成分 */}
        <section>
          <p className="chigiri-label">配合されている主な成分</p>
          {fit.ingredients.length === 0 ? (
            <p className="mt-1 text-xs text-sumi/60">
              公式情報から成分の分類を確認できていません。
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {fit.ingredients.map((i) => (
                <li key={i.tag} className="text-xs leading-relaxed">
                  <span className="font-medium">{i.label}</span>
                  <span className="text-sumi/65">：{i.role}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 条件との突き合わせ */}
        <section>
          <p className="chigiri-label">あなたの条件との対応</p>
          <ul className="mt-1.5 space-y-1">
            {fit.matches.map((m) => (
              <li key={m.text} className="flex gap-1.5 text-xs leading-relaxed">
                <span aria-hidden className="text-matcha">
                  合
                </span>
                <span className="text-sumi/75">{m.text}</span>
              </li>
            ))}
            {fit.mismatches.map((m) => (
              <li key={m.text} className="flex gap-1.5 text-xs leading-relaxed">
                <span aria-hidden className="text-sakura">
                  差
                </span>
                <span className="text-sumi/75">{m.text}</span>
              </li>
            ))}
            {fit.matches.length === 0 && fit.mismatches.length === 0 && (
              <li className="text-xs text-sumi/60">
                条件がまだ登録されていないため、突き合わせができません。
              </li>
            )}
          </ul>
          <p className="mt-1.5 text-[10px] leading-relaxed text-sumi/50">
            「差」は欠点ではなく、公式情報から確認できなかった、または指定条件と
            異なる点です。配合濃度・処方は公開されていないため、刺激の強さや
            効果の程度をこの情報だけで判断することはできません。
          </p>
        </section>

        {/* 提案品との違い */}
        {diffs.length > 0 && compareWith && (
          <section>
            <p className="chigiri-label">
              提案した「{compareWith.brand} {compareWith.name}」との違い
            </p>
            <div className="mt-1.5 overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-xs">
                <thead>
                  <tr className="text-left text-[10px] text-sumi/55">
                    <th className="py-1 pr-2 font-medium">項目</th>
                    <th className="py-1 pr-2 font-medium">いまお使いのもの</th>
                    <th className="py-1 font-medium">提案したもの</th>
                  </tr>
                </thead>
                <tbody>
                  {diffs.map((d) => (
                    <tr key={d.label} className="border-t border-beige/70 align-top">
                      <td className="py-1.5 pr-2 text-sumi/60">{d.label}</td>
                      <td className="py-1.5 pr-2 leading-relaxed">{d.owned}</td>
                      <td className="py-1.5 leading-relaxed">{d.suggested}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 続けて様子を見る目安 */}
        <section>
          <p className="chigiri-label">続けて様子を見る目安</p>
          <p className="mt-1 text-xs leading-relaxed">
            <span className="font-medium text-mori">{horizon.span}</span>
            <span className="text-sumi/65">　{horizon.basis}。</span>
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-sumi/50">
            {HORIZON_DISCLAIMER}
          </p>
        </section>

        {/* 利用者の声 */}
        <section>
          <p className="chigiri-label">ほかの人の使用感</p>
          <p className="mt-1 text-[11px] leading-relaxed text-sumi/65">
            口コミはこのアプリ内には取り込んでいません。各社の著作物であり、
            公式に提供される API と利用許諾が必要なためです。
            許諾のない取得も、AIによる口コミの生成も行いません。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="chigiri-tap inline-flex items-center rounded-full border border-beige bg-white px-3 text-[11px] text-ai"
              >
                {l.label}
              </a>
            ))}
          </div>
        </section>

        {/* 公式サイト */}
        <section>
          <a
            href={product.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="chigiri-tap inline-flex items-center rounded-full border border-ai px-4 text-xs text-ai"
          >
            {product.brand} の公式サイトを開く
          </a>
          <p className="mt-1.5 text-[10px] leading-relaxed text-sumi/50">
            {product.sourceCheckedAt
              ? `公式ページとの突合済み（${product.sourceCheckedAt}）`
              : "公式ページとの突合は未完了です。価格・仕様は公式サイトでご確認ください。"}
          </p>
        </section>
      </div>
    </details>
  );
}

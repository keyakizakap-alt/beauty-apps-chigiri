import Link from "next/link";
import { PRODUCTS } from "@/domain/recommendation/catalog";
import { ChigiriMark } from "@/components/AppSplash";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-5 py-12">
      <div className="flex items-center gap-3">
        <ChigiriMark size={44} />
        <p className="chigiri-label">CHIGIRI Beauty</p>
      </div>
      <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
        買う前に、
        <br />
        今あるものをつなぐ。
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-sumi/75 sm:text-base">
        手持ちの化粧品を再編成し、本当に不足している商品だけを理由付きで提案する
        美容ルーティン最適化AIです。おすすめを増やすためではなく、
        迷いと無駄買いを減らすために作りました。
      </p>

      <ul className="mt-8 space-y-2.5">
        {[
          "いま持っている商品を、朝と夜の使う順番に並べ直します",
          "役割が重なっている商品と、不足している役割を切り分けます",
          "買い足しは、本当に足りない1点だけを理由付きで提案します",
          "採用理由だけでなく、今回使わない理由も表示します",
        ].map((t) => (
          <li key={t} className="flex gap-2.5 text-sm leading-relaxed">
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ai" />
            <span className="text-sumi/80">{t}</span>
          </li>
        ))}
      </ul>

      <div className="mt-9 flex flex-col gap-2.5 sm:flex-row">
        <Link
          href="/chat"
          className="rounded-xl bg-ai px-5 py-3.5 text-center text-sm font-medium text-white"
        >
          チャットで相談する
        </Link>
        <Link
          href="/onboarding"
          className="rounded-xl border border-beige bg-white px-5 py-3.5 text-center text-sm"
        >
          フォームから入力する
        </Link>
        <Link
          href="/demo"
          className="rounded-xl border border-ai/40 bg-white px-5 py-3.5 text-center text-sm text-ai"
        >
          例で試す（入力不要）
        </Link>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-sumi/50">
        MVP のカタログは日本で購入できる日本・韓国コスメ {PRODUCTS.length} 点
        （洗顔・化粧水・美容液・乳液クリーム・日焼け止め）に限定しています。
        商品情報は公式ブランドサイトを主要な情報源とし、確認できない項目は推測せず未確認として表示します。
      </p>

      <p className="mt-4 rounded-lg border border-beige bg-white px-3 py-3 text-[11px] leading-relaxed text-sumi/70">
        本サービスは美容情報の整理を目的としたもので、医療上の診断や治療を提供するものではありません。
        肌に異常がある場合は使用を中止し、医師や専門家へ相談してください。
      </p>
    </main>
  );
}

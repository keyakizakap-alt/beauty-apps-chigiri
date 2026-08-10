"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { DEMO_SCENARIOS, type DemoScenario } from "@/lib/demo-scenarios";
import { saveProfile } from "@/lib/storage";
import { CATEGORY_LABEL, getProduct } from "@/domain/recommendation/catalog";

/**
 * デモの入口。
 *
 * 手持ちを1点ずつ選ぶところから始めると結論まで時間がかかるため、
 * 代表的な4つの状況をすぐ再現できるようにする。
 *
 * 用意しているのは入力（条件と手持ち）だけで、結果は通常と同じ経路から出す。
 * デモ専用の分岐や、あらかじめ用意した結果は持たない。
 */
export default function DemoPage() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const start = useCallback(
    (scenario: DemoScenario, destination: "result" | "chat") => {
      setBusy(scenario.id);
      // プロファイルを差し替えてから遷移する
      saveProfile(scenario.profile);
      router.push(destination === "result" ? "/result" : "/chat");
    },
    [router],
  );

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-5">
      <nav className="flex flex-wrap items-center gap-x-1.5 text-xs text-sumi/50">
        <Link href="/" className="underline underline-offset-2">
          CHIGIRI Beauty
        </Link>
        <span>/</span>
        <span>デモ</span>
      </nav>

      <header className="chigiri-card p-5">
        <h1 className="text-lg font-semibold">4つの状況をすぐ試す</h1>
        <p className="mt-2 text-sm leading-relaxed text-sumi/75">
          手持ちを選ぶ手間なく、判断の中身を確認できます。
          押すと条件と手持ち商品が入った状態で結果画面に移ります。
        </p>
        <p className="mt-2 text-xs leading-relaxed text-sumi/55">
          用意しているのは入力だけで、結果は通常と同じ計算から出しています。
          デモ用にあらかじめ書いた結論は持っていません。
          条件を変えれば、その場で結論も変わります。
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {DEMO_SCENARIOS.map((s) => (
          <li key={s.id} className="chigiri-card flex flex-col p-4">
            <p className="inline-flex w-fit rounded-full bg-ai/10 px-2.5 py-0.5 text-[11px] font-medium text-ai">
              {s.highlight}
            </p>
            <h2 className="mt-2 text-[15px] font-semibold">{s.title}</h2>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-sumi/70">
              {s.description}
            </p>

            <dl className="mt-3 space-y-1 rounded-lg bg-kinari/70 px-3 py-2.5 text-[11px]">
              <div className="flex gap-2">
                <dt className="shrink-0 text-sumi/55">手持ち</dt>
                <dd className="text-sumi/75">
                  {s.profile.ownedProductIds
                    .map((id) => {
                      const p = getProduct(id);
                      return p ? CATEGORY_LABEL[p.category] : id;
                    })
                    .join("・")}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-sumi/55">予算</dt>
                <dd className="text-sumi/75">
                  {s.profile.budgetYen.toLocaleString()}円 ／ 朝
                  {s.profile.morningMinutes}分・夜{s.profile.nightMinutes}分
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => start(s, "result")}
                className="flex-1 rounded-lg bg-ai px-3 py-2.5 text-xs font-medium text-white disabled:opacity-40"
              >
                {busy === s.id ? "読み込み中…" : "結果を見る"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => start(s, "chat")}
                className="rounded-lg border border-beige bg-white px-3 py-2.5 text-xs disabled:opacity-40"
              >
                会話で
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-sumi/45">
              続けて「{s.followUp}」と入力すると、結論が変わる様子を確認できます。
            </p>
          </li>
        ))}
      </ul>

      <p className="rounded-lg border border-beige bg-white px-3 py-3 text-[11px] leading-relaxed text-sumi/70">
        本サービスは美容情報の整理を目的としたもので、医療上の診断や治療を提供するものではありません。
        肌に異常がある場合は使用を中止し、医師や専門家へ相談してください。
      </p>
    </main>
  );
}

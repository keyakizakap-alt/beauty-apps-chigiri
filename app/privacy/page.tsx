"use client";

import Link from "next/link";
import { usePrivacy } from "@/lib/privacy";
import { useConversations } from "@/lib/conversations";
import { useLedger } from "@/lib/ledger";

/**
 * データの扱いの説明と設定。
 *
 * ここに書いてあることは、実装で担保されている範囲だけにする。
 * 守れない約束（外部事業者の学習方針など）は書かない。
 */
export default function PrivacyPage() {
  const { settings, hydrated, setAllowExternalAi } = usePrivacy();
  const { conversations, clearAll: clearConversations } = useConversations();
  const { clearAll: clearLedger } = useLedger();

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-5">
      <nav className="flex flex-wrap items-center gap-x-1.5 text-xs text-sumi/50">
        <Link href="/" className="underline underline-offset-2">
          CHIGIRI Beauty
        </Link>
        <span>/</span>
        <span>データの扱い</span>
        <Link href="/chat" className="ml-auto text-ai underline underline-offset-2">
          相談に戻る
        </Link>
      </nav>

      <header className="chigiri-card p-5">
        <h1 className="text-lg font-semibold">データの扱い</h1>
        <p className="mt-2 text-sm leading-relaxed text-sumi/75">
          入力した内容を、私たちのサーバーに保存していません。
          機械学習・モデルの改善にも使いません。
          保存していないので、学習に回せるデータそのものがありません。
        </p>
        <p className="mt-2 text-sm leading-relaxed text-sumi/75">
          初期設定では、外部のAIサービスへも
          <span className="font-medium">一切送信していません</span>。
          この状態でも、ルーティンの組み立て・重複の検出・買い足しの判断は
          すべて動きます（もともとAIが判断しているわけではないためです）。
        </p>
      </header>

      {/* 現在の設定 */}
      <section className="chigiri-card p-5">
        <h2 className="text-base font-semibold">いまの設定</h2>

        {!hydrated ? (
          <p className="mt-2 text-sm text-sumi/50">読み込んでいます…</p>
        ) : (
          <>
            <div
              className={`mt-3 rounded-xl px-4 py-3 ${
                settings.allowExternalAi
                  ? "border border-beige bg-kinari/60"
                  : "bg-matchaSoft"
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  settings.allowExternalAi ? "text-sumi/80" : "text-matcha"
                }`}
              >
                {settings.allowExternalAi
                  ? "☁ 外部AIによる説明文の生成を許可しています"
                  : "🔒 端末内のみ — 外部へ何も送信していません"}
              </p>
            </div>

            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-beige bg-white p-3.5 text-sm leading-relaxed">
              <input
                type="checkbox"
                checked={settings.allowExternalAi}
                onChange={(e) => setAllowExternalAi(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-ai"
              />
              <span>
                <span className="font-medium">外部AIサービスで説明文を作る</span>
                <br />
                <span className="text-xs text-sumi/65">
                  推薦の中身は変わりません。文章の言い回しだけが変わります。
                </span>
              </span>
            </label>
          </>
        )}
      </section>

      {/* 何がどこにあるか */}
      <section className="chigiri-card p-5">
        <h2 className="text-base font-semibold">どのデータが、どこにあるか</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[460px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-beige text-left text-sumi/55">
                <th className="py-2 pr-3 font-medium">データ</th>
                <th className="py-2 pr-3 font-medium">保存先</th>
                <th className="py-2 font-medium">外部AIへの送信</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {[
                ["相談ログ（会話の全文）", "この端末のみ", "送らない"],
                ["手持ち商品の一覧", "この端末のみ", "送らない"],
                ["買った／見送った記録", "この端末のみ（同意後）", "送らない"],
                [
                  "アレルギー・避けたい成分",
                  "この端末のみ",
                  "送らない（件数のみ）",
                ],
                ["肌傾向・関心・予算・時間", "この端末のみ", "許可時のみ"],
                ["入力した文章", "この端末のみ", "許可時のみ"],
                ["確定したルーティンの商品ID", "この端末のみ", "許可時のみ"],
                ["クレジットカード情報", "受け取らない", "送らない"],
                ["顔写真", "受け取らない", "送らない"],
              ].map(([what, where, sent]) => (
                <tr key={what} className="border-b border-beige/50">
                  <td className="py-2 pr-3">{what}</td>
                  <td className="py-2 pr-3 text-sumi/70">{where}</td>
                  <td
                    className={`py-2 ${
                      sent === "許可時のみ" ? "text-sumi/70" : "text-matcha"
                    }`}
                  >
                    {sent}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-sumi/55">
          「許可時のみ」は、上の設定を自分でオンにした場合だけ送信されるという意味です。
          初期設定はオフです。アレルギー・避けたい成分は、オンにしても具体名を送りません
          （件数だけを渡し、除外の判定はサーバー内で完結させています）。
        </p>
      </section>

      {/* どう担保しているか */}
      <section className="chigiri-card p-5">
        <h2 className="text-base font-semibold">どうやって担保しているか</h2>
        <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-sumi/75">
          <li>
            <span className="font-medium text-sumi">送信経路をひとつに絞る。</span>{" "}
            外部AIを呼ぶ関数は「許可証」を引数に要求します。許可証は判定モジュールでしか作れないため、
            判定を通らずに送信するコードは書けません（型で縛っています）。
          </li>
          <li>
            <span className="font-medium text-sumi">運用側の停止スイッチ。</span>{" "}
            サーバーの設定が有効になっていない限り、利用者が許可していても送信しません。
            初期状態では無効です。
          </li>
          <li>
            <span className="font-medium text-sumi">ブラウザ側の制限。</span>{" "}
            この画面は外部への通信を許可しない設定（CSP の <code>connect-src &apos;self&apos;</code>）で
            配信しています。ブラウザから第三者へ直接送ることはできません。
          </li>
          <li>
            <span className="font-medium text-sumi">保存しない。</span>{" "}
            サーバーは会話や条件をデータベースに保存しません。
            記録に残すのは、応答時間や成否といった動作の指標だけで、入力本文は含めません。
          </li>
          <li>
            <span className="font-medium text-sumi">消せる。</span>{" "}
            保存先が端末内だけなので、下のボタンで完全に消せます。
          </li>
        </ul>
        <p className="mt-3 rounded-lg bg-kinari px-3 py-2.5 text-[11px] leading-relaxed text-sumi/65">
          正直に書くと、外部AIの利用をオンにした場合、その先の事業者が
          受け取ったデータをどう扱うかを、このアプリから保証することはできません。
          保証できないからこそ、初期設定を「送らない」にしています。
        </p>
      </section>

      {/* 削除 */}
      <section className="chigiri-card p-5">
        <h2 className="text-base font-semibold">保存したデータを消す</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-sumi/60">
          この端末に保存されている相談ログは現在 {conversations.length} 件です。
          削除すると元に戻せません。
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              if (window.confirm("相談ログをすべて削除します。よろしいですか？")) {
                clearConversations();
              }
            }}
            className="rounded-lg border border-sakura/50 px-4 py-2.5 text-xs text-sakura"
          >
            相談ログをすべて削除
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm("買った／見送った記録をすべて削除します。よろしいですか？")
              ) {
                clearLedger();
              }
            }}
            className="rounded-lg border border-sakura/50 px-4 py-2.5 text-xs text-sakura"
          >
            買わずに済んだ記録を削除
          </button>
        </div>
      </section>

      <p className="rounded-lg border border-beige bg-white px-3 py-3 text-[11px] leading-relaxed text-sumi/70">
        本サービスは美容情報の整理を目的としたもので、医療上の診断や治療を提供するものではありません。
        肌に異常がある場合は使用を中止し、医師や専門家へ相談してください。
      </p>
    </main>
  );
}

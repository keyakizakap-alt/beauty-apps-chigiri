"use client";

/**
 * 外部AI（OrcaRouter）を使うかどうかを、最初に一度だけ選んでもらう。
 *
 * 既定値のまま黙って送るのも、黙って送らないと決めるのも避ける。
 * 選ぶまでは送信しない（安全側）が、選択肢は最初に見える場所へ出す。
 *
 * どちらを選んでも、商品の選定・除外・順位づけ・買い足し判断は変わらない。
 * 変わるのは説明文の書き方だけ、という点を明記する。
 */
export default function AiConsentCard({
  onChoose,
}: {
  onChoose: (allowExternalAi: boolean) => void;
}) {
  return (
    <section className="chigiri-card border-ai/25 bg-ai/[0.03] p-4">
      <p className="text-sm font-medium">説明文の作り方を選んでください</p>
      <p className="mt-1.5 text-xs leading-relaxed text-sumi/70">
        どちらを選んでも、<span className="font-medium">結論は変わりません</span>。
        商品の選定・除外・順位づけ・買い足しの判断は、AIではなくサーバー側の
        決定論的な計算が行うためです。変わるのは説明文の書き方だけです。
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChoose(true)}
          className="rounded-xl border border-ai bg-ai px-4 py-3 text-left text-white"
        >
          <span className="text-sm font-medium">☁ AIに文章を任せる</span>
          <span className="mt-1 block text-[11px] leading-relaxed text-white/75">
            OrcaRouter 経由で説明文を生成します。条件と確定済みルーティンが
            外部AIへ送られます（アレルギー等の具体名は送りません）。
          </span>
        </button>

        <button
          type="button"
          onClick={() => onChoose(false)}
          className="rounded-xl border border-matcha/40 bg-matchaSoft/70 px-4 py-3 text-left"
        >
          <span className="text-sm font-medium text-matcha">
            🔒 端末内だけで使う
          </span>
          <span className="mt-1 block text-[11px] leading-relaxed text-sumi/65">
            外部へは何も送りません。説明文はサーバー内で組み立てた
            定型の文章になります。
          </span>
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-sumi/50">
        選ぶまでは送信しません。あとから「条件」や
        <span className="mx-0.5">データの扱い</span>の画面でいつでも変更できます。
      </p>
    </section>
  );
}

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
  current = null,
}: {
  onChoose: (allowExternalAi: boolean) => void;
  /** 現在の設定。null はまだ選んでいない状態。 */
  current?: boolean | null;
}) {
  return (
    <section className="chigiri-card border-ai/25 bg-ai/[0.03] p-4">
      <p className="text-sm font-medium">説明文の作り方</p>
      <p className="mt-1.5 text-xs leading-relaxed text-sumi/70">
        どちらを選んでも、<span className="font-medium">結論は変わりません</span>。
        商品の選定・除外・順位づけ・買い足しの判断は、AIではなくサーバー側の
        決定論的な計算が行うためです。変わるのは説明文の書き方だけです。
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChoose(true)}
          aria-pressed={current === true}
          className={`rounded-xl border px-4 py-3 text-left transition-colors ${
            current === true
              ? "border-ai bg-ai text-white"
              : "border-beige bg-white text-sumi hover:border-ai/50"
          }`}
        >
          <span className="text-sm font-medium">
            ☁ AIに文章を任せる{current === true && "（選択中）"}
          </span>
          <span
            className={`mt-1 block text-[11px] leading-relaxed ${
              current === true ? "text-white/75" : "text-sumi/65"
            }`}
          >
            OrcaRouter 経由で説明文を生成します。条件と確定済みルーティンが
            外部AIへ送られます（アレルギー等の具体名は送りません）。
          </span>
        </button>

        <button
          type="button"
          onClick={() => onChoose(false)}
          aria-pressed={current === false}
          className={`rounded-xl border px-4 py-3 text-left transition-colors ${
            current === false
              ? "border-matcha bg-matchaSoft"
              : "border-beige bg-white hover:border-matcha/50"
          }`}
        >
          <span className="text-sm font-medium text-matcha">
            🔒 端末内だけで使う{current === false && "（選択中）"}
          </span>
          <span className="mt-1 block text-[11px] leading-relaxed text-sumi/65">
            外部へは何も送りません。説明文はサーバー内で組み立てた
            定型の文章になります。
          </span>
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-sumi/50">
        選ぶまでは送信しません。ここでいつでも変更できます。
      </p>
    </section>
  );
}

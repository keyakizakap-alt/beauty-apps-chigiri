"use client";

/**
 * 記録を始める前の同意。
 *
 * 設計書 §18 の方針（明示同意・目的限定・削除可能性・最小保存）を
 * 文章ではなく操作として置く。同意しない場合、記録は一切作らない。
 */
export default function ConsentGate({ onAccept }: { onAccept: () => void }) {
  return (
    <section className="chigiri-card border-ai/25 bg-ai/[0.03] p-4">
      <p className="text-sm font-medium">判断の記録を残しますか</p>
      <ul className="mt-2 space-y-1 text-xs leading-relaxed text-sumi/70">
        <li>・保存先はこの端末の中だけです。サーバーへは送りません。</li>
        <li>
          ・記録するのは「どの役割の商品を、買ったか／見送ったか／続いたか」だけです。
        </li>
        <li>
          ・肌の悩み、アレルギー、手持ちの一覧はこの記録に含めません。
        </li>
        <li>・いつでもまとめて消せます。</li>
      </ul>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onAccept}
          className="rounded-lg bg-ai px-4 py-2.5 text-sm text-white"
        >
          記録を始める
        </button>
        <p className="flex items-center text-xs text-sumi/55">
          同意しなくても、比較と承認はそのまま使えます。
        </p>
      </div>
    </section>
  );
}

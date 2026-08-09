"use client";

import type { AiMeta, Evidence } from "@/schemas/recommendation";

/**
 * 根拠パネル。
 *
 * sourceCheckedAt が null の商品は「公式ページとの突合が未完了」であり、
 * 根拠が確認済みであるかのように表示しない（受け入れ条件）。
 */
export default function EvidencePanel({
  evidence,
  ai,
}: {
  evidence: Evidence[];
  ai: AiMeta;
}) {
  const verifiedCount = evidence.filter((e) => e.sourceCheckedAt !== null).length;

  return (
    <section className="chigiri-card p-4">
      <h3 className="text-base font-semibold">根拠とAIの動作</h3>

      <div className="mt-3 rounded-lg border border-beige/70 bg-kinari/60 px-3 py-2.5">
        <p className="chigiri-label">OrcaRouter が選択したモデル</p>
        {ai.used ? (
          <p className="mt-1 text-sm">
            <span className="font-medium text-ai">{ai.model ?? "（モデル名が応答に含まれていません）"}</span>
            <span className="ml-2 text-xs text-sumi/55">
              要求 {ai.requestedModel ?? "-"} ／ 応答 {ai.latencyMs ?? "-"}ms
              {ai.estimatedTokens != null && ` ／ 約${ai.estimatedTokens}トークン`}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm">
            <span className="font-medium text-sakura">AIによる説明生成は未使用</span>
            <span className="ml-2 text-xs text-sumi/55">
              理由: {ai.fallbackReason ?? "不明"}
            </span>
          </p>
        )}
        <p className="mt-1.5 text-[11px] leading-relaxed text-sumi/50">
          商品の選定・使用順・採用可否はすべてサーバー側の決定論的ロジックで確定しています。
          AIは確定済みの内容を日本語で説明する役割のみを担当し、AIが失敗した場合もルーティンの中身は変わりません。
        </p>
        {ai.jsonValid === false && (
          <p className="mt-1.5 text-[11px] text-sakura">
            AI出力のスキーマ検証に失敗したため、システムが計算した説明文へ切り替えました。
          </p>
        )}
      </div>

      <div className="mt-3">
        <p className="chigiri-label mb-2">
          商品情報の出典（{verifiedCount}/{evidence.length} 件が公式ページ突合済み）
        </p>
        <ul className="space-y-2">
          {evidence.map((e) => (
            <li
              key={e.productId}
              className="rounded-lg border border-beige/70 px-3 py-2"
            >
              <p className="text-sm leading-snug">
                {e.brand} {e.name}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-sumi/60">
                公式に確認できる表現：{e.claims.join("／") || "未確認"}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <a
                  href={e.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-ai underline underline-offset-2"
                >
                  公式サイトを開く
                </a>
                {e.sourceCheckedAt ? (
                  <span className="rounded-full bg-ai/10 px-2 py-0.5 text-[10px] text-ai">
                    突合済み {e.sourceCheckedAt}
                  </span>
                ) : (
                  <span className="rounded-full bg-sakuraSoft px-2 py-0.5 text-[10px] text-sakura">
                    公式突合 未完了（参考データ）
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

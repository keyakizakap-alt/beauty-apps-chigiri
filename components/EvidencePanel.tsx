"use client";

import type { AiMeta, Evidence } from "@/schemas/recommendation";

/**
 * 根拠パネル。
 *
 * sourceCheckedAt が null の商品は「公式ページとの突合が未完了」であり、
 * 根拠が確認済みであるかのように表示しない（受け入れ条件）。
 */
/**
 * 外部送信を行わなかった理由。
 * これらは障害ではなく設定どおりの動作なので、失敗表示と区別する。
 */
const PRIVACY_REASON_TEXT: Record<string, string> = {
  user_local_only:
    "「端末内のみ」設定のため、外部AIへは何も送っていません。説明文はサーバー内で組み立てています。",
  disabled_by_operator:
    "このサービスでは外部AIへの送信を無効にしています。説明文はサーバー内で組み立てています。",
  not_configured:
    "外部AIの接続情報が設定されていないため、説明文はサーバー内で組み立てています。",
};

function isPrivacyReason(reason: string | null): reason is string {
  return reason !== null && reason in PRIVACY_REASON_TEXT;
}

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
        ) : null}

        {ai.used && (
          <p className="mt-1 text-xs text-sumi/60">
            {ai.cached ? (
              <>
                <span className="rounded-full bg-matchaSoft px-2 py-0.5 text-[10px] text-matcha">
                  キャッシュ命中
                </span>{" "}
                同じ条件の応答を再利用したため、この回の追加費用はありません。
              </>
            ) : (
              <>
                この回の推定費用 約
                <span className="font-medium tabular-nums text-sumi/80">
                  {ai.costJpy === null ? "—" : `${ai.costJpy.toFixed(3)}円`}
                </span>
                <span className="ml-1 text-[11px] text-sumi/45">
                  （実モデルの単価表からの推定値）
                </span>
              </>
            )}
          </p>
        )}

        {!ai.used && isPrivacyReason(ai.fallbackReason) ? (
          // 外部へ送らなかった場合は「失敗」ではないので、そのように見せる
          <p className="mt-1 text-sm">
            <span className="font-medium text-matcha">
              🔒 外部AIへは送信していません
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-sumi/60">
              {PRIVACY_REASON_TEXT[ai.fallbackReason]}
            </span>
          </p>
        ) : !ai.used ? (
          <p className="mt-1 text-sm">
            <span className="font-medium text-sakura">AIによる説明生成は未使用</span>
            <span className="ml-2 text-xs text-sumi/55">
              理由: {ai.fallbackReason ?? "不明"}
            </span>
          </p>
        ) : null}
        <p className="mt-1.5 text-[11px] leading-relaxed text-sumi/50">
          商品の選定・使用順・採用可否は、AIではなくサービス側で確定しています。
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
                {e.officialUrl && (
                  <a
                    href={e.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-ai underline underline-offset-2"
                  >
                    公式サイトを開く
                  </a>
                )}
                {e.dataConfidence === "user" ? (
                  <span className="rounded-full bg-kinari px-2 py-0.5 text-[10px] text-sumi/60">
                    ご自身で追加されたもの（公式情報なし）
                  </span>
                ) : e.sourceCheckedAt ? (
                  <>
                    <span className="rounded-full bg-ai/10 px-2 py-0.5 text-[10px] text-ai">
                      突合済み {e.sourceCheckedAt}
                    </span>
                    {e.priceCheckedAt === null && (
                      <span className="rounded-full bg-kinari px-2 py-0.5 text-[10px] text-sumi/60">
                        価格は参考値（公式に価格の表示なし）
                      </span>
                    )}
                  </>
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

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

/**
 * 運用状況の確認画面。
 *
 * OrcaRouter への疎通、当日のAI利用費、キャッシュ命中率、
 * コマースの KPI をまとめて見る。
 *
 * 疎通確認は実際に1回だけ問い合わせを送る（＝課金が発生する）ため、
 * 自動では実行せず、押したときだけ動かす。
 */

type Ops = {
  externalAi: { enabledByOperator: boolean; dailyBudgetJpy: number };
  cost: {
    spentJpy: number;
    budgetJpy: number;
    remainingJpy: number;
    calls: number;
    cachedCalls: number;
    savedByCacheJpy: number;
    exceeded: boolean;
  };
  llm: {
    calls: number;
    okRate: number | null;
    fallbackCount: number;
    medianLatencyMs: number | null;
    cacheHitRate: number | null;
  };
  commerce: Record<string, number | null>;
};

type Probe = {
  reachable: boolean;
  operatorEnabled: boolean;
  configured: boolean;
  requestedModel?: string;
  selectedModel?: string | null;
  latencyMs?: number;
  estimatedTokens?: number | null;
  estimatedCostJpy?: number | null;
  jsonValid?: boolean;
  reason?: string;
  message?: string;
  authOk?: boolean;
  availableModels?: string[];
  detail?: string;
};

export default function OpsPage() {
  const [ops, setOps] = useState<Ops | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOps = useCallback(async () => {
    try {
      const res = await fetch("/api/ops");
      if (!res.ok) throw new Error(`サーバーエラー (${res.status})`);
      setOps(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    }
  }, []);

  useEffect(() => {
    void loadOps();
  }, [loadOps]);

  const runProbe = useCallback(async () => {
    setProbing(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/orcarouter", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `サーバーエラー (${res.status})`);
      setProbe(json);
      await loadOps();
    } catch (e) {
      setError(e instanceof Error ? e.message : "不明なエラー");
    } finally {
      setProbing(false);
    }
  }, [loadOps]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-5">
      <nav className="flex flex-wrap items-center gap-x-1.5 text-xs text-sumi/50">
        <Link href="/" className="underline underline-offset-2">
          CHIGIRI Beauty
        </Link>
        <span>/</span>
        <span>運用状況</span>
      </nav>

      {/* OrcaRouter */}
      <section className="chigiri-card p-5">
        <h1 className="text-lg font-semibold">OrcaRouter</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-sumi/65">
          自然文の構造化はコスト優先ティア、ルーティンの説明は品質優先ティアで
          呼び分けています。品質優先が一時的に落ちている場合は、コスト優先へ
          降格して1度だけ再試行します。
        </p>

        <button
          type="button"
          onClick={() => void runProbe()}
          disabled={probing}
          className="mt-3 rounded-lg bg-ai px-4 py-2.5 text-sm text-white disabled:opacity-40"
        >
          {probing ? "確認しています…" : "疎通を確認する"}
        </button>
        <p className="mt-1.5 text-[11px] text-sumi/45">
          固定の短文を1回だけ送ります。利用者のデータは含みません。
        </p>

        {probe && (
          <div
            className={`mt-3 rounded-xl px-4 py-3 ${
              probe.reachable
                ? "bg-matchaSoft"
                : "border border-sakura/40 bg-sakuraSoft/50"
            }`}
          >
            <p
              className={`text-sm font-medium ${
                probe.reachable ? "text-matcha" : "text-sakura"
              }`}
            >
              {probe.reachable ? "接続できました" : "接続できませんでした"}
            </p>
            {probe.reachable ? (
              <dl className="mt-2 space-y-0.5 text-xs">
                <Row label="要求モデル">{probe.requestedModel}</Row>
                <Row label="選択されたモデル">
                  {probe.selectedModel ?? "（応答に含まれず）"}
                </Row>
                <Row label="応答時間">{probe.latencyMs}ms</Row>
                <Row label="トークン">{probe.estimatedTokens ?? "—"}</Row>
                <Row label="推定費用">
                  {probe.estimatedCostJpy === null ||
                  probe.estimatedCostJpy === undefined
                    ? "—"
                    : `約${probe.estimatedCostJpy.toFixed(4)}円`}
                </Row>
                <Row label="構造化出力">
                  {probe.jsonValid ? "JSON を取得" : "JSON として解釈できず"}
                </Row>
                {probe.availableModels && probe.availableModels.length > 0 && (
                  <Row label="利用可能なモデル">
                    {probe.availableModels.length}件
                  </Row>
                )}
              </dl>
            ) : (
              <div className="mt-1 space-y-1.5 text-xs leading-relaxed text-sumi/70">
                <p>{probe.message}</p>
                <p className="text-[11px] text-sumi/60">
                  {probe.authOk
                    ? "認証は通っています。モデル指定か生成側の問題の可能性があります。"
                    : "認証の段階で失敗しています。APIキーと接続先を確認してください。"}
                </p>
                {probe.detail && (
                  <p className="break-all rounded bg-white/70 px-2 py-1 font-mono text-[10px] text-sumi/60">
                    {probe.detail}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {error && (
        <p className="chigiri-card px-4 py-3 text-sm text-sakura">{error}</p>
      )}

      {/* 費用 */}
      {ops && (
        <>
          <section className="chigiri-card p-5">
            <h2 className="text-base font-semibold">本日のAI利用費</h2>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {ops.cost.spentJpy.toFixed(3)}
              <span className="ml-1 text-sm font-normal text-sumi/55">
                / {ops.cost.budgetJpy.toLocaleString()}円
              </span>
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-beige">
              <div
                className={`h-full ${ops.cost.exceeded ? "bg-sakura" : "bg-ai"}`}
                style={{
                  width: `${Math.min(100, (ops.cost.spentJpy / Math.max(1, ops.cost.budgetJpy)) * 100)}%`,
                }}
              />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
              <Row label="呼び出し">{ops.cost.calls}回</Row>
              <Row label="キャッシュ命中">{ops.cost.cachedCalls}回</Row>
              <Row label="命中で節約">
                約{ops.cost.savedByCacheJpy.toFixed(3)}円
              </Row>
              <Row label="命中率">
                {ops.llm.cacheHitRate === null
                  ? "—"
                  : `${Math.round(ops.llm.cacheHitRate * 100)}%`}
              </Row>
              <Row label="中央応答時間">
                {ops.llm.medianLatencyMs === null
                  ? "—"
                  : `${ops.llm.medianLatencyMs}ms`}
              </Row>
              <Row label="決定論へ切替">{ops.llm.fallbackCount}回</Row>
            </dl>
            {ops.cost.exceeded && (
              <p className="mt-2 rounded-lg bg-sakuraSoft/60 px-3 py-2 text-[11px] leading-relaxed text-sumi/75">
                上限に達したため、外部AIの呼び出しを止めています。
                結果は決定論的な説明で表示され続けます。
              </p>
            )}
          </section>

          <section className="chigiri-card p-5">
            <h2 className="text-base font-semibold">コマースKPI</h2>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
              <Row label="引き継ぎ発行">{ops.commerce.handoffIssued}</Row>
              <Row label="承認を阻止">{ops.commerce.handoffBlocked}</Row>
              <Row label="実際に遷移">{ops.commerce.redirected}</Row>
              <Row label="買わない選択">{ops.commerce.declined}</Row>
              <Row label="トークン拒否">{ops.commerce.rejected}</Row>
              <Row label="承認率">
                {ops.commerce.approvalRate === null
                  ? "—"
                  : `${Math.round((ops.commerce.approvalRate as number) * 100)}%`}
              </Row>
            </dl>
            <p className="mt-2 text-[11px] leading-relaxed text-sumi/50">
              記録しているのは「何が起きたか」だけで、誰が行ったかは残していません。
            </p>
          </section>
        </>
      )}
    </main>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-beige/40 py-0.5">
      <dt className="shrink-0 text-sumi/55">{label}</dt>
      <dd className="text-right tabular-nums text-sumi/80">{children}</dd>
    </div>
  );
}

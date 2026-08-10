import { NextResponse } from "next/server";
import { budgetStatus, dailyBudgetJpy } from "@/server/llm-cost";
import { recentLlmLogs } from "@/server/logger";
import { commerceKpi, recentCommerceEvents } from "@/server/commerce-log";
import { externalAiEnabledByOperator } from "@/server/ai-policy";
import { checkRateLimit, clientKey, RATE_LIMITS } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ops
 * 運用指標（設計書 §17 の KPI）。
 *
 * 個人に紐づく値は返さない。返すのは集計と、直近の呼び出しの
 * 動作指標（モデル・応答時間・成否）だけで、入力本文は含まない。
 */
export async function GET(req: Request) {
  const limit = checkRateLimit(clientKey(req, "ops"), RATE_LIMITS.recommend);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "リクエストが多すぎます" },
      { status: 429 },
    );
  }

  const budget = budgetStatus();
  const logs = recentLlmLogs();

  const llmCalls = logs.length;
  const okCalls = logs.filter((l) => l.ok).length;
  const fallbacks = logs.filter((l) => l.fallback).length;
  const latencies = logs
    .filter((l) => l.ok && l.latencyMs > 0)
    .map((l) => l.latencyMs)
    .sort((a, b) => a - b);

  return NextResponse.json({
    externalAi: {
      enabledByOperator: externalAiEnabledByOperator(),
      dailyBudgetJpy: dailyBudgetJpy(),
    },
    cost: budget,
    llm: {
      calls: llmCalls,
      okRate: llmCalls === 0 ? null : Math.round((okCalls / llmCalls) * 100) / 100,
      fallbackCount: fallbacks,
      // フォールバックは「失敗」ではなく決定論的応答への切り替え。
      // 100% でも結果は表示できている。
      medianLatencyMs: latencies.length
        ? latencies[Math.floor(latencies.length / 2)]
        : null,
      cacheHitRate:
        budget.calls === 0
          ? null
          : Math.round((budget.cachedCalls / budget.calls) * 100) / 100,
    },
    commerce: commerceKpi(),
    recentCommerceEvents: recentCommerceEvents().slice(-20),
  });
}

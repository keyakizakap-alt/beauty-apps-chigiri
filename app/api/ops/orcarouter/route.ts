import { NextResponse } from "next/server";
import {
  callOrcaRouter,
  isConfigured,
  listModels,
  parseJsonLoose,
} from "@/server/orcarouter";
import {
  decideExternalAi,
  DENIAL_MESSAGE,
  externalAiEnabledByOperator,
} from "@/server/ai-policy";
import { budgetStatus } from "@/server/llm-cost";
import { checkRateLimit, clientKey, RATE_LIMITS } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ops/orcarouter
 * OrcaRouter への疎通確認。
 *
 * 実際に1回だけ最小の問い合わせを送り、接続・認証・モデル選択・
 * 構造化出力・費用計算が通ることを確かめる。
 *
 * 送る内容は固定の短文で、利用者のデータを一切含めない。
 * そのため、この確認のためにプライバシー設定を変える必要がない。
 */

const PROBE_SYSTEM =
  "あなたは接続確認用の応答器です。必ず {\"ok\":true} という JSON だけを返してください。";
const PROBE_USER = "接続確認";

export async function POST(req: Request) {
  const limit = checkRateLimit(clientKey(req, "probe"), RATE_LIMITS.probe);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "確認の実行が多すぎます。少し時間をおいてください。" },
      { status: 429 },
    );
  }

  const configured = isConfigured();
  const operatorEnabled = externalAiEnabledByOperator();

  // 疎通確認は運用者の操作なので、利用者設定ではなく運用側の可否で判断する
  const decision = decideExternalAi({ userAllows: true, configured });

  if (!decision.allowed) {
    return NextResponse.json({
      reachable: false,
      operatorEnabled,
      configured,
      reason: decision.reason,
      message: DENIAL_MESSAGE[decision.reason],
      budget: budgetStatus(),
    });
  }

  // 1段目: 認証と接続だけを確かめる（生成しないので費用ゼロ）。
  // ここで落ちれば「キーの問題」、通れば「モデル指定や生成の問題」と切り分けられる。
  const auth = await listModels(decision.grant);

  const started = Date.now();
  const result = await callOrcaRouter({
    task: "short_description",
    tier: "cheap",
    grant: decision.grant,
    system: PROBE_SYSTEM,
    user: PROBE_USER,
    json: true,
    temperature: 0,
    maxTokens: 32,
  });

  if (!result.ok) {
    return NextResponse.json({
      reachable: false,
      operatorEnabled,
      configured,
      /** 認証だけは通ったか（キーの問題かモデルの問題かの切り分け） */
      authOk: auth.ok,
      availableModels: auth.ok ? auth.models.slice(0, 20) : [],
      reason: result.kind,
      message: result.error,
      /** 提供元が返した本文の冒頭。原因の特定に使う。 */
      detail: result.detail ?? (auth.ok ? undefined : auth.detail),
      latencyMs: Date.now() - started,
      budget: budgetStatus(),
    });
  }

  return NextResponse.json({
    reachable: true,
    operatorEnabled,
    configured,
    authOk: auth.ok,
    availableModels: auth.ok ? auth.models.slice(0, 20) : [],
    requestedModel: result.meta.requestedModel,
    selectedModel: result.meta.selectedModel,
    latencyMs: result.meta.latencyMs,
    estimatedTokens: result.meta.estimatedTokens,
    estimatedCostJpy: result.meta.costJpy,
    cached: result.meta.cached,
    /** 構造化出力（JSON）が要求どおり返ってきたか */
    jsonValid: parseJsonLoose(result.content) !== null,
    budget: budgetStatus(),
  });
}

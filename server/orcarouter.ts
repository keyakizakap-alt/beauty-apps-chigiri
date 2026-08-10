import "server-only";
import { z } from "zod";
import { logLlmCall, type LlmTaskType } from "./logger";
import { externalAiEnabledByOperator, type ExternalAiGrant } from "./ai-policy";
import {
  cacheKey,
  estimateCost,
  readCache,
  recordSpend,
  writeCache,
  type CostEstimate,
} from "./llm-cost";

/**
 * OrcaRouter クライアント（OpenAI 互換 API）。
 *
 * - サーバー側からのみ呼び出す。API キーはクライアントに渡さない。
 * - model="auto" を基本とし、実際に選択されたモデルをレスポンスから取得する。
 * - 失敗しても例外を投げず、常に結果オブジェクトを返す（呼び出し側が
 *   決定論的フォールバックへ切り替えられるようにするため）。
 */

/**
 * 接続先とタイムアウトは呼び出しのたびに読む。
 * モジュール読み込み時に固定すると、環境変数を差し替えても反映されず、
 * 疎通確認やテストで実際の経路を通せなくなるため。
 */
function baseUrl(): string {
  const raw = process.env.ORCAROUTER_BASE_URL ?? "https://api.orcarouter.com/v1";
  return raw.replace(/\/+$/, "");
}

function timeoutMs(): number {
  const v = Number(process.env.ORCAROUTER_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 20000;
}

export type ModelTier = "cheap" | "quality";

function modelFor(tier: ModelTier): string {
  const env =
    tier === "cheap"
      ? process.env.ORCAROUTER_MODEL_CHEAP
      : process.env.ORCAROUTER_MODEL_QUALITY;
  return env && env.length > 0 ? env : "auto";
}

export function isConfigured(): boolean {
  return Boolean(process.env.ORCAROUTER_API_KEY);
}

const ChatCompletionSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

export type LlmMeta = {
  requestId: string | null;
  requestedModel: string;
  selectedModel: string | null;
  latencyMs: number;
  estimatedTokens: number | null;
  /** 推定費用(円)。キャッシュ命中時は 0。 */
  costJpy: number | null;
  /** 同じ問い合わせをキャッシュから返したか */
  cached: boolean;
};

/** 失敗の種類。再試行してよいかを、文字列の照合ではなく型で判断するために持つ。 */
export type LlmFailureKind =
  | "disabled"
  | "not_configured"
  | "http_client"   // 4xx。設定の誤りなので再試行しない
  | "http_server"   // 5xx。一時的な可能性があるので再試行してよい
  | "rate_limited"  // 429
  | "timeout"
  | "network"
  | "bad_response";

export type LlmResult =
  | { ok: true; content: string; meta: LlmMeta }
  | {
      ok: false;
      error: string;
      kind: LlmFailureKind;
      /**
       * 提供元が返した本文の冒頭（診断用、最大200字）。
       * 401 なのか、モデル名が不正なのか、残高不足なのかを切り分けるために持つ。
       * 利用者向けの画面には出さず、運用者向けの疎通確認だけで使う。
       */
      detail?: string;
      meta: LlmMeta;
    };

/** 一時的な障害か（再試行・ティア降格の対象か） */
export function isRetryable(kind: LlmFailureKind): boolean {
  return kind === "http_server" || kind === "rate_limited" || kind === "timeout" || kind === "network";
}

export type CallOptions = {
  task: LlmTaskType;
  tier: ModelTier;
  system: string;
  user: string;
  /** JSON 出力を要求する（OpenAI 互換の response_format） */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /**
   * 外部送信の許可証。
   * ai-policy.decideExternalAi() でしか作れないため、
   * ポリシー判定を通らずにこの関数を呼ぶことはできない。
   */
  grant: ExternalAiGrant;
};

export async function callOrcaRouter(opts: CallOptions): Promise<LlmResult> {
  const requestedModel = modelFor(opts.tier);
  const started = Date.now();

  // 多層防御: 許可証を持っていても、運用側のキルスイッチが優先する。
  // 環境変数を切り替えた直後に、発行済みの許可証で送信されないようにする。
  if (!externalAiEnabledByOperator()) {
    const meta: LlmMeta = {
      requestId: null,
      requestedModel,
      selectedModel: null,
      latencyMs: 0,
      estimatedTokens: null,
      costJpy: null,
      cached: false,
    };
    logLlmCall({
      requestId: null,
      task: opts.task,
      requestedModel,
      selectedModel: null,
      latencyMs: 0,
      ok: false,
      jsonValid: null,
      fallback: true,
      fallbackReason: "disabled_by_operator",
      estimatedTokens: null,
    });
    return { ok: false, error: "外部AIへの送信は無効化されています", kind: "disabled", meta };
  }

  const apiKey = process.env.ORCAROUTER_API_KEY;
  if (!apiKey) {
    const meta: LlmMeta = {
      requestId: null,
      requestedModel,
      selectedModel: null,
      latencyMs: 0,
      estimatedTokens: null,
      costJpy: null,
      cached: false,
    };
    logLlmCall({
      requestId: null,
      task: opts.task,
      requestedModel,
      selectedModel: null,
      latencyMs: 0,
      ok: false,
      jsonValid: null,
      fallback: true,
      fallbackReason: "not_configured",
      estimatedTokens: null,
    });
    return { ok: false, error: "ORCAROUTER_API_KEY が設定されていません", kind: "not_configured", meta };
  }

  // 同じ問い合わせを二度課金しない。
  // 商品選定が決定論的なため、同じ条件からは同じプロンプトが生成され、
  // デモや再計算の繰り返しではほぼ確実に命中する。
  const key = cacheKey({ tier: opts.tier, system: opts.system, user: opts.user });
  const cached = readCache(key);
  if (cached) {
    recordSpend(0, { cached: true });
    logLlmCall({
      requestId: null,
      task: opts.task,
      requestedModel,
      selectedModel: cached.model,
      latencyMs: 0,
      ok: true,
      jsonValid: null,
      fallback: false,
      fallbackReason: null,
      estimatedTokens: null,
    });
    return {
      ok: true,
      content: cached.content,
      meta: {
        requestId: null,
        requestedModel,
        selectedModel: cached.model,
        latencyMs: 0,
        estimatedTokens: null,
        costJpy: 0,
        cached: true,
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: requestedModel,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 1200,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - started;

    // OrcaRouter が実際に選んだモデルはヘッダーまたはボディから取得する
    const headerModel =
      res.headers.get("x-orcarouter-model") ??
      res.headers.get("x-model") ??
      res.headers.get("openai-model");
    const requestId =
      res.headers.get("x-orcarouter-request-id") ??
      res.headers.get("x-request-id") ??
      null;

    if (!res.ok) {
      // 診断のために本文を読む。失敗しても握りつぶす。
      const detail = await res
        .text()
        .then((t) => t.slice(0, 200))
        .catch(() => undefined);

      const meta: LlmMeta = {
        requestId,
        requestedModel,
        selectedModel: headerModel,
        latencyMs,
        estimatedTokens: null,
        costJpy: null,
        cached: false,
      };
      logLlmCall({
        requestId,
        task: opts.task,
        requestedModel,
        selectedModel: headerModel,
        latencyMs,
        ok: false,
        jsonValid: null,
        fallback: true,
        fallbackReason: `http_${res.status}`,
        estimatedTokens: null,
      });
      return {
        ok: false,
        error: `OrcaRouter HTTP ${res.status}`,
        kind:
          res.status === 429
            ? "rate_limited"
            : res.status >= 500
              ? "http_server"
              : "http_client",
        detail,
        meta,
      };
    }

    const raw: unknown = await res.json();
    const parsed = ChatCompletionSchema.safeParse(raw);
    if (!parsed.success) {
      const meta: LlmMeta = {
        requestId,
        requestedModel,
        selectedModel: headerModel,
        latencyMs,
        estimatedTokens: null,
        costJpy: null,
        cached: false,
      };
      logLlmCall({
        requestId,
        task: opts.task,
        requestedModel,
        selectedModel: headerModel,
        latencyMs,
        ok: false,
        jsonValid: false,
        fallback: true,
        fallbackReason: "unexpected_response_shape",
        estimatedTokens: null,
      });
      return { ok: false, error: "OrcaRouter の応答形式が想定と異なります", kind: "bad_response", meta };
    }

    const content = parsed.data.choices[0]?.message.content ?? "";
    const selectedModel = headerModel ?? parsed.data.model ?? null;
    const estimatedTokens = parsed.data.usage?.total_tokens ?? null;

    const cost: CostEstimate = estimateCost({
      model: selectedModel,
      tier: opts.tier,
      promptTokens: parsed.data.usage?.prompt_tokens ?? null,
      completionTokens: parsed.data.usage?.completion_tokens ?? null,
      totalTokens: estimatedTokens,
    });

    const meta: LlmMeta = {
      requestId: requestId ?? parsed.data.id ?? null,
      requestedModel,
      selectedModel,
      latencyMs,
      estimatedTokens,
      costJpy: cost.jpy,
      cached: false,
    };

    if (content.trim().length === 0) {
      logLlmCall({
        requestId: meta.requestId,
        task: opts.task,
        requestedModel,
        selectedModel,
        latencyMs,
        ok: false,
        jsonValid: null,
        fallback: true,
        fallbackReason: "empty_content",
        estimatedTokens,
      });
      return { ok: false, error: "AI の応答が空でした", kind: "bad_response", meta };
    }

    recordSpend(cost.jpy, { cached: false });
    writeCache(key, { content, model: selectedModel, jpy: cost.jpy });

    logLlmCall({
      requestId: meta.requestId,
      task: opts.task,
      requestedModel,
      selectedModel,
      latencyMs,
      ok: true,
      jsonValid: null,
      fallback: false,
      fallbackReason: null,
      estimatedTokens,
    });

    return { ok: true, content, meta };
  } catch (e) {
    const latencyMs = Date.now() - started;
    const reason =
      e instanceof Error && e.name === "AbortError" ? "timeout" : "network_error";
    const meta: LlmMeta = {
      requestId: null,
      requestedModel,
      selectedModel: null,
      latencyMs,
      estimatedTokens: null,
      costJpy: null,
      cached: false,
    };
    logLlmCall({
      requestId: null,
      task: opts.task,
      requestedModel,
      selectedModel: null,
      latencyMs,
      ok: false,
      jsonValid: null,
      fallback: true,
      fallbackReason: reason,
      estimatedTokens: null,
    });
    return {
      ok: false,
      error: `OrcaRouter 呼び出しに失敗しました (${reason})`,
      kind: reason === "timeout" ? "timeout" : "network",
      meta,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** ```json ... ``` のようなコードフェンスを取り除いて JSON.parse する */
export function parseJsonLoose(content: string): unknown | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * ティア降格つきの呼び出し。
 *
 * OrcaRouter を「モデルを1つ選ぶ窓口」ではなく、
 * 品質と可用性を切り替える経路として使う。
 *
 *   1. まず指定ティアで呼ぶ
 *   2. 一時的な失敗（5xx・429・タイムアウト・ネットワーク）なら、
 *      下位ティアでもう一度だけ試す
 *   3. それも駄目なら失敗を返し、呼び出し側が決定論的応答へ切り替える
 *
 * 4xx は設定の誤りなので再試行しない（同じ結果を繰り返し課金しないため）。
 */
export type ResilientResult = LlmResult & {
  /** 実際に応答を返したティア */
  servedTier: ModelTier;
  /** 送信を試みた回数 */
  attempts: number;
};

export async function callWithTierFallback(
  opts: CallOptions & { fallbackTier?: ModelTier },
): Promise<ResilientResult> {
  const first = await callOrcaRouter(opts);
  if (first.ok || !opts.fallbackTier || opts.fallbackTier === opts.tier) {
    return { ...first, servedTier: opts.tier, attempts: 1 };
  }

  if (!isRetryable(first.kind)) {
    return { ...first, servedTier: opts.tier, attempts: 1 };
  }

  const second = await callOrcaRouter({ ...opts, tier: opts.fallbackTier });
  return {
    ...second,
    servedTier: second.ok ? opts.fallbackTier : opts.tier,
    attempts: 2,
  };
}

/**
 * 利用可能なモデルの一覧を取得する（OpenAI 互換の /models）。
 *
 * 生成を伴わないため、認証と接続だけを費用ゼロで確かめられる。
 * 疎通確認で「キーが通っているのか、モデル指定が悪いのか」を切り分けるために使う。
 */
export type ModelsResult =
  | { ok: true; models: string[]; latencyMs: number }
  | { ok: false; error: string; status: number | null; detail?: string; latencyMs: number };

export async function listModels(_grant: ExternalAiGrant): Promise<ModelsResult> {
  const started = Date.now();

  if (!externalAiEnabledByOperator()) {
    return {
      ok: false,
      error: "外部AIへの送信は無効化されています",
      status: null,
      latencyMs: 0,
    };
  }

  const apiKey = process.env.ORCAROUTER_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "ORCAROUTER_API_KEY が設定されていません",
      status: null,
      latencyMs: 0,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const res = await fetch(`${baseUrl()}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;

    if (!res.ok) {
      const detail = await res.text().then((t) => t.slice(0, 200)).catch(() => undefined);
      return {
        ok: false,
        error: `HTTP ${res.status}`,
        status: res.status,
        detail,
        latencyMs,
      };
    }

    const raw: unknown = await res.json();
    const parsed = z
      .object({ data: z.array(z.object({ id: z.string() })) })
      .safeParse(raw);

    return parsed.success
      ? { ok: true, models: parsed.data.data.map((m) => m.id), latencyMs }
      : { ok: true, models: [], latencyMs };
  } catch (e) {
    const latencyMs = Date.now() - started;
    const reason =
      e instanceof Error && e.name === "AbortError" ? "timeout" : "network_error";
    return { ok: false, error: reason, status: null, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

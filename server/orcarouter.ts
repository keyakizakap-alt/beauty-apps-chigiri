import "server-only";
import { z } from "zod";
import { logLlmCall, type LlmTaskType } from "./logger";

/**
 * OrcaRouter クライアント（OpenAI 互換 API）。
 *
 * - サーバー側からのみ呼び出す。API キーはクライアントに渡さない。
 * - model="auto" を基本とし、実際に選択されたモデルをレスポンスから取得する。
 * - 失敗しても例外を投げず、常に結果オブジェクトを返す（呼び出し側が
 *   決定論的フォールバックへ切り替えられるようにするため）。
 */

const BASE_URL = process.env.ORCAROUTER_BASE_URL "https://api.orcarouter.com/v1";
const TIMEOUT_MS = Number(process.env.ORCAROUTER_TIMEOUT_MS 20000);

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
};

export type LlmResult =
  | { ok: true; content: string; meta: LlmMeta }
  | { ok: false; error: string; meta: LlmMeta };

export type CallOptions = {
  task: LlmTaskType;
  tier: ModelTier;
  system: string;
  user: string;
  /** JSON 出力を要求する（OpenAI 互換の response_format） */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
};

export async function callOrcaRouter(opts: CallOptions): Promise<LlmResult> {
  const requestedModel = modelFor(opts.tier);
  const started = Date.now();

  const apiKey = process.env.ORCAROUTER_API_KEY;
  if (!apiKey) {
    const meta: LlmMeta = {
      requestId: null,
      requestedModel,
      selectedModel: null,
      latencyMs: 0,
      estimatedTokens: null,
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
    return { ok: false, error: "ORCAROUTER_API_KEY が設定されていません", meta };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
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
      const meta: LlmMeta = {
        requestId,
        requestedModel,
        selectedModel: headerModel,
        latencyMs,
        estimatedTokens: null,
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
      return { ok: false, error: `OrcaRouter HTTP ${res.status}`, meta };
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
      return { ok: false, error: "OrcaRouter の応答形式が想定と異なります", meta };
    }

    const content = parsed.data.choices[0]?.message.content ?? "";
    const selectedModel = headerModel ?? parsed.data.model ?? null;
    const estimatedTokens = parsed.data.usage?.total_tokens ?? null;

    const meta: LlmMeta = {
      requestId: requestId ?? parsed.data.id ?? null,
      requestedModel,
      selectedModel,
      latencyMs,
      estimatedTokens,
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
      return { ok: false, error: "AI の応答が空でした", meta };
    }

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
    return { ok: false, error: `OrcaRouter 呼び出しに失敗しました (${reason})`, meta };
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

import "server-only";
import type { Profile } from "@/schemas/profile";
import {
  LlmExplanationSchema,
  type AiMeta,
  type Recommendation,
} from "@/schemas/recommendation";
import { isKnownProductId } from "@/domain/recommendation/catalog";
import { areExpressionsSafe } from "@/domain/recommendation/safety-rules";
import { callOrcaRouter, isConfigured, parseJsonLoose } from "./orcarouter";
import {
  buildExplanationPrompt,
  EXPLANATION_SYSTEM,
} from "./prompt-builder";
import { logLlmCall } from "./logger";

/**
 * LLM による説明文の適用。
 *
 * 検証の順序（1つでも落ちたら決定論的説明のまま返す）:
 *   1. HTTP / ネットワークが成功したか
 *   2. JSON として解釈できるか
 *   3. Zod スキーマに合うか
 *   4. productId がすべて許可リスト内か（カタログ外生成の検知）
 *   5. 文章に禁止表現が含まれていないか
 *
 * 失敗時も「AI が失敗した」ことを UI に伝える（隠さない）。
 */
export type ApplyResult = {
  recommendation: Omit<Recommendation, "ai">;
  ai: AiMeta;
};

const NO_AI: AiMeta = {
  used: false,
  model: null,
  requestedModel: null,
  latencyMs: null,
  fallback: true,
  fallbackReason: "not_configured",
  requestId: null,
  jsonValid: null,
  estimatedTokens: null,
};

export async function applyLlmExplanation(
  profile: Profile,
  base: Omit<Recommendation, "ai">,
  allowedProductIds: string[],
  options?: { skip?: boolean },
): Promise<ApplyResult> {
  if (options?.skip) {
    return {
      recommendation: base,
      ai: { ...NO_AI, fallbackReason: "skipped_by_request" },
    };
  }
  if (!isConfigured()) {
    return { recommendation: base, ai: NO_AI };
  }
  // 説明する対象がなければ呼ばない（不要な LLM 呼び出しをしない方針）
  if (base.routines.morning.steps.length + base.routines.night.steps.length === 0) {
    return {
      recommendation: base,
      ai: { ...NO_AI, fallbackReason: "nothing_to_explain" },
    };
  }

  const result = await callOrcaRouter({
    task: "routine_explanation",
    tier: "quality",
    system: EXPLANATION_SYSTEM,
    user: buildExplanationPrompt(profile, base, allowedProductIds),
    json: true,
    temperature: 0.3,
    maxTokens: 1600,
  });

  const metaBase = {
    requestedModel: result.meta.requestedModel,
    model: result.meta.selectedModel,
    latencyMs: result.meta.latencyMs,
    requestId: result.meta.requestId,
    estimatedTokens: result.meta.estimatedTokens,
  };

  const fail = (reason: string, jsonValid: boolean | null): ApplyResult => {
    logLlmCall({
      requestId: result.meta.requestId,
      task: "routine_explanation",
      requestedModel: result.meta.requestedModel,
      selectedModel: result.meta.selectedModel,
      latencyMs: result.meta.latencyMs,
      ok: false,
      jsonValid,
      fallback: true,
      fallbackReason: reason,
      estimatedTokens: result.meta.estimatedTokens,
    });
    return {
      recommendation: base,
      ai: {
        ...metaBase,
        used: false,
        jsonValid,
        fallback: true,
        fallbackReason: reason,
      },
    };
  };

  if (!result.ok) return fail(result.error, null);

  const json = parseJsonLoose(result.content);
  if (json === null) return fail("json_parse_error", false);

  const parsed = LlmExplanationSchema.safeParse(json);
  if (!parsed.success) return fail("schema_validation_error", false);

  const data = parsed.data;

  // カタログ外 ID の検知（受け入れ条件: カタログ外商品生成率 0%）
  const allowed = new Set(allowedProductIds);
  const referenced = [
    ...data.steps.map((s) => s.productId),
    ...data.unusedNotes.map((u) => u.productId),
  ];
  const unknown = referenced.filter(
    (id) => !isKnownProductId(id) || !allowed.has(id),
  );
  if (unknown.length > 0) return fail("unknown_product_id", true);

  // 表現チェック（薬機法まわり）
  const texts = [
    data.summary,
    ...data.steps.flatMap((s) => [s.purpose, s.reason]),
    ...data.duplicationNotes.map((d) => d.note),
    ...data.unusedNotes.map((u) => u.reason),
    ...(data.purchaseReason ? [data.purchaseReason] : []),
  ];
  const expr = areExpressionsSafe(texts);
  if (!expr.safe) return fail(`banned_expression:${expr.hits.join(",")}`, true);

  // 検証を通ったので、決定論的な結果に説明文だけを重ねる
  const stepText = new Map(data.steps.map((s) => [s.productId, s]));
  const unusedText = new Map(data.unusedNotes.map((u) => [u.productId, u.reason]));

  const merge = (routine: Recommendation["routines"]["morning"]) => ({
    ...routine,
    steps: routine.steps.map((s) => {
      const t = stepText.get(s.productId);
      return t ? { ...s, purpose: t.purpose, reason: t.reason } : s;
    }),
  });

  const recommendation: Omit<Recommendation, "ai"> = {
    ...base,
    summary: data.summary,
    routines: {
      morning: merge(base.routines.morning),
      night: merge(base.routines.night),
    },
    unused: base.unused.map((u) => {
      const r = unusedText.get(u.productId);
      return r ? { ...u, reason: r } : u;
    }),
    purchaseSuggestion:
      base.purchaseSuggestion && data.purchaseReason
        ? { ...base.purchaseSuggestion, reason: data.purchaseReason }
        : base.purchaseSuggestion,
  };

  logLlmCall({
    requestId: result.meta.requestId,
    task: "routine_explanation",
    requestedModel: result.meta.requestedModel,
    selectedModel: result.meta.selectedModel,
    latencyMs: result.meta.latencyMs,
    ok: true,
    jsonValid: true,
    fallback: false,
    fallbackReason: null,
    estimatedTokens: result.meta.estimatedTokens,
  });

  return {
    recommendation,
    ai: {
      ...metaBase,
      used: true,
      jsonValid: true,
      fallback: false,
      fallbackReason: null,
    },
  };
}

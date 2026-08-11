import "server-only";
import {
  ProfilePatchSchema,
  type Profile,
  type ProfilePatch,
} from "@/schemas/profile";
import type { AiMeta } from "@/schemas/recommendation";
import { extractSlotsFromText } from "@/domain/recommendation/text-slots";
import { callOrcaRouter, isConfigured, parseJsonLoose } from "./orcarouter";
import { decideExternalAi } from "./ai-policy";
import {
  buildSlotExtractionPrompt,
  SLOT_EXTRACTION_SYSTEM,
} from "./prompt-builder";
import { logLlmCall } from "./logger";

/**
 * 自然文 → プロファイル更新。
 * コスト優先ティアで LLM を呼び、失敗時はキーワード規則へフォールバックする。
 * どちらの経路でも Zod で検証してからプロファイルへ反映する。
 */
export type SlotResult = { patch: ProfilePatch; ai: AiMeta };

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
  costJpy: null,
  cached: false,
};

export async function extractSlots(
  message: string,
  current: Profile,
  options: { userAllowsExternalAi: boolean } = { userAllowsExternalAi: false },
): Promise<SlotResult> {
  // 決定論的なキーワード抽出は、外部送信の可否に関わらず必ず行う。
  // 「端末内のみ」設定でも条件の読み取りが動くようにするため。
  const deterministic = extractSlotsFromText(message, current.domain);

  const decision = decideExternalAi({
    userAllows: options.userAllowsExternalAi,
    configured: isConfigured(),
  });

  if (!decision.allowed) {
    return {
      patch: deterministic,
      ai: { ...NO_AI, fallbackReason: decision.reason },
    };
  }

  const result = await callOrcaRouter({
    task: "slot_extraction",
    tier: "cheap",
    grant: decision.grant,
    system: SLOT_EXTRACTION_SYSTEM,
    user: buildSlotExtractionPrompt(message, current),
    json: true,
    temperature: 0,
    maxTokens: 400,
  });

  const metaBase = {
    requestedModel: result.meta.requestedModel,
    model: result.meta.selectedModel,
    latencyMs: result.meta.latencyMs,
    requestId: result.meta.requestId,
    estimatedTokens: result.meta.estimatedTokens,
    costJpy: result.meta.costJpy,
    cached: result.meta.cached,
  };

  const fallback = (reason: string, jsonValid: boolean | null): SlotResult => {
    logLlmCall({
      requestId: result.meta.requestId,
      task: "slot_extraction",
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
      patch: deterministic,
      ai: { ...metaBase, used: false, jsonValid, fallback: true, fallbackReason: reason },
    };
  };

  if (!result.ok) return fallback(result.error, null);

  const json = parseJsonLoose(result.content);
  if (json === null) return fallback("json_parse_error", false);

  const parsed = ProfilePatchSchema.safeParse(json);
  if (!parsed.success) return fallback("schema_validation_error", false);

  // LLM が読み取れなかった項目はキーワード抽出で補う
  const patch: ProfilePatch = { ...deterministic, ...stripUndefined(parsed.data) };

  return {
    patch,
    ai: {
      ...metaBase,
      used: true,
      jsonValid: true,
      fallback: false,
      fallbackReason: null,
    },
  };
}

function stripUndefined(patch: ProfilePatch): ProfilePatch {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out as ProfilePatch;
}

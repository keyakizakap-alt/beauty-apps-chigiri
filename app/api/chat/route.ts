import { NextResponse } from "next/server";
import {
  ChatRequestSchema,
  ProfileSchema,
  type Profile,
  type ProfileField,
} from "@/schemas/profile";
import { ChatResponseSchema, type AiMeta } from "@/schemas/recommendation";
import { buildRecommendation } from "@/domain/recommendation/engine";
import { evaluateSafety } from "@/domain/recommendation/safety-rules";
import {
  ambiguousBrandMatches,
  confidentMatches,
} from "@/domain/recommendation/product-matcher";
import {
  planTurn,
  wantsProposal,
  type CounselState,
} from "@/domain/conversation/counsel";
import { applyLlmExplanation } from "@/server/explanation";
import { extractSlots } from "@/server/slot-extractor";
import { summariseResult } from "@/server/fallback-explanation";
import { guardJsonRequest, invalidInput, isFailure } from "@/server/api-guard";
import { RATE_LIMITS } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IDLE_AI: AiMeta = {
  used: false,
  model: null,
  requestedModel: null,
  latencyMs: null,
  fallback: false,
  fallbackReason: null,
  requestId: null,
  jsonValid: null,
  estimatedTokens: null,
  costJpy: null,
  cached: false,
};

/** 手持ち商品を外す意図か */
const REMOVE_INTENT = /外し|外す|削除|やめ(た|る)|持ってな|使わなくな|捨て/;

/**
 * 相談の1往復。
 *
 * 進め方（何を尋ねるか）は domain/conversation/counsel が決める。
 * ここは、聞き取り・安全確認・ルーティン生成をつなぐ役に徹する。
 */
export async function POST(req: Request) {
  const guarded = await guardJsonRequest(req, "chat", RATE_LIMITS.chat);
  if (isFailure(guarded)) return guarded.response;

  const parsed = ChatRequestSchema.safeParse(guarded.body);
  if (!parsed.success) return invalidInput();

  const {
    message,
    profile: incomingProfile,
    allowExternalAi,
    counsel,
  } = parsed.data;

  // 1. 安全ゲート。ここで止まった場合、商品の提案は一切行わない。
  const gate = evaluateSafety(message);
  if (gate.kind === "stop") {
    return respond({
      reply: gate.notices.map((n) => n.message).join("\n\n"),
      acknowledgement: null,
      profile: incomingProfile,
      counsel,
      quickReplies: [],
      showInventoryPicker: false,
      offerPhoto: false,
      missing: [],
      recommendation: null,
      ai: IDLE_AI,
      safety: gate.notices,
    });
  }

  try {
    // 2. 手持ち商品の同定（決定論的な文字列一致のみ）
    const matched = confidentMatches(message);
    const ambiguous = ambiguousBrandMatches(message);
    const removing = REMOVE_INTENT.test(message);

    let ownedProductIds = [...incomingProfile.ownedProductIds];
    if (matched.length > 0) {
      if (removing) {
        const drop = new Set(matched.map((p) => p.id));
        ownedProductIds = ownedProductIds.filter((id) => !drop.has(id));
      } else {
        ownedProductIds = [
          ...new Set([...ownedProductIds, ...matched.map((p) => p.id)]),
        ];
      }
    }

    // 3. 自然文からの条件抽出
    const { patch, ai: slotAi } = await extractSlots(message, incomingProfile, {
      userAllowsExternalAi: allowExternalAi,
    });

    const learned: ProfileField[] = [];
    const statedFields = new Set<ProfileField>(incomingProfile.statedFields);
    for (const key of Object.keys(patch)) {
      const field = key as ProfileField;
      if (!statedFields.has(field)) learned.push(field);
      statedFields.add(field);
    }
    if (matched.length > 0 && !removing) {
      if (!statedFields.has("ownedProductIds")) learned.push("ownedProductIds");
      statedFields.add("ownedProductIds");
    }

    const merged = ProfileSchema.safeParse({
      ...incomingProfile,
      ...patch,
      ownedProductIds,
      statedFields: [...statedFields],
    });
    const profile: Profile = merged.success ? merged.data : incomingProfile;

    // 4. 次に何を尋ねるかを決める
    const plan = planTurn({
      profile,
      state: counsel as CounselState,
      learned,
      wantsProposal: wantsProposal(message),
    });

    // 5. まだ提案の段階でなければ、質問を返して終わり
    if (!plan.propose) {
      const brandHint =
        plan.state.stage === "inventory" && ambiguous.length > 0
          ? `\n\nもしかして「${ambiguous
              .slice(0, 2)
              .map((p) => `${p.brand} ${p.name}`)
              .join("」「")}」でしょうか。`
          : "";

      return respond({
        reply: plan.message + brandHint,
        acknowledgement: plan.acknowledgement,
        profile,
        counsel: plan.state,
        quickReplies: plan.quickReplies,
        showInventoryPicker: plan.showInventoryPicker,
        offerPhoto: plan.offerPhoto,
        missing: plan.showInventoryPicker ? ["ownedProductIds"] : [],
        recommendation: null,
        ai: slotAi,
        safety: [],
      });
    }

    // 6. 決定論的にルーティンを確定させる
    const { recommendation: base, allowedProductIds } =
      buildRecommendation(profile);

    // 7. 確定内容の説明だけを AI に任せる（利用者が許可した場合のみ）
    const { recommendation, ai } = await applyLlmExplanation(
      profile,
      base,
      allowedProductIds,
      { userAllowsExternalAi: allowExternalAi },
    );

    return respond({
      reply: summariseResult(profile, recommendation),
      acknowledgement: plan.acknowledgement,
      profile,
      counsel: plan.state,
      quickReplies: plan.quickReplies,
      showInventoryPicker: false,
      offerPhoto: false,
      missing: [],
      recommendation: { ...recommendation, ai },
      ai,
      safety: recommendation.safety,
    });
  } catch (e) {
    console.error("chat failed", e);
    return NextResponse.json(
      { error: "処理中にエラーが発生しました" },
      { status: 500 },
    );
  }
}

function respond(payload: unknown) {
  const out = ChatResponseSchema.safeParse(payload);
  if (!out.success) {
    console.error("chat response schema violation", out.error.issues);
    return NextResponse.json(
      { error: "応答の生成に失敗しました" },
      { status: 500 },
    );
  }
  return NextResponse.json(out.data);
}

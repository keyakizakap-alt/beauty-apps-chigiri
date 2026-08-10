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
import { applyLlmExplanation } from "@/server/explanation";
import { extractSlots } from "@/server/slot-extractor";
import {
  askForInventory,
  fallbackChatReply,
} from "@/server/fallback-explanation";
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
};

/** 手持ち商品を外す意図か */
const REMOVE_INTENT = /外し|外す|削除|やめ(た|る)|持ってな|使わなくな|捨て/;

export async function POST(req: Request) {
  const guarded = await guardJsonRequest(req, "chat", RATE_LIMITS.chat);
  if (isFailure(guarded)) return guarded.response;

  const parsed = ChatRequestSchema.safeParse(guarded.body);
  if (!parsed.success) return invalidInput();

  const { message, profile: incomingProfile, allowExternalAi } = parsed.data;

  // 1. 安全ゲート。ここで止まった場合、商品の提案は一切行わない。
  const gate = evaluateSafety(message);
  if (gate.kind === "stop") {
    return respond({
      reply: gate.notices.map((n) => n.message).join("\n\n"),
      profile: incomingProfile,
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

    // 3. 自然文からの条件抽出（LLM: コスト優先ティア / 失敗時は規則ベース）
    const { patch, ai: slotAi } = await extractSlots(message, incomingProfile, {
      userAllowsExternalAi: allowExternalAi,
    });

    // この発言で新たに指定された項目を記録する。
    // 記録しておかないと、初期値のままの項目まで
    // 「あなたはこう言いました」と読み上げてしまう。
    const statedFields = new Set<ProfileField>(incomingProfile.statedFields);
    for (const key of Object.keys(patch)) {
      statedFields.add(key as ProfileField);
    }
    if (matched.length > 0) statedFields.add("ownedProductIds");

    const merged = ProfileSchema.safeParse({
      ...incomingProfile,
      ...patch,
      ownedProductIds,
      statedFields: [...statedFields],
    });
    const profile: Profile = merged.success ? merged.data : incomingProfile;

    // 4. 手持ちがまだない場合は推薦を行わず、商品選択をお願いする
    if (profile.ownedProductIds.length === 0) {
      const brandHint = ambiguous
        .slice(0, 3)
        .map((p) => `「${p.brand} ${p.name}」`);

      return respond({
        reply: askForInventory(profile, brandHint),
        profile,
        missing: ["ownedProductIds"],
        recommendation: null,
        ai: slotAi,
        safety: [],
      });
    }

    // 5. 決定論的にルーティンを確定させる
    const { recommendation: base, allowedProductIds } =
      buildRecommendation(profile);

    // 6. 確定内容の説明だけを LLM に任せる（品質優先ティア）
    const { recommendation, ai } = await applyLlmExplanation(
      profile,
      base,
      allowedProductIds,
      { userAllowsExternalAi: allowExternalAi },
    );

    // 要約は結果カードの見出しになるため、チャット本文では繰り返さない
    const reply = fallbackChatReply(profile, recommendation, ai.fallbackReason);

    return respond({
      reply,
      profile,
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

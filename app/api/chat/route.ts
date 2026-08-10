import { NextResponse } from "next/server";
import { ChatRequestSchema, ProfileSchema, type Profile } from "@/schemas/profile";
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
  describeProfile,
  fallbackChatReply,
  missingPrompt,
} from "@/server/fallback-explanation";

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
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストの形式が正しくありません" },
      { status: 400 },
    );
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力内容を確認してください", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { message, profile: incomingProfile } = parsed.data;

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
    const { patch, ai: slotAi } = await extractSlots(message, incomingProfile);

    const merged = ProfileSchema.safeParse({
      ...incomingProfile,
      ...patch,
      ownedProductIds,
    });
    const profile: Profile = merged.success ? merged.data : incomingProfile;

    // 4. 手持ちがまだない場合は推薦を行わず、確認だけ返す
    if (profile.ownedProductIds.length === 0) {
      const hint =
        ambiguous.length > 0
          ? `「${ambiguous
              .slice(0, 4)
              .map((p) => `${p.brand} ${p.name}`)
              .join("」「")}」などが候補にあります。どれをお持ちですか？`
          : "下のリストから選ぶか、商品名をそのまま書いていただければ登録します。";

      return respond({
        reply: `${describeProfile(profile)}\n\nまず、いまお使いの化粧品を教えてください。${hint}\n\n${missingPrompt(["ownedProductIds"])}`,
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

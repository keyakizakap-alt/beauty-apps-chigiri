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
import {
  detectExpertSwitch,
  detectHabits,
  detectTopics,
  EXPERTS,
  scopePatchToExpert,
} from "@/domain/conversation/experts";
import { buildCarePlan } from "@/domain/conversation/care-plan";
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
 * ここは、聞き取り・安全確認・組み立てをつなぐ役に徹する。
 *
 * 分野は4つあり、スキンケアだけが商品カタログを持つ。
 * 他の分野では商品を確定させず、手順だけを決定論的に組み立てる。
 * 持っていないデータを、あるかのように扱わないため。
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

  const state = counsel as CounselState;

  // 1. 安全ゲート。ここで止まった場合、提案も手順の提示も一切行わない。
  const gate = evaluateSafety(message, state.expert);
  if (gate.kind === "stop") {
    return respond({
      reply: gate.notices.map((n) => n.message).join("\n\n"),
      acknowledgement: null,
      profile: incomingProfile,
      counsel: state,
      quickReplies: [],
      showInventoryPicker: false,
      offerPhoto: false,
      missing: [],
      recommendation: null,
      carePlan: null,
      ai: IDLE_AI,
      safety: gate.notices,
    });
  }

  try {
    /*
     * 2. ほかの分野の話だったとき。
     *
     * 相談は分野ごとに独立しているため、この相談の中で担当は代わらない。
     * 勝手に別の分野へ移すと、いま進めている相談が途中で置き去りになる。
     * どこへ行けばよいかだけを伝えて、移るかどうかは利用者に決めてもらう。
     */
    const elsewhere = detectExpertSwitch(message);
    if (elsewhere && elsewhere !== state.expert) {
      const target = EXPERTS[elsewhere];
      return respond({
        reply:
          `${target.label}のご相談は、${target.title}として別に承っています。\n` +
          `上の「${target.label}」を選ぶと、そちらの相談が開きます。` +
          "この相談はこのまま残るので、あとで戻ってこられます。\n\n" +
          `${EXPERTS[state.expert].title}については、続けてどうぞ。`,
        acknowledgement: null,
        profile: incomingProfile,
        counsel: state,
        quickReplies: [],
        suggestExpert: elsewhere,
        showInventoryPicker: false,
        offerPhoto: false,
        missing: [],
        recommendation: null,
        carePlan: null,
        ai: IDLE_AI,
        safety: gate.notices,
      });
    }

    // 3. 手持ち商品の同定（カタログを持つ分野のみ・決定論的な文字列一致）
    const catalogued = EXPERTS[state.expert].recommendsProducts;
    const matched = catalogued ? confidentMatches(message) : [];
    const ambiguous = catalogued ? ambiguousBrandMatches(message) : [];
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

    // 4. 自然文からの条件抽出（時間・予算・避けたいものは分野をまたいで共有する）
    const { patch: extracted, ai: slotAi } = await extractSlots(
      message,
      incomingProfile,
      { userAllowsExternalAi: allowExternalAi },
    );

    // 肌の語彙で書かれた項目は、肌の相談のときだけ書き換える
    const patch = scopePatchToExpert(state.expert, extracted);

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

    // 5. その分野の語彙で、関心事と今のやり方を拾う
    const detected = {
      topics: detectTopics(state.expert, message),
      habits: detectHabits(state.expert, message),
    };

    // 6. 次に何を尋ねるかを決める
    const plan = planTurn({
      profile,
      state,
      learned,
      wantsProposal: wantsProposal(message),
      detected,
    });

    // 7. まだ組み立ての段階でなければ、質問を返して終わり
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
        carePlan: null,
        ai: slotAi,
        safety: gate.notices,
      });
    }

    /*
     * 8a. カタログを持たない分野：手順だけを決定論的に確定させる。
     * AI は呼ばない（同じ聞き取り内容なら必ず同じ手順になる）。
     */
    if (!catalogued) {
      const carePlan = buildCarePlan({
        expert: plan.state.expert,
        profile,
        topics: plan.state.topics,
        habits: plan.state.habits,
      });

      return respond({
        reply: `${carePlan.headline}。下に順番をまとめました。`,
        acknowledgement: plan.acknowledgement,
        profile,
        counsel: plan.state,
        quickReplies: plan.quickReplies,
        showInventoryPicker: false,
        offerPhoto: false,
        missing: [],
        recommendation: null,
        carePlan,
        ai: slotAi,
        safety: gate.notices,
      });
    }

    // 8b. スキンケア：決定論的にルーティンを確定させる
    const { recommendation: base, allowedProductIds } =
      buildRecommendation(profile);

    // 9. 確定内容の説明だけを AI に任せる（利用者が許可した場合のみ）
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
      carePlan: null,
      ai,
      safety: [...gate.notices, ...recommendation.safety],
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

import { NextResponse } from "next/server";
import { RecommendRequestSchema, RecommendationSchema } from "@/schemas/recommendation";
import { buildRecommendation } from "@/domain/recommendation/engine";
import { applyLlmExplanation } from "@/server/explanation";
import { guardJsonRequest, invalidInput, isFailure } from "@/server/api-guard";
import { RATE_LIMITS } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/recommend
 * プロファイル → ルーティン。
 * 入力は Zod で検証し、出力も Zod で検証してから返す。
 */
export async function POST(req: Request) {
  const guarded = await guardJsonRequest(req, "recommend", RATE_LIMITS.recommend);
  if (isFailure(guarded)) return guarded.response;

  const parsed = RecommendRequestSchema.safeParse(guarded.body);
  if (!parsed.success) return invalidInput();

  const { profile, skipLlm } = parsed.data;

  try {
    const { recommendation: base, allowedProductIds } =
      buildRecommendation(profile);

    const { recommendation, ai } = await applyLlmExplanation(
      profile,
      base,
      allowedProductIds,
      { skip: skipLlm },
    );

    const output = RecommendationSchema.safeParse({ ...recommendation, ai });
    if (!output.success) {
      // 決定論的結果でも検証に落ちる場合は内部不整合。隠さずに 500 を返す。
      console.error("recommendation schema violation", output.error.issues);
      return NextResponse.json(
        { error: "結果の生成に失敗しました" },
        { status: 500 },
      );
    }

    return NextResponse.json(output.data);
  } catch (e) {
    console.error("recommend failed", e);
    return NextResponse.json(
      { error: "結果の生成に失敗しました" },
      { status: 500 },
    );
  }
}

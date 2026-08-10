import { NextResponse } from "next/server";
import { RecommendRequestSchema, RecommendationSchema } from "@/schemas/recommendation";
import { buildRecommendation } from "@/domain/recommendation/engine";
import { applyLlmExplanation } from "@/server/explanation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/recommend
 * プロファイル → ルーティン。
 * 入力は Zod で検証し、出力も Zod で検証してから返す。
 */
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

  const parsed = RecommendRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力内容を確認してください", issues: parsed.error.issues },
      { status: 400 },
    );
  }

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

import { NextResponse } from "next/server";
import { z } from "zod";
import { callWithTierFallback, isConfigured, parseJsonLoose } from "@/server/orcarouter";
import { decideExternalAi, DENIAL_MESSAGE } from "@/server/ai-policy";
import { matchByText } from "@/domain/recommendation/product-matcher";
import { checkRateLimit, clientKey, RATE_LIMITS } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/vision/identify
 *
 * 撮った写真から、手持ちの商品を特定する。
 *
 * 守っていること:
 * - 画像は保存しない。読み取ったら捨てる。
 * - 商品 ID を AI に決めさせない。AI から受け取るのは写真に写っていた
 *   「文字」だけで、それをカタログと照合するのはこちらの決定論的な処理。
 *   これによりカタログに無い商品が手持ちに入ることがない。
 * - 外部AIの利用に同意していない場合は何もせず、その旨を返す。
 * - 顔や体が写った写真は用途外。画面側でも案内する。
 */

/** 画像は本文が大きいので、この経路だけ上限を上げる（それでも上限は持つ） */
const MAX_IMAGE_BYTES = 1_500_000;

const RequestSchema = z.object({
  /** data URL 形式（image/jpeg または image/png） */
  image: z
    .string()
    .max(MAX_IMAGE_BYTES)
    .regex(/^data:image\/(jpeg|png|webp);base64,/, "画像の形式が対応していません"),
  allowExternalAi: z.boolean().default(false),
});

/** AI から受け取る内容。商品 ID は含めない（こちらで照合する）。 */
const VisionSchema = z.object({
  /** 写真から読み取れたブランド名・商品名の候補 */
  texts: z.array(z.string().max(120)).max(20).default([]),
  /** 成分表示など、読み取れた本文（任意） */
  ingredientsText: z.string().max(2000).nullable().default(null),
  /** 化粧品が写っていたか */
  looksLikeCosmetics: z.boolean().default(true),
});

const SYSTEM = `
あなたは写真から文字を読み取る担当です。判断や推薦は行いません。

やること:
- 写真に写っている化粧品の「ブランド名」「商品名」を、書かれているとおりに読み取る
- 成分表示が読み取れる場合は、その文字列をそのまま書き出す
- 読み取れない場合は空にする。推測して補わない

やってはいけないこと:
- 写真に無い商品名を書く
- 商品を評価する、勧める、肌の状態を判断する
- 人物の外見について述べる

出力は次の JSON のみ:
{"texts":["ブランド 商品名", ...],"ingredientsText":"...またはnull","looksLikeCosmetics":true|false}
`.trim();

export async function POST(req: Request) {
  const limit = checkRateLimit(clientKey(req, "vision"), RATE_LIMITS.vision);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "読み取りの実行が多すぎます。少し時間をおいてください。" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    const text = await req.text();
    if (Buffer.byteLength(text, "utf8") > MAX_IMAGE_BYTES + 10_000) {
      return NextResponse.json(
        { error: "画像が大きすぎます。もう一度撮り直してください。" },
        { status: 413 },
      );
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "リクエストの形式が正しくありません" },
      { status: 400 },
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "画像を受け取れませんでした" },
      { status: 400 },
    );
  }

  const decision = decideExternalAi({
    userAllows: parsed.data.allowExternalAi,
    configured: isConfigured(),
  });

  if (!decision.allowed) {
    // 写真の読み取りは外部の目が要る。使えない理由をそのまま伝える。
    return NextResponse.json({
      identified: [],
      unmatched: [],
      available: false,
      reason: decision.reason,
      message:
        decision.reason === "user_local_only"
          ? "写真の読み取りには外部のAIを使います。「AIに文章を任せる」を選んでいただくと使えるようになります。一覧から選ぶ方法なら、送信せずに登録できます。"
          : DENIAL_MESSAGE[decision.reason],
    });
  }

  const result = await callWithTierFallback({
    task: "short_description",
    tier: "cheap",
    fallbackTier: "quality",
    grant: decision.grant,
    system: SYSTEM,
    // 画像は user メッセージの一部として渡す（OpenAI 互換の content 配列）
    user: "この写真に写っている化粧品の文字を読み取ってください。",
    imageDataUrl: parsed.data.image,
    json: true,
    temperature: 0,
    maxTokens: 500,
  });

  if (!result.ok) {
    return NextResponse.json({
      identified: [],
      unmatched: [],
      available: true,
      reason: result.kind,
      message:
        "写真をうまく読み取れませんでした。明るいところで、商品名が正面から入るように撮り直してみてください。一覧から選ぶこともできます。",
    });
  }

  const json = parseJsonLoose(result.content);
  const vision = VisionSchema.safeParse(json);
  if (!vision.success) {
    return NextResponse.json({
      identified: [],
      unmatched: [],
      available: true,
      reason: "schema_validation_error",
      message:
        "写真から読み取れた内容を整理できませんでした。もう一度撮り直すか、一覧から選んでください。",
    });
  }

  if (!vision.data.looksLikeCosmetics) {
    return NextResponse.json({
      identified: [],
      unmatched: [],
      available: true,
      reason: "not_cosmetics",
      message:
        "化粧品が写っていないようでした。商品のパッケージやボトルが写るように撮ってみてください。",
    });
  }

  /*
   * ここが要。AI が返すのは文字だけで、商品 ID はこちらで照合して決める。
   * 照合できなかった文字は「見つからなかったもの」として返し、
   * カタログに無い商品を手持ちへ入れない。
   */
  const identified: Array<{ productId: string; brand: string; name: string; source: string }> = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (const text of vision.data.texts) {
    const hit = matchByText(text);
    if (hit && !seen.has(hit.id)) {
      seen.add(hit.id);
      identified.push({
        productId: hit.id,
        brand: hit.brand,
        name: hit.name,
        source: text,
      });
    } else if (!hit) {
      unmatched.push(text);
    }
  }

  return NextResponse.json({
    identified,
    unmatched,
    available: true,
    reason: null,
    message:
      identified.length > 0
        ? null
        : "写真の文字は読み取れましたが、いまのカタログには見つかりませんでした。一覧から近いものを選んでください。",
    ingredientsFound: Boolean(vision.data.ingredientsText),
  });
}

import { NextResponse } from "next/server";
import {
  ProductMediaRequestSchema,
  ProductMediaResponseSchema,
} from "@/schemas/media";
import { guardJsonRequest, invalidInput, isFailure } from "@/server/api-guard";
import { RATE_LIMITS } from "@/server/rate-limit";
import { isMediaConfigured, resolveProductMedia } from "@/server/media/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/product-media
 * 商品 id の一覧に対して、外部サービスの商品写真を返す。
 *
 * 外部APIの鍵はここから先へ出さない。クライアントへ渡すのは
 * 解決済みの画像URL・提携リンク・取得時刻だけ。
 *
 * 鍵が未設定なら disabled:true を返す。画面は図案のままで動く。
 * 外部が落ちていても 200 で空を返す（写真が出ないだけで、
 * ルーティンの計算結果には影響しないため）。
 */
export async function POST(req: Request) {
  const guarded = await guardJsonRequest(req, "media", RATE_LIMITS.media);
  if (isFailure(guarded)) return guarded.response;

  const parsed = ProductMediaRequestSchema.safeParse(guarded.body);
  if (!parsed.success) return invalidInput();

  if (!isMediaConfigured()) {
    return NextResponse.json(
      ProductMediaResponseSchema.parse({ media: [], disabled: true }),
    );
  }

  try {
    const media = await resolveProductMedia(parsed.data.productIds);
    return NextResponse.json(
      ProductMediaResponseSchema.parse({ media, disabled: false }),
    );
  } catch (e) {
    // 写真が出ないことより、画面全体が落ちるほうが困る
    console.error("product media failed", e);
    return NextResponse.json(
      ProductMediaResponseSchema.parse({ media: [], disabled: false }),
    );
  }
}

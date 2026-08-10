import { NextResponse } from "next/server";
import {
  OffersRequestSchema,
  OffersResponseSchema,
} from "@/schemas/commerce";
import { commerceAdapter } from "@/domain/commerce/static-adapter";
import { buildComparison } from "@/domain/commerce/comparison";
import { AgentTrace } from "@/domain/commerce/session-state";
import { CATEGORY_LABEL } from "@/domain/recommendation/catalog";
import { guardJsonRequest, invalidInput, isFailure } from "@/server/api-guard";
import { RATE_LIMITS } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/commerce/offers
 * 不足カテゴリーに対する候補を 2〜3 件比較する。
 *
 * ここでは購入も承認もしない。状態は CANDIDATES_COMPARED または
 * AWAITING_USER_APPROVAL までで、その先へは進めない。
 */
export async function POST(req: Request) {
  const guarded = await guardJsonRequest(req, "offers", RATE_LIMITS.offers);
  if (isFailure(guarded)) return guarded.response;

  const parsed = OffersRequestSchema.safeParse(guarded.body);
  if (!parsed.success) return invalidInput();

  const { profile, category, limit } = parsed.data;

  try {
    const trace = new AgentTrace(
      `予算${profile.budgetYen.toLocaleString()}円、避けたい条件${profile.avoidIngredients.length + profile.avoidTextures.length}件として読み取りました`,
    );
    trace.advance(
      "INVENTORY_CONFIRMED",
      `手持ち${profile.ownedProductIds.length}点を確認しました`,
    );
    trace.advance("ROUTINE_GENERATED", "朝と夜の工程を確定しました");
    trace.advance(
      "NEED_ASSESSED",
      `${CATEGORY_LABEL[category]}の役割が手持ちで満たせないと判定しました`,
    );

    const comparison = await buildComparison({
      adapter: commerceAdapter,
      profile,
      category,
      limit,
    });

    if (comparison.rows.length === 0) {
      // 候補が無いのは失敗ではない。「買わない」を正式な結論として返す。
      trace.advance(
        "NO_PURCHASE_NEEDED",
        comparison.emptyReason ?? "条件に合う候補がありませんでした",
      );
    } else {
      trace.advance(
        "CANDIDATES_COMPARED",
        `${comparison.rows.length}件の候補を価格・役割・根拠・注意点で比較しました`,
      );
      trace.advance(
        "AWAITING_USER_APPROVAL",
        "内容と総額をご確認ください。承認するまで販売サイトへは移動しません。",
      );
    }

    const output = OffersResponseSchema.safeParse({
      comparison,
      trace: trace.snapshot(),
      state: trace.state,
    });
    if (!output.success) {
      console.error("offers schema violation", output.error.issues);
      return NextResponse.json(
        { error: "候補の生成に失敗しました" },
        { status: 500 },
      );
    }

    return NextResponse.json(output.data);
  } catch (e) {
    console.error("offers failed", e);
    return NextResponse.json(
      { error: "候補の生成に失敗しました" },
      { status: 500 },
    );
  }
}

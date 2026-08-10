import { NextResponse } from "next/server";
import {
  HandoffRequestSchema,
  HandoffResponseSchema,
} from "@/schemas/commerce";
import { commerceAdapter } from "@/domain/commerce/static-adapter";
import { AgentTrace } from "@/domain/commerce/session-state";
import { guardJsonRequest, invalidInput, isFailure } from "@/server/api-guard";
import { RATE_LIMITS } from "@/server/rate-limit";
import { logCommerceEvent } from "@/server/commerce-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/commerce/handoff
 * ユーザーの明示的な承認を受けて、引き継ぎトークンを発行する。
 *
 * このルートを呼んだ時点ではまだ外部へは移動しない。
 * 発行されるのは短命・単回使用の署名付きリンクだけで、
 * 実際の遷移は GET /api/commerce/handoff/[token] で行う。
 *
 * ここでは決済を行わない。カード情報を受け取らないし、保存もしない。
 */
export async function POST(req: Request) {
  const guarded = await guardJsonRequest(req, "handoff", RATE_LIMITS.handoff);
  if (isFailure(guarded)) return guarded.response;

  const parsed = HandoffRequestSchema.safeParse(guarded.body);
  if (!parsed.success) return invalidInput();

  const { profile, offerId, acknowledgedPriceYen, acknowledgedUnverified } =
    parsed.data;

  try {
    // このリクエスト自体がユーザーの承認操作なので、
    // ここまでの経過を再構成したうえで承認待ちから先へ進める。
    const trace = new AgentTrace("承認内容の再検証を開始しました");
    trace.advance("INVENTORY_CONFIRMED", `手持ち${profile.ownedProductIds.length}点`);
    trace.advance("ROUTINE_GENERATED", "確定済みのルーティンを参照しました");
    trace.advance("NEED_ASSESSED", "買い足しが必要な状態です");
    trace.advance("CANDIDATES_COMPARED", "比較済みの候補から承認対象を特定しました");
    trace.advance(
      "AWAITING_USER_APPROVAL",
      "価格・在庫・予算・遷移先をもう一度確認しています",
    );

    const result = await commerceAdapter.createHandoff({
      offerId,
      profile,
      acknowledgedPriceYen,
      acknowledgedUnverified,
    });

    if (!result.ok) {
      // 承認を止めた場合も状態は AWAITING_USER_APPROVAL のまま。
      // 「進めなかった」ことを状態として正しく表す。
      logCommerceEvent({
        event: "handoff_blocked",
        offerId,
        blockers: result.validation.blockers,
      });

      const blocked = HandoffResponseSchema.safeParse({
        handoff: null,
        validation: result.validation,
        trace: trace.snapshot(),
        state: trace.state,
      });
      if (!blocked.success) {
        console.error("handoff schema violation", blocked.error.issues);
        return NextResponse.json(
          { error: "承認処理に失敗しました" },
          { status: 500 },
        );
      }
      return NextResponse.json(blocked.data, { status: 409 });
    }

    const advanced = trace.advance(
      "PURCHASE_HANDOFF_READY",
      `${result.handoff.merchantName}への引き継ぎリンクを発行しました（有効期限あり・1回のみ使用可）`,
      { userInitiated: true },
    );
    if (!advanced) {
      // 状態機械が拒否した場合は握りつぶさずに失敗させる
      console.error("handoff transition rejected");
      return NextResponse.json(
        { error: "承認処理に失敗しました" },
        { status: 500 },
      );
    }

    logCommerceEvent({
      event: "handoff_issued",
      offerId,
      merchantId: result.handoff.offer.merchantId,
      priceYen: result.handoff.offer.price,
    });

    const output = HandoffResponseSchema.safeParse({
      handoff: result.handoff,
      validation: result.validation,
      trace: trace.snapshot(),
      state: trace.state,
    });
    if (!output.success) {
      console.error("handoff schema violation", output.error.issues);
      return NextResponse.json(
        { error: "承認処理に失敗しました" },
        { status: 500 },
      );
    }

    return NextResponse.json(output.data);
  } catch (e) {
    console.error("handoff failed", e);
    return NextResponse.json(
      { error: "承認処理に失敗しました" },
      { status: 500 },
    );
  }
}

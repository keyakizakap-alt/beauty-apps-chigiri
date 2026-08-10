import { NextResponse } from "next/server";
import {
  VERIFY_FAILURE_MESSAGE,
  verifyHandoffToken,
} from "@/server/handoff-token";
import { checkExternalUrl } from "@/domain/commerce/url-allowlist";
import { checkRateLimit, clientKey, RATE_LIMITS } from "@/server/rate-limit";
import { logCommerceEvent } from "@/server/commerce-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/commerce/handoff/[token]
 *
 * アプリ内で外部サイトへ遷移する唯一の出口。
 *
 * 遷移を許すのは、次のすべてを満たした場合だけ:
 *   1. 署名が正しい（承認画面を経て発行されたトークンである）
 *   2. 有効期限内である
 *   3. まだ使われていない
 *   4. 遷移先が許可リスト上の https ホストである（発行時に加え、ここでも再確認）
 *
 * URL はトークンの中の署名済みの値だけを使い、クエリ文字列からは一切受け取らない。
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const limit = checkRateLimit(clientKey(req, "redirect"), RATE_LIMITS.redirect);
  if (!limit.allowed) {
    return htmlError(
      "短時間に多くのアクセスがありました",
      "少し時間をおいてから、もう一度承認してください。",
      429,
    );
  }

  const { token } = await ctx.params;

  const verified = verifyHandoffToken(decodeURIComponent(token ?? ""), {
    consume: true,
  });

  if (!verified.ok) {
    logCommerceEvent({ event: "handoff_rejected", reason: verified.reason });
    return htmlError(
      "販売サイトへ移動できませんでした",
      VERIFY_FAILURE_MESSAGE[verified.reason],
      400,
    );
  }

  // 多層防御: 署名が正しくても、許可リストから外れたホストへは送らない。
  // レジストリを更新した後に、発行済みの古いトークンが生き残る場合に効く。
  const urlCheck = checkExternalUrl(verified.payload.url);
  if (!urlCheck.ok) {
    logCommerceEvent({ event: "handoff_rejected", reason: urlCheck.reason });
    return htmlError(
      "販売サイトへ移動できませんでした",
      "遷移先が現在の許可リストに含まれていないため、安全のため中止しました。",
      400,
    );
  }

  logCommerceEvent({
    event: "handoff_redirected",
    merchantId: verified.payload.merchantId,
  });

  return NextResponse.redirect(urlCheck.url.toString(), {
    status: 303,
    headers: {
      // 遷移先へ CHIGIRI 内の閲覧経路を渡さない
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * 失敗時の説明。
 * ユーザー入力を一切埋め込まない固定文言のみを返す（XSS 面を作らない）。
 */
function htmlError(title: string, message: string, status: number) {
  const body = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — CHIGIRI Beauty</title>
<style>
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;
background:#FCFBF8;color:#2B2A28;font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;padding:24px}
.card{max-width:26rem;background:#fff;border:1px solid #E8E0D5;border-radius:16px;padding:24px}
h1{font-size:1.05rem;margin:0 0 12px}
p{font-size:.875rem;line-height:1.8;color:#2B2A28B3;margin:0 0 20px}
a{display:inline-block;background:#7C6BD9;color:#fff;text-decoration:none;
padding:12px 20px;border-radius:12px;font-size:.875rem}
</style></head>
<body><div class="card">
<h1>${title}</h1>
<p>${message}</p>
<a href="/">CHIGIRI Beauty に戻る</a>
</div></body></html>`;

  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

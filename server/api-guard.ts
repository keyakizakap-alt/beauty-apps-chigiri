import "server-only";
import { NextResponse } from "next/server";
import { checkRateLimit, clientKey, type RateLimitRule } from "./rate-limit";

/**
 * API ルート共通の入口処理。
 *
 * - 本文サイズの上限（巨大な JSON でメモリを消費させない）
 * - レート制限
 * - JSON パース失敗時の一貫したエラー形
 *
 * エラー本文には内部情報を含めない。詳細はサーバーログにのみ残す。
 */

const MAX_BODY_BYTES = 64 * 1024;

export type GuardFailure = { response: NextResponse };
export type GuardSuccess = { body: unknown };
export type GuardResult = GuardSuccess | GuardFailure;

export function isFailure(r: GuardResult): r is GuardFailure {
  return "response" in r;
}

export async function guardJsonRequest(
  req: Request,
  scope: string,
  rule: RateLimitRule,
): Promise<GuardResult> {
  const limit = checkRateLimit(clientKey(req, scope), rule);
  if (!limit.allowed) {
    return {
      response: NextResponse.json(
        {
          error:
            "短時間に多くのリクエストが届いています。少し時間をおいてからお試しください。",
        },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSec) },
        },
      ),
    };
  }

  const declared = req.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    return {
      response: NextResponse.json(
        { error: "送信されたデータが大きすぎます" },
        { status: 413 },
      ),
    };
  }

  let text: string;
  try {
    text = await req.text();
  } catch {
    return {
      response: NextResponse.json(
        { error: "リクエストを読み取れませんでした" },
        { status: 400 },
      ),
    };
  }

  // Content-Length を信用せず実バイト数でも確認する
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return {
      response: NextResponse.json(
        { error: "送信されたデータが大きすぎます" },
        { status: 413 },
      ),
    };
  }

  try {
    return { body: JSON.parse(text) };
  } catch {
    return {
      response: NextResponse.json(
        { error: "リクエストの形式が正しくありません" },
        { status: 400 },
      ),
    };
  }
}

/** 入力検証エラーの共通形。Zod の issues をそのまま返さない（内部構造の露出を避ける） */
export function invalidInput(): NextResponse {
  return NextResponse.json(
    { error: "入力内容を確認してください" },
    { status: 400 },
  );
}

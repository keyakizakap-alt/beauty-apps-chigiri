import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * 購入引き継ぎトークン。
 *
 * 目的は「承認していない遷移を成立させないこと」。
 * - 遷移先 URL を含めて HMAC-SHA256 で署名する（改ざん検知）
 * - 有効期限を持つ（承認画面を開いたまま放置された状態での遷移を防ぐ）
 * - 一度使ったトークンは無効化する（リンクの使い回し・共有を防ぐ）
 *
 * 署名鍵は必ずサーバー環境変数から読む。クライアントへは
 * トークンだけを渡し、鍵も遷移先 URL も渡さない。
 */

const TTL_MS = 10 * 60 * 1000;

/** 使用済みトークンの nonce。MVP では単一プロセスのメモリ上に持つ。 */
const consumed = new Map<string, number>();
const MAX_CONSUMED = 5000;

let cachedSecret: string | null = null;

function secret(): string {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.CHIGIRI_HANDOFF_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  if (process.env.NODE_ENV === "production") {
    // 本番で鍵が無いまま起動すると、再起動のたびに承認済みリンクが失効し、
    // 複数インスタンス構成では検証が通らない。黙って続行しない。
    throw new Error(
      "CHIGIRI_HANDOFF_SECRET が未設定です（32文字以上の値を設定してください）",
    );
  }

  cachedSecret = randomBytes(32).toString("hex");
  console.warn(
    JSON.stringify({
      type: "handoff_secret_ephemeral",
      message:
        "CHIGIRI_HANDOFF_SECRET が未設定のため、起動ごとに変わる一時鍵を使用します（開発時のみ）",
    }),
  );
  return cachedSecret;
}

export const HandoffPayloadSchema = z.object({
  v: z.literal(1),
  offerId: z.string(),
  productId: z.string(),
  merchantId: z.string(),
  /** 遷移先。検証時にも許可リストへ再度かける（多層防御） */
  url: z.string(),
  priceYen: z.number(),
  shippingFeeYen: z.number().nullable(),
  approvedAt: z.number(),
  exp: z.number(),
  nonce: z.string(),
});
export type HandoffPayload = z.infer<typeof HandoffPayloadSchema>;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(body: string): string {
  return b64url(createHmac("sha256", secret()).update(body).digest());
}

export type IssuedToken = { token: string; expiresAt: Date };

export function issueHandoffToken(
  payload: Omit<HandoffPayload, "v" | "approvedAt" | "exp" | "nonce">,
): IssuedToken {
  const now = Date.now();
  const full: HandoffPayload = {
    ...payload,
    v: 1,
    approvedAt: now,
    exp: now + TTL_MS,
    nonce: randomBytes(12).toString("base64url"),
  };
  const body = b64url(Buffer.from(JSON.stringify(full), "utf8"));
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(full.exp) };
}

export type VerifyResult =
  | { ok: true; payload: HandoffPayload }
  | { ok: false; reason: VerifyFailure };

export type VerifyFailure =
  | "malformed"
  | "bad_signature"
  | "expired"
  | "already_used";

/**
 * トークンを検証する。
 * consume=true の場合、成功時にそのトークンを使用済みにする。
 */
export function verifyHandoffToken(
  token: string,
  options: { consume: boolean },
): VerifyResult {
  if (typeof token !== "string" || token.length > 4096) {
    return { ok: false, reason: "malformed" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, providedSig] = parts;

  const expected = Buffer.from(sign(body), "utf8");
  const provided = Buffer.from(providedSig, "utf8");
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: HandoffPayload;
  try {
    const parsed = HandoffPayloadSchema.safeParse(
      JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
    );
    if (!parsed.success) return { ok: false, reason: "malformed" };
    payload = parsed.data;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const now = Date.now();
  if (payload.exp <= now) return { ok: false, reason: "expired" };

  if (consumed.has(payload.nonce)) {
    return { ok: false, reason: "already_used" };
  }

  if (options.consume) {
    sweepConsumed(now);
    consumed.set(payload.nonce, payload.exp);
  }

  return { ok: true, payload };
}

function sweepConsumed(now: number): void {
  for (const [nonce, exp] of consumed) {
    if (exp <= now) consumed.delete(nonce);
  }
  // 期限切れを掃除しても溢れる場合は古いものから捨てる
  while (consumed.size >= MAX_CONSUMED) {
    const oldest = consumed.keys().next();
    if (oldest.done) break;
    consumed.delete(oldest.value);
  }
}

export const VERIFY_FAILURE_MESSAGE: Record<VerifyFailure, string> = {
  malformed: "承認情報の形式が正しくありません。もう一度承認してください。",
  bad_signature:
    "承認情報を検証できませんでした。安全のため遷移を中止しました。もう一度承認してください。",
  expired:
    "承認から時間が経ちすぎたため、リンクを無効にしました。価格と在庫を確認し直すため、もう一度承認してください。",
  already_used:
    "この承認リンクはすでに使用されています。もう一度承認してください。",
};

/** テスト用: 使用済みトークンの記録を消す */
export function __resetConsumedForTest(): void {
  consumed.clear();
}

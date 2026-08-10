import "server-only";

/**
 * 単純なスライディングウィンドウのレート制限。
 *
 * 目的は「1 リクエストが LLM 呼び出しを伴うため、無制限に叩かれると
 * 費用と可用性に直結する」ことへの一次防御。
 *
 * 制約（本番化時に置き換える前提）:
 * - プロセス内メモリのため、複数インスタンスでは実効値が緩くなる。
 * - IP はプロキシ由来のヘッダーに依存する。信頼できる経路以外では
 *   偽装できるため、これ単体を認可の代わりにしない。
 */

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10000;

export type RateLimitRule = { limit: number; windowMs: number };

export const RATE_LIMITS = {
  /** LLM を伴う対話 */
  chat: { limit: 20, windowMs: 60_000 },
  /** 決定論的計算が中心 */
  recommend: { limit: 40, windowMs: 60_000 },
  offers: { limit: 60, windowMs: 60_000 },
  /** 承認は連打される性質のものではない */
  handoff: { limit: 15, windowMs: 60_000 },
  redirect: { limit: 30, windowMs: 60_000 },
  /** B2B API（決定論的で費用がかからないため緩め） */
  b2b: { limit: 120, windowMs: 60_000 },
  /** 疎通確認は実際に課金が発生するため厳しめ */
  probe: { limit: 6, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now = Date.now(),
): RateLimitResult {
  if (buckets.size > MAX_KEYS) buckets.clear();

  const bucket = buckets.get(key) ?? { hits: [] };
  const cutoff = now - rule.windowMs;
  const hits = bucket.hits.filter((t) => t > cutoff);

  if (hits.length >= rule.limit) {
    buckets.set(key, { hits });
    const oldest = hits[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  buckets.set(key, { hits });
  return {
    allowed: true,
    remaining: rule.limit - hits.length,
    retryAfterSec: 0,
  };
}

/**
 * クライアント識別子。
 * 個人を特定するためではなく、同一発信元からの連打を抑えるためだけに使う。
 * 生 IP はログにも保存しない（呼び出し側でこの値のみを使う）。
 */
export function clientKey(req: Request, scope: string): string {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  const ip =
    forwarded.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `${scope}:${ip}`;
}

/** テスト用 */
export function __resetRateLimitForTest(): void {
  buckets.clear();
}

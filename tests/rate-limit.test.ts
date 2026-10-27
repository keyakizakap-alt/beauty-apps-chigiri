import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetRateLimitForTest,
  checkRateLimit,
  clientKey,
} from "@/server/rate-limit";

const rule = { limit: 2, windowMs: 60_000 };

describe("レート制限", () => {
  beforeEach(() => __resetRateLimitForTest());

  it("多数の発信元から叩かれても、既存の制限が解除されない", () => {
    const now = 1_000_000;
    checkRateLimit("victim", rule, now);
    checkRateLimit("victim", rule, now);
    expect(checkRateLimit("victim", rule, now).allowed).toBe(false);

    // 記録の上限（10000件）を超える数の発信元から叩く
    for (let i = 0; i < 10_050; i++) checkRateLimit(`attacker-${i}`, rule, now + 1);

    expect(
      checkRateLimit("victim", rule, now + 2).allowed,
      "記録が溢れたときに全件を消しており、制限中の発信元が解除されました。直し方: server/rate-limit.ts の evict で、期限切れと古いものから消す",
    ).toBe(false);
  });

  it("期限が切れた記録から間引く", () => {
    const now = 1_000_000;
    for (let i = 0; i < 10_000; i++) checkRateLimit(`old-${i}`, rule, now);
    checkRateLimit("fresh", rule, now + 10 * 60_000);
    expect(
      checkRateLimit("fresh", rule, now + 10 * 60_000).allowed,
      "新しい発信元が正しく数えられていません。直し方: evict が期限切れの記録だけを消しているか確認する",
    ).toBe(true);
  });

  it("Vercel が付けるヘッダーを優先して発信元を決める", () => {
    const req = new Request("https://example.test/", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.5",
        "x-forwarded-for": "198.51.100.9, 203.0.113.5",
      },
    });
    expect(
      clientKey(req, "chat"),
      "発信元の判定に偽装可能なヘッダーを優先しています。直し方: clientKey で x-vercel-forwarded-for を先に読む",
    ).toBe("chat:203.0.113.5");
  });
});

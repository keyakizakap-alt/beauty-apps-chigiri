import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetConsumedForTest,
  issueHandoffToken,
  verifyHandoffToken,
} from "@/server/handoff-token";

const base = {
  offerId: "off__sn-biore-uv-aqua__kao-official",
  productId: "sn-biore-uv-aqua",
  merchantId: "kao-official",
  url: "https://www.kao.co.jp/biore/",
  priceYen: 800,
  shippingFeeYen: null,
};

describe("引き継ぎトークン", () => {
  beforeEach(() => {
    __resetConsumedForTest();
    vi.useRealTimers();
  });

  it("発行したトークンを検証できる", () => {
    const { token } = issueHandoffToken(base);
    const r = verifyHandoffToken(token, { consume: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.url).toBe(base.url);
      expect(r.payload.priceYen).toBe(800);
    }
  });

  it("本文を改ざんしたトークンを拒否する", () => {
    const { token } = issueHandoffToken(base);
    const [body, sig] = token.split(".");

    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    decoded.url = "https://evil.example/";
    const tampered = `${Buffer.from(JSON.stringify(decoded), "utf8").toString(
      "base64url",
    )}.${sig}`;

    const r = verifyHandoffToken(tampered, { consume: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_signature");
  });

  it("署名を差し替えたトークンを拒否する", () => {
    const { token } = issueHandoffToken(base);
    const [body] = token.split(".");
    const r = verifyHandoffToken(`${body}.AAAA`, { consume: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("bad_signature");
  });

  it("形式が違うトークンを拒否する", () => {
    for (const t of ["", "abc", "a.b.c", "x".repeat(5000)]) {
      expect(verifyHandoffToken(t, { consume: false }).ok).toBe(false);
    }
  });

  it("一度使ったトークンは再利用できない", () => {
    const { token } = issueHandoffToken(base);
    expect(verifyHandoffToken(token, { consume: true }).ok).toBe(true);

    const second = verifyHandoffToken(token, { consume: true });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("already_used");
  });

  it("consume=false では使用済みにならない", () => {
    const { token } = issueHandoffToken(base);
    expect(verifyHandoffToken(token, { consume: false }).ok).toBe(true);
    expect(verifyHandoffToken(token, { consume: false }).ok).toBe(true);
  });

  it("有効期限を過ぎたトークンを拒否する", () => {
    const { token, expiresAt } = issueHandoffToken(base);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(expiresAt.getTime() + 1000));

    const r = verifyHandoffToken(token, { consume: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  it("有効期限は発行から10分以内に設定される", () => {
    const before = Date.now();
    const { expiresAt } = issueHandoffToken(base);
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(10 * 60 * 1000);
    expect(expiresAt.getTime()).toBeGreaterThan(before);
  });

  it("同じ内容でも毎回異なるトークンになる", () => {
    const a = issueHandoffToken(base).token;
    const b = issueHandoffToken(base).token;
    expect(a).not.toBe(b);
  });
});

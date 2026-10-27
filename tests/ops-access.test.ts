import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as opsGet } from "@/app/api/ops/route";
import { POST as probePost } from "@/app/api/ops/orcarouter/route";
import { __resetRateLimitForTest } from "@/server/rate-limit";
import { HttpsUrlSchema } from "@/schemas/product";

describe("運用 API の公開範囲", () => {
  const original = process.env.CHIGIRI_OPS;

  beforeEach(() => {
    __resetRateLimitForTest();
    delete process.env.CHIGIRI_OPS;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CHIGIRI_OPS;
    else process.env.CHIGIRI_OPS = original;
  });

  it("CHIGIRI_OPS 未設定では /api/ops が 404 を返す", async () => {
    const res = await opsGet(new Request("http://localhost/api/ops"));
    expect(
      res.status,
      "運用指標が誰でも読める状態です。直し方: app/api/ops/route.ts の先頭で opsVisible() を確認して 404 を返す",
    ).toBe(404);
  });

  it("CHIGIRI_OPS 未設定では疎通確認（課金を伴う）を実行しない", async () => {
    const res = await probePost(
      new Request("http://localhost/api/ops/orcarouter", { method: "POST" }),
    );
    expect(
      res.status,
      "誰でも外部 AI への疎通確認を起動できます。直し方: app/api/ops/orcarouter/route.ts の先頭で opsVisible() を確認して 404 を返す",
    ).toBe(404);
  });

  it("CHIGIRI_OPS=1 のときだけ運用指標を返す", async () => {
    process.env.CHIGIRI_OPS = "1";
    const res = await opsGet(new Request("http://localhost/api/ops"));
    expect(
      res.status,
      "運用者が有効にしても指標が読めません。直し方: opsVisible() の判定条件（CHIGIRI_OPS === '1'）を確認する",
    ).toBe(200);
  });
});

describe("リンクとして描画する URL", () => {
  it.each(["javascript:alert(1)", "data:text/html,<script>1</script>", "http://example.com/"])(
    "%s を拒否する",
    (url) => {
      expect(
        HttpsUrlSchema.safeParse(url).success,
        `${url} が href に流れる可能性があります。直し方: schemas/product.ts の HttpsUrlSchema で https 以外を拒否する`,
      ).toBe(false);
    },
  );

  it("https の URL は受け付ける", () => {
    expect(
      HttpsUrlSchema.safeParse("https://www.example.co.jp/item").success,
      "正規の公式ページ URL が拒否されています。直し方: HttpsUrlSchema の protocol 指定を確認する",
    ).toBe(true);
  });
});

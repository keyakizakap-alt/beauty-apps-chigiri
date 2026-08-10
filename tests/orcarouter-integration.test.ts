import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { callOrcaRouter, callWithTierFallback } from "@/server/orcarouter";
import { decideExternalAi, type ExternalAiGrant } from "@/server/ai-policy";
import { __resetCostForTest } from "@/server/llm-cost";

/**
 * OrcaRouter との疎通を、実際の HTTP でひととおり通す。
 *
 * OpenAI 互換の応答を返すサーバーを立て、そこへ本物のクライアントを向ける。
 * 「送信内容の形」「選択モデルの取得」「使用量からの費用計算」
 * 「異常応答時のフォールバック」を、モックの差し替えではなく通信で確認する。
 */

const ORIGINAL_ENV = { ...process.env };

type Handler = (
  body: Record<string, unknown>,
  req: { headers: Record<string, string | string[] | undefined> },
) => {
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  raw?: string;
};

let server: Server | null = null;
/** サーバーが受け取ったリクエストの記録 */
let received: Array<{ body: Record<string, unknown>; auth?: string }> = [];

async function startMock(handler: Handler): Promise<string> {
  received = [];
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw.length > 0 ? JSON.parse(raw) : {};
      received.push({
        body,
        auth: req.headers.authorization as string | undefined,
      });
      const out = handler(body, { headers: req.headers });
      res.writeHead(out.status ?? 200, {
        "Content-Type": "application/json",
        ...(out.headers ?? {}),
      });
      res.end(out.raw ?? JSON.stringify(out.json ?? {}));
    });
  });

  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server!.address() as AddressInfo;
  return `http://127.0.0.1:${port}/v1`;
}

function completion(content: string, model = "gpt-4o-mini") {
  return {
    id: "cmpl-test",
    model,
    choices: [{ message: { content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 800, completion_tokens: 200, total_tokens: 1000 },
  };
}

/** ポリシーを通して許可証を得る（本番と同じ経路） */
function grant(): ExternalAiGrant {
  const d = decideExternalAi({ userAllows: true, configured: true });
  if (!d.allowed) throw new Error(`許可証を取得できません: ${d.reason}`);
  return d.grant;
}

const baseCall = {
  task: "routine_explanation" as const,
  tier: "quality" as const,
  system: "システム指示",
  user: "ユーザー入力",
};

describe("OrcaRouter 疎通", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.CHIGIRI_EXTERNAL_AI = "on";
    process.env.ORCAROUTER_API_KEY = "test-key";
    process.env.CHIGIRI_LLM_DAILY_BUDGET_JPY = "100000";
    __resetCostForTest();
  });

  afterEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    if (server) {
      await new Promise<void>((r) => server!.close(() => r()));
      server = null;
    }
  });

  it("OpenAI 互換の形式で送信する", async () => {
    process.env.ORCAROUTER_BASE_URL = await startMock(() => ({
      json: completion('{"ok":true}'),
    }));

    const r = await callOrcaRouter({ ...baseCall, grant: grant(), json: true });
    expect(r.ok).toBe(true);

    expect(received).toHaveLength(1);
    const sent = received[0].body as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      response_format?: { type: string };
    };
    expect(sent.model).toBe("auto");
    expect(sent.messages[0]).toEqual({ role: "system", content: "システム指示" });
    expect(sent.messages[1]).toEqual({ role: "user", content: "ユーザー入力" });
    expect(sent.response_format).toEqual({ type: "json_object" });
  });

  it("API キーを Authorization ヘッダーで送る", async () => {
    process.env.ORCAROUTER_BASE_URL = await startMock(() => ({
      json: completion("x"),
    }));
    await callOrcaRouter({ ...baseCall, grant: grant() });
    expect(received[0].auth).toBe("Bearer test-key");
  });

  it("ORCAROUTER_MODEL_QUALITY を指定するとそのモデルを要求する", async () => {
    process.env.ORCAROUTER_MODEL_QUALITY = "claude-sonnet-4";
    process.env.ORCAROUTER_BASE_URL = await startMock(() => ({
      json: completion("x", "claude-sonnet-4"),
    }));

    const r = await callOrcaRouter({ ...baseCall, grant: grant() });
    expect((received[0].body as { model: string }).model).toBe("claude-sonnet-4");
    expect(r.meta.requestedModel).toBe("claude-sonnet-4");
  });

  it("ルーターが実際に選んだモデルをヘッダーから取得する", async () => {
    process.env.ORCAROUTER_BASE_URL = await startMock(() => ({
      headers: { "x-orcarouter-model": "gpt-4o-mini-2024" },
      json: completion("x", "ignored-body-model"),
    }));

    const r = await callOrcaRouter({ ...baseCall, grant: grant() });
    expect(r.meta.selectedModel).toBe("gpt-4o-mini-2024");
  });

  it("ヘッダーが無ければ本文の model を使う", async () => {
    process.env.ORCAROUTER_BASE_URL = await startMock(() => ({
      json: completion("x", "gpt-4o-mini"),
    }));
    const r = await callOrcaRouter({ ...baseCall, grant: grant() });
    expect(r.meta.selectedModel).toBe("gpt-4o-mini");
  });

  it("使用量から費用を推定する", async () => {
    process.env.CHIGIRI_LLM_INPUT_JPY_PER_1K = "1";
    process.env.CHIGIRI_LLM_OUTPUT_JPY_PER_1K = "2";
    process.env.ORCAROUTER_BASE_URL = await startMock(() => ({
      json: completion("x"),
    }));

    const r = await callOrcaRouter({ ...baseCall, grant: grant() });
    // prompt 800/1000*1 + completion 200/1000*2 = 1.2
    expect(r.meta.costJpy).toBeCloseTo(1.2, 4);
    expect(r.meta.estimatedTokens).toBe(1000);
  });

  it("2回目は通信せずキャッシュから返す", async () => {
    process.env.ORCAROUTER_BASE_URL = await startMock(() => ({
      json: completion("同じ答え"),
    }));

    const first = await callOrcaRouter({ ...baseCall, grant: grant() });
    const second = await callOrcaRouter({ ...baseCall, grant: grant() });

    expect(received).toHaveLength(1); // 通信は1回だけ
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.content).toBe(first.ok ? first.content : "");
    expect(second.meta.cached).toBe(true);
    expect(second.meta.costJpy).toBe(0);
  });

  it("HTTP エラーでも例外にせず失敗として返す", async () => {
    process.env.ORCAROUTER_BASE_URL = await startMock(() => ({
      status: 500,
      json: { error: "boom" },
    }));

    const r = await callOrcaRouter({ ...baseCall, grant: grant() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("500");
  });

  it("想定外の応答形式を失敗として扱う", async () => {
    process.env.ORCAROUTER_BASE_URL = await startMock(() => ({
      json: { unexpected: true },
    }));

    const r = await callOrcaRouter({ ...baseCall, grant: grant() });
    expect(r.ok).toBe(false);
  });

  it("本文が空なら失敗として扱う", async () => {
    process.env.ORCAROUTER_BASE_URL = await startMock(() => ({
      json: completion("   "),
    }));
    const r = await callOrcaRouter({ ...baseCall, grant: grant() });
    expect(r.ok).toBe(false);
  });

  it("タイムアウトで打ち切る", async () => {
    process.env.ORCAROUTER_TIMEOUT_MS = "150";
    received = [];
    server = createServer((req, res) => {
      req.on("data", () => {});
      req.on("end", () => {
        // 応答を返さず放置する
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(completion("late")));
        }, 2000);
      });
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const { port } = server!.address() as AddressInfo;
    process.env.ORCAROUTER_BASE_URL = `http://127.0.0.1:${port}/v1`;

    const r = await callOrcaRouter({ ...baseCall, grant: grant() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("timeout");
  }, 10000);

  it("接続できない場合も失敗として返す", async () => {
    // 誰も待ち受けていないポート
    process.env.ORCAROUTER_BASE_URL = "http://127.0.0.1:1/v1";
    const r = await callOrcaRouter({ ...baseCall, grant: grant() });
    expect(r.ok).toBe(false);
  });

  it("末尾のスラッシュがあっても正しい URL を組み立てる", async () => {
    const url = await startMock(() => ({ json: completion("x") }));
    process.env.ORCAROUTER_BASE_URL = `${url}/`;

    const r = await callOrcaRouter({ ...baseCall, grant: grant() });
    expect(r.ok).toBe(true);
  });
});

describe("ティア降格", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.CHIGIRI_EXTERNAL_AI = "on";
    process.env.ORCAROUTER_API_KEY = "test-key";
    process.env.CHIGIRI_LLM_DAILY_BUDGET_JPY = "100000";
    process.env.ORCAROUTER_MODEL_QUALITY = "quality-model";
    process.env.ORCAROUTER_MODEL_CHEAP = "cheap-model";
    __resetCostForTest();
  });

  afterEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    if (server) {
      await new Promise<void>((r) => server!.close(() => r()));
      server = null;
    }
  });

  it("成功すれば1回で終わる", async () => {
    process.env.ORCAROUTER_BASE_URL = await startMock(() => ({
      json: completion("ok", "quality-model"),
    }));

    const r = await callWithTierFallback({
      ...baseCall,
      grant: grant(),
      fallbackTier: "cheap",
    });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(1);
    expect(r.servedTier).toBe("quality");
    expect(received).toHaveLength(1);
  });

  it("5xx なら下位ティアで再試行する", async () => {
    let hit = 0;
    process.env.ORCAROUTER_BASE_URL = await startMock((body) => {
      hit += 1;
      if ((body as { model: string }).model === "quality-model") {
        return { status: 503, json: { error: "unavailable" } };
      }
      return { json: completion("代替の応答", "cheap-model") };
    });

    const r = await callWithTierFallback({
      ...baseCall,
      grant: grant(),
      fallbackTier: "cheap",
    });

    expect(hit).toBe(2);
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
    expect(r.servedTier).toBe("cheap");
    expect((received[1].body as { model: string }).model).toBe("cheap-model");
  });

  it("429 でも下位ティアで再試行する", async () => {
    process.env.ORCAROUTER_BASE_URL = await startMock((body) =>
      (body as { model: string }).model === "quality-model"
        ? { status: 429, json: { error: "rate limited" } }
        : { json: completion("ok", "cheap-model") },
    );

    const r = await callWithTierFallback({
      ...baseCall,
      grant: grant(),
      fallbackTier: "cheap",
    });
    expect(r.ok).toBe(true);
    expect(r.servedTier).toBe("cheap");
  });

  it("4xx は設定の誤りなので再試行しない", async () => {
    process.env.ORCAROUTER_BASE_URL = await startMock(() => ({
      status: 401,
      json: { error: "unauthorized" },
    }));

    const r = await callWithTierFallback({
      ...baseCall,
      grant: grant(),
      fallbackTier: "cheap",
    });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(1);
    expect(received).toHaveLength(1);
  });

  it("両方落ちたら失敗を返す（決定論的応答へ切り替わる）", async () => {
    process.env.ORCAROUTER_BASE_URL = await startMock(() => ({
      status: 500,
      json: { error: "boom" },
    }));

    const r = await callWithTierFallback({
      ...baseCall,
      grant: grant(),
      fallbackTier: "cheap",
    });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(2);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetCostForTest,
  budgetStatus,
  cacheKey,
  dailyBudgetJpy,
  estimateCost,
  isOverBudget,
  priceFor,
  readCache,
  recordSpend,
  writeCache,
} from "@/server/llm-cost";
import { decideExternalAi } from "@/server/ai-policy";

const ORIGINAL_ENV = { ...process.env };

describe("費用の推定", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    __resetCostForTest();
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("モデル名から単価表を引く", () => {
    expect(priceFor("gpt-4o-mini", "cheap").source).toBe("table");
    expect(priceFor("claude-3-haiku", "quality").source).toBe("table");
  });

  it("未知のモデルはティア既定値を使う", () => {
    const r = priceFor("unknown-model-x", "quality");
    expect(r.source).toBe("tier_default");
    expect(r.price.inputJpy).toBeGreaterThan(0);
  });

  it("環境変数の単価が最優先される", () => {
    process.env.CHIGIRI_LLM_INPUT_JPY_PER_1K = "1";
    process.env.CHIGIRI_LLM_OUTPUT_JPY_PER_1K = "2";
    const r = priceFor("gpt-4o-mini", "cheap");
    expect(r.source).toBe("env");
    expect(r.price).toEqual({ inputJpy: 1, outputJpy: 2 });
  });

  it("入出力の内訳から費用を出す", () => {
    process.env.CHIGIRI_LLM_INPUT_JPY_PER_1K = "1";
    process.env.CHIGIRI_LLM_OUTPUT_JPY_PER_1K = "2";
    const c = estimateCost({
      model: "any",
      tier: "cheap",
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    });
    // 1000/1000*1 + 500/1000*2 = 2
    expect(c.jpy).toBeCloseTo(2, 5);
  });

  it("内訳が無い場合は合計から按分する", () => {
    process.env.CHIGIRI_LLM_INPUT_JPY_PER_1K = "1";
    process.env.CHIGIRI_LLM_OUTPUT_JPY_PER_1K = "1";
    const c = estimateCost({
      model: "any",
      tier: "cheap",
      promptTokens: null,
      completionTokens: null,
      totalTokens: 1000,
    });
    expect(c.promptTokens).toBe(700);
    expect(c.completionTokens).toBe(300);
    expect(c.jpy).toBeCloseTo(1, 5);
  });

  it("トークン数が不明なら費用0として扱う", () => {
    const c = estimateCost({
      model: "any",
      tier: "cheap",
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    });
    expect(c.jpy).toBe(0);
  });
});

describe("1日の上限", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    __resetCostForTest();
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("既定の上限が設定されている", () => {
    expect(dailyBudgetJpy()).toBeGreaterThan(0);
  });

  it("環境変数で上限を変えられる", () => {
    process.env.CHIGIRI_LLM_DAILY_BUDGET_JPY = "10";
    expect(dailyBudgetJpy()).toBe(10);
  });

  it("上限までは超過にならない", () => {
    process.env.CHIGIRI_LLM_DAILY_BUDGET_JPY = "10";
    recordSpend(5, { cached: false });
    expect(isOverBudget()).toBe(false);
    expect(budgetStatus().remainingJpy).toBeCloseTo(5, 5);
  });

  it("上限に達したら超過になる", () => {
    process.env.CHIGIRI_LLM_DAILY_BUDGET_JPY = "10";
    recordSpend(10, { cached: false });
    expect(isOverBudget()).toBe(true);
  });

  it("上限超過ならポリシーが外部送信を止める", () => {
    process.env.CHIGIRI_EXTERNAL_AI = "on";
    process.env.CHIGIRI_LLM_DAILY_BUDGET_JPY = "1";
    recordSpend(2, { cached: false });

    const d = decideExternalAi({ userAllows: true, configured: true });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe("budget_exceeded");
  });

  it("キャッシュ命中は費用に計上しない", () => {
    process.env.CHIGIRI_LLM_DAILY_BUDGET_JPY = "10";
    recordSpend(3, { cached: true });
    expect(budgetStatus().spentJpy).toBe(0);
    expect(budgetStatus().cachedCalls).toBe(1);
  });
});

describe("応答キャッシュ", () => {
  beforeEach(() => __resetCostForTest());

  const args = { tier: "cheap", system: "sys", user: "usr" };

  it("同じ内容は同じ鍵になる", () => {
    expect(cacheKey(args)).toBe(cacheKey({ ...args }));
  });

  it("内容が違えば別の鍵になる", () => {
    expect(cacheKey(args)).not.toBe(cacheKey({ ...args, user: "other" }));
    expect(cacheKey(args)).not.toBe(cacheKey({ ...args, tier: "quality" }));
  });

  it("書いたものを読み出せる", () => {
    const k = cacheKey(args);
    writeCache(k, { content: "hello", model: "m", jpy: 1.5 });
    const hit = readCache(k);
    expect(hit?.content).toBe("hello");
    expect(hit?.model).toBe("m");
  });

  it("未登録の鍵は null", () => {
    expect(readCache(cacheKey({ ...args, user: "nope" }))).toBeNull();
  });

  it("命中すると節約額が積み上がる", () => {
    const k = cacheKey(args);
    writeCache(k, { content: "x", model: "m", jpy: 2 });
    readCache(k);
    readCache(k);
    expect(budgetStatus().savedByCacheJpy).toBeCloseTo(4, 5);
  });

  it("プロンプトの本文が鍵から復元できない（ハッシュである）", () => {
    const k = cacheKey({ tier: "cheap", system: "秘密", user: "個人情報" });
    expect(k).not.toContain("秘密");
    expect(k).not.toContain("個人情報");
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });
});

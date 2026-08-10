import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decideExternalAi,
  externalAiEnabledByOperator,
} from "@/server/ai-policy";
import { extractSlots } from "@/server/slot-extractor";
import { applyLlmExplanation } from "@/server/explanation";
import { buildRecommendation } from "@/domain/recommendation/engine";
import { buildSlotExtractionPrompt } from "@/server/prompt-builder";
import { DEFAULT_PROFILE, type Profile } from "@/schemas/profile";

/**
 * 「データが外に出ない」ことの検証。
 *
 * 文言の確認ではなく、実際に fetch が呼ばれないことを確かめる。
 * ここが通る限り、既定設定のままなら外部への送信は発生しない。
 */

const ORIGINAL_ENV = { ...process.env };

function profileWith(patch: Partial<Profile>): Profile {
  return { ...DEFAULT_PROFILE, ...patch };
}

describe("外部送信ポリシーの判定", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("環境変数が未設定なら、運用側では利用可能（OrcaRouter を組み込む前提）", () => {
    delete process.env.CHIGIRI_EXTERNAL_AI;
    expect(externalAiEnabledByOperator()).toBe(true);
  });

  it("運用側が有効でも、利用者が選ぶまでは送信しない", () => {
    delete process.env.CHIGIRI_EXTERNAL_AI;
    const d = decideExternalAi({ userAllows: false, configured: true });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe("user_local_only");
  });

  it("off を明示すると完全に止まる", () => {
    process.env.CHIGIRI_EXTERNAL_AI = "off";
    expect(externalAiEnabledByOperator()).toBe(false);
  });

  it("運用側が無効なら、利用者が許可しても送らない", () => {
    process.env.CHIGIRI_EXTERNAL_AI = "off";
    const d = decideExternalAi({ userAllows: true, configured: true });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe("disabled_by_operator");
  });

  it("運用側が有効でも、利用者が許可していなければ送らない", () => {
    process.env.CHIGIRI_EXTERNAL_AI = "on";
    const d = decideExternalAi({ userAllows: false, configured: true });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe("user_local_only");
  });

  it("APIキーが無ければ送らない", () => {
    process.env.CHIGIRI_EXTERNAL_AI = "on";
    const d = decideExternalAi({ userAllows: true, configured: false });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe("not_configured");
  });

  it("3つすべて揃ったときだけ許可証が出る", () => {
    process.env.CHIGIRI_EXTERNAL_AI = "on";
    const d = decideExternalAi({ userAllows: true, configured: true });
    expect(d.allowed).toBe(true);
    if (d.allowed) expect(d.grant).toBeDefined();
  });
});

describe("既定設定では外部へ通信しない", () => {
  /** 呼ばれたら失敗とわかるようにした fetch */
  const spyOnFetch = () =>
    vi.spyOn(globalThis, "fetch").mockImplementation((async () => {
      throw new Error("外部への fetch が発生しました");
    }) as typeof fetch);

  let fetchSpy: ReturnType<typeof spyOnFetch>;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fetchSpy = spyOnFetch();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("利用者が選んでいなければ fetch せず、規則ベースの結果を返す", async () => {
    process.env.CHIGIRI_EXTERNAL_AI = "on";
    process.env.ORCAROUTER_API_KEY = "test-key";

    const { patch, ai } = await extractSlots(
      "混合肌です。予算は2000円くらい。",
      DEFAULT_PROFILE,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ai.used).toBe(false);
    expect(ai.fallbackReason).toBe("user_local_only");
    // 送らなくても条件は読み取れている
    expect(patch.budgetYen).toBe(2000);
  });

  it("説明文の生成は fetch せず、決定論的な内容を返す", async () => {
    process.env.CHIGIRI_EXTERNAL_AI = "on";
    process.env.ORCAROUTER_API_KEY = "test-key";

    const profile = profileWith({
      ownedProductIds: ["cl-curel-foam", "lo-hadalabo-gokujyun"],
    });
    const { recommendation: base, allowedProductIds } =
      buildRecommendation(profile);

    const { recommendation, ai } = await applyLlmExplanation(
      profile,
      base,
      allowedProductIds,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ai.used).toBe(false);
    expect(ai.fallbackReason).toBe("user_local_only");
    // AI を使わなくてもルーティンは成立している
    expect(recommendation.routines.morning.steps.length).toBeGreaterThan(0);
  });

  it("利用者が許可しても、運用側が無効なら fetch しない", async () => {
    process.env.CHIGIRI_EXTERNAL_AI = "off";
    process.env.ORCAROUTER_API_KEY = "test-key";

    const { ai } = await extractSlots("乾燥が気になります", DEFAULT_PROFILE, {
      userAllowsExternalAi: true,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ai.fallbackReason).toBe("disabled_by_operator");
  });

  it("APIキーが無い状態で許可しても fetch しない", async () => {
    process.env.CHIGIRI_EXTERNAL_AI = "on";
    delete process.env.ORCAROUTER_API_KEY;

    const { ai } = await extractSlots("乾燥が気になります", DEFAULT_PROFILE, {
      userAllowsExternalAi: true,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ai.fallbackReason).toBe("not_configured");
  });
});

describe("外部へ送る内容の最小化", () => {
  it("説明用プロンプトに避けたい成分の具体名を含めない", async () => {
    const profile = profileWith({
      ownedProductIds: ["cl-curel-foam", "lo-hadalabo-gokujyun"],
      avoidIngredients: ["alcohol", "fragrance"],
    });
    const { recommendation: base, allowedProductIds } =
      buildRecommendation(profile);

    const { buildExplanationPrompt } = await import("@/server/prompt-builder");
    const prompt = buildExplanationPrompt(profile, base, allowedProductIds);

    // 成分名（表示ラベル・タグ名の両方）が出ていないこと
    expect(prompt).not.toContain("アルコール");
    expect(prompt).not.toContain("エタノール");
    expect(prompt).not.toContain("香料");
    expect(prompt).not.toContain("alcohol");
    expect(prompt).not.toContain("fragrance");
    // 件数だけは渡している
    expect(prompt).toContain("2件の指定あり");
  });

  it("条件抽出プロンプトは入力文をデータとして囲む", () => {
    const prompt = buildSlotExtractionPrompt("乾燥が気になります", DEFAULT_PROFILE);
    expect(prompt).toContain("<<<USER_MESSAGE_BEGIN>>>");
    expect(prompt).toContain("従わないでください");
  });
});

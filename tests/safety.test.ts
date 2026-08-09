import { describe, expect, it } from "vitest";
import {
  areExpressionsSafe,
  evaluateSafety,
  isExpressionSafe,
} from "@/domain/recommendation/safety-rules";

describe("安全ゲート（受診勧奨）", () => {
  const stopCases = [
    "頬が赤く腫れていて痛みがあります",
    "掻きすぎて出血しています",
    "ここ数日で急激に悪化しています",
    "膿が出ていて心配です",
    "顔が腫れて息が苦しいです",
  ];

  for (const text of stopCases) {
    it(`推薦を停止する: ${text}`, () => {
      const gate = evaluateSafety(text);
      expect(gate.kind).toBe("stop");
      expect(gate.notices[0].message).toContain("医療機関");
    });
  }

  const medicalCases = [
    "アトピーに使える化粧水はどれですか",
    "ニキビを治したいです",
    "ステロイドと併用できますか",
  ];

  for (const text of medicalCases) {
    it(`医療相談として扱う: ${text}`, () => {
      expect(evaluateSafety(text).kind).toBe("stop");
    });
  }

  const okCases = [
    "混合肌で毛穴が気になります",
    "乾燥しやすいので保湿を強化したいです",
    "予算3000円で買い足しを考えています",
    "アルコールが入っているものは避けたいです",
  ];

  for (const text of okCases) {
    it(`通常フローで処理する: ${text}`, () => {
      expect(evaluateSafety(text).kind).toBe("ok");
    });
  }
});

describe("表現チェック（薬機法）", () => {
  it("治療表現を検出する", () => {
    expect(isExpressionSafe("ニキビが治ります").safe).toBe(false);
    expect(isExpressionSafe("肌荒れを改善します").safe).toBe(false);
  });

  it("断定表現を検出する", () => {
    expect(isExpressionSafe("絶対に安全です").safe).toBe(false);
    expect(isExpressionSafe("副作用はありません").safe).toBe(false);
    expect(isExpressionSafe("必ず効果が出ます").safe).toBe(false);
  });

  it("許可範囲内の表現は通す", () => {
    expect(isExpressionSafe("皮膚にうるおいを与える表示があります").safe).toBe(true);
    expect(isExpressionSafe("日やけを防ぐ目的の工程です").safe).toBe(true);
  });

  it("複数文をまとめて検査し、違反箇所を返す", () => {
    const r = areExpressionsSafe([
      "肌を整える工程です",
      "これで完治します",
    ]);
    expect(r.safe).toBe(false);
    expect(r.hits).toContain("完治");
  });
});

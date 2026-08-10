import { describe, expect, it } from "vitest";
import {
  askForInventory,
  describeAssumptions,
  describeStatedConditions,
  fallbackChatReply,
} from "@/server/fallback-explanation";
import { buildRecommendation } from "@/domain/recommendation/engine";
import {
  DEFAULT_PROFILE,
  markStated,
  ProfileSchema,
  type Profile,
} from "@/schemas/profile";
import { isExpressionSafe } from "@/domain/recommendation/safety-rules";

const profile = (over: Partial<Profile> = {}): Profile =>
  ProfileSchema.parse({ ...DEFAULT_PROFILE, ...over });

const OWNED = [
  "cl-curel-foam",
  "lo-hadalabo-gokujyun",
  "lo-muji-sensitive-high",
  "se-torriden-dive-in-serum",
  "mo-hadalabo-gokujyun-milk",
  "mo-curel-facecream",
];

describe("会話文：言われたことと仮置きの区別", () => {
  it("何も指定されていなければ、条件を語らない", () => {
    expect(describeStatedConditions(profile())).toBe("");
  });

  it("初期値のままの項目は「うかがえていない」と伝える", () => {
    const text = describeAssumptions(profile());
    expect(text).toContain("うかがえていない");
    expect(text).toContain("違っていたら教えてください");
  });

  it("初期値を「あなたが言った」ように断定しない", () => {
    const text = describeStatedConditions(profile());
    // 指定していない肌傾向を条件として語らない
    expect(text).not.toContain("普通肌");
  });

  it("ユーザーが指定した項目だけを条件として語る", () => {
    const p = markStated(
      profile({ skinType: "dry", concerns: ["dryness"] }),
      "skinType",
      "concerns",
    );
    const text = describeStatedConditions(p);
    expect(text).toContain("乾燥");
    expect(text).toContain("乾燥肌");
    // 指定していない予算・時間は混ぜない
    expect(text).not.toContain("円");
    expect(text).not.toContain("分");
  });

  it("すべて指定済みなら仮置きの断りを出さない", () => {
    const p = markStated(
      profile({ skinType: "dry", budgetYen: 5000, morningMinutes: 3 }),
      "skinType",
      "budgetYen",
      "morningMinutes",
      "nightMinutes",
    );
    expect(describeAssumptions(p)).toBe("");
  });

  it("指定済みの予算は仮置き扱いしない", () => {
    // 初期値と同じ 3000 円でも、ユーザーが自分で指定したなら断らない
    const p = markStated(profile({ budgetYen: 3000 }), "budgetYen");
    expect(describeAssumptions(p)).not.toContain("予算");
  });
});

describe("会話文：ルーティン提示", () => {
  const p = markStated(
    profile({
      skinType: "dry",
      concerns: ["dryness"],
      ownedProductIds: OWNED,
      morningMinutes: 5,
      nightMinutes: 10,
    }),
    "skinType",
    "concerns",
    "ownedProductIds",
    "morningMinutes",
    "nightMinutes",
    "budgetYen",
  );

  it("設定値の読み上げにならない", () => {
    const { recommendation } = buildRecommendation(p);
    const text = fallbackChatReply(p, recommendation, null);
    expect(text).not.toContain("として計算しました");
    expect(text).not.toContain("肌傾向は");
  });

  it("何をしたかが書かれている", () => {
    const { recommendation } = buildRecommendation(p);
    const text = fallbackChatReply(p, recommendation, null);
    expect(text).toContain("工程");
    expect(text).toContain("化粧水"); // 重複していた役割
    expect(text).toContain("日焼け止め"); // 不足していた役割
  });

  it("AI が使えなかったことを隠さない", () => {
    const { recommendation } = buildRecommendation(p);
    const text = fallbackChatReply(p, recommendation, "not_configured");
    expect(text).toContain("not_configured");
  });

  it("生成文が禁止表現を含まない", () => {
    const { recommendation } = buildRecommendation(p);
    for (const reason of [null, "not_configured"]) {
      const text = fallbackChatReply(p, recommendation, reason);
      expect(isExpressionSafe(text).safe, text).toBe(true);
    }
  });
});

describe("会話文：手持ちをたずねる", () => {
  it("画面構造に依存する表現を使わない", () => {
    const text = askForInventory(profile(), []);
    // 「下のリスト」と書いておいてリストが無い、という状態を作らない
    expect(text).not.toContain("下のリスト");
    expect(text).not.toContain("上のリスト");
  });

  it("何を選べばよいかが書かれている", () => {
    const text = askForInventory(profile(), []);
    expect(text).toContain("使い切っていないもの");
  });

  it("ブランド候補があれば具体名で確認する", () => {
    const text = askForInventory(profile(), ["「キュレル 潤浸保湿 泡洗顔料」"]);
    expect(text).toContain("キュレル");
    expect(text).toContain("このあたりでしょうか");
  });
});

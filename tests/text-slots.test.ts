import { describe, expect, it } from "vitest";
import { extractSlotsFromText } from "@/domain/recommendation/text-slots";
import {
  ambiguousBrandMatches,
  confidentMatches,
} from "@/domain/recommendation/product-matcher";

describe("自然文からの条件抽出（LLM を使わない経路）", () => {
  it("肌傾向を読み取る", () => {
    expect(extractSlotsFromText("混合肌です").skinType).toBe("combination");
    expect(extractSlotsFromText("敏感肌でヒリヒリしやすい").skinType).toBe("sensitive");
  });

  it("関心を読み取り、順序を保つ", () => {
    const p = extractSlotsFromText("毛穴とくすみが気になります");
    expect(p.concerns).toContain("pores");
    expect(p.concerns).toContain("dullness");
  });

  it("予算を読み取る", () => {
    expect(extractSlotsFromText("予算は3000円までです").budgetYen).toBe(3000);
    expect(extractSlotsFromText("1万円くらいなら出せます").budgetYen).toBe(10000);
  });

  it("朝夜の時間を読み取る", () => {
    const p = extractSlotsFromText("朝は3分、夜は10分しか使えません");
    expect(p.morningMinutes).toBe(3);
    expect(p.nightMinutes).toBe(10);
  });

  it("避けたい文脈のときだけ除外条件にする", () => {
    const avoid = extractSlotsFromText("アルコールが入っているものは避けたいです");
    expect(avoid.avoidIngredients).toContain("alcohol");

    const notAvoid = extractSlotsFromText("乾燥が気になります");
    expect(notAvoid.avoidIngredients).toBeUndefined();
    expect(notAvoid.concerns).toContain("dryness");
  });

  it("買い足し可否を読み取る", () => {
    expect(extractSlotsFromText("今あるものだけで組みたい").allowPurchase).toBe(false);
    expect(extractSlotsFromText("買い足してもいいです").allowPurchase).toBe(true);
  });

  it("読み取れない項目はキーごと省略する", () => {
    const p = extractSlotsFromText("こんにちは");
    expect(Object.keys(p)).toHaveLength(0);
  });
});

describe("商品名の同定（決定論的な文字列一致のみ）", () => {
  it("ブランド＋商品名で特定できる", () => {
    const hits = confidentMatches("肌ラボの極潤ヒアルロン液を使っています");
    expect(hits.map((p) => p.id)).toContain("lo-hadalabo-gokujyun");
  });

  it("英字表記でも特定できる", () => {
    const hits = confidentMatches("ビオレUVのアクアリッチ ウォータリー エッセンスがあります");
    expect(hits.map((p) => p.id)).toContain("su-biore-aquarich");
  });

  it("ブランド名だけの場合は確定させず、候補として返す", () => {
    const confident = confidentMatches("キュレルを持っています");
    expect(confident).toHaveLength(0);
    const ambiguous = ambiguousBrandMatches("キュレルを持っています");
    expect(ambiguous.length).toBeGreaterThan(1);
  });

  it("カタログにない商品名は一致しない", () => {
    expect(confidentMatches("架空ブランドの存在しない美容液")).toHaveLength(0);
  });

  it("同一ブランドの製品ライン名だけで別商品を巻き込まない", () => {
    // 「潤浸保湿」はキュレルの洗顔・化粧水・クリームで共有されている
    const hits = confidentMatches(
      "肌ラボの極潤ヒアルロン液とキュレルの潤浸保湿 泡洗顔料を持っています",
    ).map((p) => p.id);
    expect(hits.sort()).toEqual(["cl-curel-foam", "lo-hadalabo-gokujyun"]);
  });

  it("複数商品を一度に列挙しても取りこぼさない", () => {
    const hits = confidentMatches(
      "ビオレUVのアクアリッチ ウォータリー エッセンスと、無印良品の化粧水・敏感肌用・高保湿タイプを使っています",
    ).map((p) => p.id);
    expect(hits).toContain("su-biore-aquarich");
    expect(hits).toContain("lo-muji-sensitive-high");
  });
});

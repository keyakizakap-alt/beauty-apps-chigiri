import { describe, expect, it } from "vitest";
import {
  applyVerification,
  parseCsv,
  toCsv,
  toWorksheetRows,
  COLUMNS,
} from "../scripts/verification-lib.mjs";

const product = (over: Record<string, unknown> = {}) => ({
  id: "lo-test",
  domain: "skincare",
  category: "lotion",
  brand: "テスト",
  name: "化粧水, 高保湿", // カンマを含む名前
  price: 1000,
  volume: "170mL",
  officialUrl: "https://example.com/a",
  sourceCheckedAt: null,
  dataConfidence: "seed",
  ...over,
});

const row = (over: Record<string, string> = {}) => ({
  id: "lo-test",
  確認結果: "ok",
  確認日: "2026-08-12",
  正しい公式URL: "",
  正しい価格: "",
  正しい内容量: "",
  商品写真ファイル名: "",
  ...over,
});

describe("ワークシートの読み書き", () => {
  it("カンマや引用符を含む値を壊さずに往復できる", () => {
    const rows = toWorksheetRows([
      product({ name: 'あ"い"うえお, かき' }),
    ]);
    const parsed = parseCsv(toCsv(rows, COLUMNS));
    expect(parsed[0]["商品名"]).toBe('あ"い"うえお, かき');
    expect(parsed[0]["id"]).toBe("lo-test");
  });

  it("空行は読み飛ばす", () => {
    const csv = toCsv(toWorksheetRows([product()]), COLUMNS) + "\r\n\r\n";
    expect(parseCsv(csv)).toHaveLength(1);
  });

  it("現在の値を参照用に出す", () => {
    const [r] = toWorksheetRows([product()]);
    expect(r["現在の公式URL"]).toBe("https://example.com/a");
    expect(r["現在の参考価格"]).toBe(1000);
    expect(r["確認結果"]).toBe("");
  });
});

describe("記入結果の反映", () => {
  it("未記入の行は手をつけない", () => {
    const r = applyVerification([product()], [row({ 確認結果: "" })]);
    expect(r.applied).toHaveLength(0);
    expect(r.skipped).toEqual(["lo-test"]);
    expect(r.products[0].sourceCheckedAt).toBeNull();
  });

  it("ok なら確認日を入れて突合済みにする", () => {
    const r = applyVerification([product()], [row()]);
    expect(r.errors).toHaveLength(0);
    expect(r.products[0].sourceCheckedAt).toBe("2026-08-12");
    expect(r.products[0].dataConfidence).toBe("official");
    // ok は値を書き換えない
    expect(r.products[0].price).toBe(1000);
  });

  it("確認日が無い行は反映せず、エラーにする", () => {
    const r = applyVerification([product()], [row({ 確認日: "" })]);
    expect(r.applied).toHaveLength(0);
    expect(r.errors[0]).toContain("確認日");
    expect(r.products[0].sourceCheckedAt).toBeNull();
  });

  it("確認日の形式が違う行も反映しない", () => {
    const r = applyVerification([product()], [row({ 確認日: "2026/8/12" })]);
    expect(r.errors).toHaveLength(1);
    expect(r.products[0].sourceCheckedAt).toBeNull();
  });

  it("fix なら記入された値だけを書き換える", () => {
    const r = applyVerification(
      [product()],
      [
        row({
          確認結果: "fix",
          正しい価格: "1,320円",
          正しい内容量: "200mL",
        }),
      ],
    );
    expect(r.errors).toHaveLength(0);
    expect(r.products[0].price).toBe(1320);
    expect(r.products[0].volume).toBe("200mL");
    // 空欄の項目は現状を維持する
    expect(r.products[0].officialUrl).toBe("https://example.com/a");
  });

  it("https でない URL は受け付けない", () => {
    const r = applyVerification(
      [product()],
      [row({ 確認結果: "fix", 正しい公式URL: "http://example.com/b" })],
    );
    expect(r.errors[0]).toContain("https");
    expect(r.products[0].officialUrl).toBe("https://example.com/a");
  });

  it("数値として読めない価格は受け付けない", () => {
    const r = applyVerification(
      [product()],
      [row({ 確認結果: "fix", 正しい価格: "オープン価格" })],
    );
    expect(r.errors).toHaveLength(1);
    expect(r.products[0].price).toBe(1000);
  });

  it("解釈できない確認結果はエラーにする", () => {
    const r = applyVerification([product()], [row({ 確認結果: "たぶんOK" })]);
    expect(r.errors[0]).toContain("解釈できません");
  });

  it("カタログに無い id はエラーにする", () => {
    const r = applyVerification([product()], [row({ id: "no-such-id" })]);
    expect(r.errors[0]).toContain("存在しない");
  });

  it("drop は削除候補として返すだけで、勝手に消さない", () => {
    const r = applyVerification([product()], [row({ 確認結果: "drop" })]);
    expect(r.dropped).toEqual(["lo-test"]);
    expect(r.products).toHaveLength(1);
    expect(r.products[0].sourceCheckedAt).toBeNull();
  });

  it("商品写真は置いたファイル名だけを受け付ける", () => {
    const r = applyVerification(
      [product()],
      [row({ 確認結果: "fix", 商品写真ファイル名: "lo-test.jpg" })],
      { imageExists: () => true },
    );
    expect(r.errors).toHaveLength(0);
    // ファイル名だけでも /products/ を補う
    expect(r.products[0].imagePath).toBe("/products/lo-test.jpg");
  });

  it("外部サイトの画像URLは受け付けない", () => {
    const r = applyVerification(
      [product()],
      [
        row({
          確認結果: "fix",
          商品写真ファイル名: "https://www.kao.co.jp/img/a.jpg",
        }),
      ],
      { imageExists: () => true },
    );
    expect(r.errors[0]).toContain("public/products/");
    expect(r.products[0].imagePath).toBeUndefined();
  });

  it("置かれていない画像を指した行は反映しない", () => {
    const r = applyVerification(
      [product()],
      [row({ 確認結果: "fix", 商品写真ファイル名: "no-such.jpg" })],
      { imageExists: () => false },
    );
    expect(r.errors[0]).toContain("見つかりません");
    expect(r.applied).toHaveLength(0);
    expect(r.products[0].sourceCheckedAt).toBeNull();
  });

  it("画像を書かなければ現状のまま", () => {
    const r = applyVerification(
      [product({ imagePath: "/products/keep.jpg" })],
      [row({ 確認結果: "fix", 正しい価格: "1200" })],
    );
    expect(r.errors).toHaveLength(0);
    expect(r.products[0].imagePath).toBe("/products/keep.jpg");
  });

  it("エラーがあっても、他の行の反映結果は壊さない", () => {
    const a = product({ id: "lo-a" });
    const b = product({ id: "lo-b" });
    const r = applyVerification(
      [a, b],
      [row({ id: "lo-a" }), row({ id: "lo-b", 確認日: "" })],
    );
    expect(r.applied).toEqual(["lo-a"]);
    expect(r.errors).toHaveLength(1);
    // 呼び出し側はエラーがあれば書き込まない運用にしている
    expect(r.products.find((x) => x.id === "lo-b")!.sourceCheckedAt).toBeNull();
  });
});

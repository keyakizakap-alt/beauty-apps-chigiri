import { describe, expect, it } from "vitest";
import {
  CATEGORY_MEDIAN_PRICE,
  PRODUCTS,
  claimSentence,
  getProduct,
  isKnownProductId,
} from "@/domain/recommendation/catalog";
import { CatalogSchema } from "@/schemas/product";
import catalogJson from "@/data/products.json";

describe("商品カタログ", () => {
  it("スキーマ検証を通る", () => {
    expect(() => CatalogSchema.parse(catalogJson)).not.toThrow();
  });

  it("MVP の想定件数（30〜50点）に収まっている", () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(30);
    expect(PRODUCTS.length).toBeLessThanOrEqual(50);
  });

  it("対象カテゴリーがすべて存在する", () => {
    const categories = new Set(PRODUCTS.map((p) => p.category));
    expect([...categories].sort()).toEqual([
      "cleanser",
      "lotion",
      "moisturizer",
      "serum",
      "sunscreen",
    ]);
  });

  it("すべての商品が公式URLを持つ（根拠表示の前提）", () => {
    for (const p of PRODUCTS) {
      expect(p.officialUrl).toMatch(/^https:\/\//);
    }
  });

  it("公式突合が未完了の商品は sourceCheckedAt が null になっている", () => {
    for (const p of PRODUCTS) {
      if (p.dataConfidence === "seed") expect(p.sourceCheckedAt).toBeNull();
    }
  });

  it("日本・韓国コスメを両方扱っている", () => {
    const origins = new Set(PRODUCTS.map((p) => p.origin));
    expect(origins.has("jp")).toBe(true);
    expect(origins.has("kr")).toBe(true);
  });

  it("カタログ外 ID を拒否する", () => {
    expect(isKnownProductId("does-not-exist")).toBe(false);
    expect(isKnownProductId(PRODUCTS[0].id)).toBe(true);
    expect(getProduct("does-not-exist")).toBeUndefined();
  });

  it("許可表現のみから説明文を生成する", () => {
    const p = getProduct("lo-hadalabo-gokujyun")!;
    const sentence = claimSentence(p);
    expect(sentence).toContain("うるおい");
    expect(sentence).not.toContain("治");
  });

  it("カテゴリー中央価格が正の値で算出される", () => {
    for (const v of Object.values(CATEGORY_MEDIAN_PRICE)) {
      expect(v).toBeGreaterThan(0);
    }
  });
});

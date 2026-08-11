import { describe, expect, it } from "vitest";
import {
  CATEGORY_MEDIAN_PRICE,
  PRODUCTS,
  claimSentence,
  getProduct,
  isKnownProductId,
  productsInDomain,
} from "@/domain/recommendation/catalog";
import { domainConfig } from "@/domain/recommendation/domains";
import { CatalogSchema } from "@/schemas/product";
import catalogJson from "@/data/products.json";

describe("商品カタログ", () => {
  it("スキーマ検証を通る", () => {
    expect(() => CatalogSchema.parse(catalogJson)).not.toThrow();
  });

  it("各分野に十分な点数がある", () => {
    for (const d of ["skincare", "haircare", "bodycare", "makeup", "nailcare"] as const) {
      expect(productsInDomain(d).length, d).toBeGreaterThanOrEqual(8);
    }
  });

  it("すべての商品がいずれかの分野に属する", () => {
    const total = (["skincare", "haircare", "bodycare", "makeup", "nailcare"] as const)
      .map((d) => productsInDomain(d).length)
      .reduce((a, b) => a + b, 0);
    expect(total).toBe(PRODUCTS.length);
  });

  it("分野ごとに、その分野で定義された役割だけが登録されている", () => {
    for (const d of ["skincare", "haircare", "bodycare", "makeup", "nailcare"] as const) {
      const allowed = new Set(domainConfig(d).order);
      for (const p of productsInDomain(d)) {
        expect(allowed.has(p.category), `${p.id}: ${p.category}`).toBe(true);
      }
    }
  });

  it("すべての役割に、少なくとも1点の商品がある", () => {
    for (const d of ["skincare", "haircare", "bodycare", "makeup", "nailcare"] as const) {
      for (const c of domainConfig(d).order) {
        expect(
          productsInDomain(d).some((p) => p.category === c),
          `${d}/${c}`,
        ).toBe(true);
      }
    }
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

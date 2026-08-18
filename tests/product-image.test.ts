import { describe, expect, it } from "vitest";
import {
  IMAGE_PATH_RE,
  brandInitial,
  geometryForShape,
  productImagePath,
  shapeForCategory,
  toneForBrand,
} from "@/domain/recommendation/product-image";
import { PRODUCTS } from "@/domain/recommendation/catalog";
import { CategorySchema } from "@/schemas/product";

describe("役割ごとの図案", () => {
  it("すべての役割に形が割り当たっている", () => {
    for (const category of CategorySchema.options) {
      const shape = shapeForCategory(category);
      const geo = geometryForShape(shape);
      expect(geo.solid.length, `${category} に輪郭がない`).toBeGreaterThan(0);
    }
  });

  it("図形はすべて中身のあるパス文字列である", () => {
    for (const category of CategorySchema.options) {
      const geo = geometryForShape(shapeForCategory(category));
      for (const d of [...geo.solid, ...geo.line]) {
        expect(d.startsWith("M")).toBe(true);
        expect(d).not.toContain("NaN");
        expect(d).not.toContain("undefined");
      }
    }
  });

  it("同じ役割なら必ず同じ形になる", () => {
    expect(shapeForCategory("lotion")).toBe(shapeForCategory("lotion"));
  });
});

describe("ブランドごとの配色", () => {
  it("同じブランドなら必ず同じ色になる", () => {
    expect(toneForBrand("キュレル")).toEqual(toneForBrand("キュレル"));
    expect(toneForBrand("Torriden")).toEqual(toneForBrand("Torriden"));
  });

  it("色は常に決まった組で返る", () => {
    for (const p of PRODUCTS) {
      const tone = toneForBrand(p.brand);
      expect(tone.bg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(tone.ink).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("カタログのブランドが一色に偏っていない", () => {
    const brands = [...new Set(PRODUCTS.map((p) => p.brand))];
    const used = new Set(brands.map((b) => toneForBrand(b).ink));
    // 見分けるための色なので、実データで複数色に散っていることを確かめる
    expect(used.size).toBeGreaterThan(3);
  });
});

describe("ブランドの頭文字", () => {
  it("日本語のブランドは先頭の一文字を返す", () => {
    expect(brandInitial("キュレル")).toBe("キ");
  });

  it("英字は大文字にする", () => {
    expect(brandInitial("torriden")).toBe("T");
  });

  it("前後の空白は無視する", () => {
    expect(brandInitial("  無印良品 ")).toBe("無");
  });

  it("空文字でも落ちない", () => {
    expect(brandInitial("")).toBe("");
    expect(brandInitial("   ")).toBe("");
  });

  it("サロゲートペアを半分に割らない", () => {
    expect(brandInitial("𠮷野")).toBe("𠮷");
  });
});

describe("商品写真のパス", () => {
  it("public/products/ に置いたファイルだけを受け付ける", () => {
    expect(productImagePath("/products/cl-curel-foam.jpg")).toBe(
      "/products/cl-curel-foam.jpg",
    );
    expect(productImagePath("/products/lo-a.png")).toBe("/products/lo-a.png");
    expect(productImagePath("/products/lo-a.webp")).toBe("/products/lo-a.webp");
  });

  it("外部サイトの画像URLは受け付けない", () => {
    expect(productImagePath("https://www.kao.co.jp/img/a.jpg")).toBeNull();
    expect(productImagePath("//evil.example/a.jpg")).toBeNull();
    expect(productImagePath("http://example.com/a.jpg")).toBeNull();
  });

  it("上位ディレクトリへの参照を受け付けない", () => {
    expect(productImagePath("/products/../../etc/passwd")).toBeNull();
    expect(productImagePath("/products/a/../b.jpg")).toBeNull();
  });

  it("想定外の拡張子や場所を受け付けない", () => {
    expect(productImagePath("/products/a.svg")).toBeNull();
    expect(productImagePath("/products/a.js")).toBeNull();
    expect(productImagePath("/icons/a.jpg")).toBeNull();
    expect(productImagePath("products/a.jpg")).toBeNull();
    expect(productImagePath("/products/A.jpg")).toBeNull();
  });

  it("未登録は null として扱う", () => {
    expect(productImagePath(null)).toBeNull();
    expect(productImagePath(undefined)).toBeNull();
    expect(productImagePath("")).toBeNull();
    expect(productImagePath(123)).toBeNull();
  });

  it("スキーマと同じ形で判定している", () => {
    expect(IMAGE_PATH_RE.test("/products/cl-curel-foam.jpg")).toBe(true);
  });
});

describe("カタログの画像", () => {
  it("登録されている画像パスはすべて受け付けられる形をしている", () => {
    for (const p of PRODUCTS) {
      if (p.imagePath === undefined || p.imagePath === null) continue;
      expect(productImagePath(p.imagePath), `${p.id} の画像パス`).not.toBeNull();
    }
  });
});

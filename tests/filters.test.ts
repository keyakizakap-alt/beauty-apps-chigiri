import { describe, expect, it } from "vitest";
import { applyHardFilters, checkExclusion } from "@/domain/recommendation/filters";
import { getProduct, PRODUCTS } from "@/domain/recommendation/catalog";
import { DEFAULT_PROFILE, type Profile } from "@/schemas/profile";

const profile = (over: Partial<Profile> = {}): Profile => ({
  ...DEFAULT_PROFILE,
  ...over,
});

describe("ハードフィルタ", () => {
  it("避けたい成分を含む商品を除外する", () => {
    const hatomugi = getProduct("lo-naturie-hatomugi")!; // alcohol を含む
    const hit = checkExclusion(hatomugi, profile({ avoidIngredients: ["alcohol"] }));
    expect(hit?.reasonCode).toBe("hard_filter_ingredient");
    expect(hit?.matched).toContain("アルコール(エタノール)");
  });

  it("成分タグではなく注意タグ側にしか無い場合も除外する", () => {
    // 香料は cautionTags: contains_fragrance でのみ表現されている商品がある
    const senka = getProduct("cl-senka-perfectwhip")!;
    expect(senka.ingredientTags).not.toContain("fragrance");
    expect(senka.cautionTags).toContain("contains_fragrance");
    const hit = checkExclusion(senka, profile({ avoidIngredients: ["fragrance"] }));
    expect(hit?.reasonCode).toBe("hard_filter_ingredient");
  });

  it("避けたい使用感を含む商品を除外する", () => {
    const nivea = getProduct("mo-nivea-cream")!; // rich
    const hit = checkExclusion(nivea, profile({ avoidTextures: ["rich"] }));
    expect(hit?.reasonCode).toBe("hard_filter_texture");
  });

  it("除外条件がなければ何も落とさない", () => {
    const { passed, excluded } = applyHardFilters(PRODUCTS, profile());
    expect(excluded).toHaveLength(0);
    expect(passed).toHaveLength(PRODUCTS.length);
  });

  it("ハードフィルタ違反が 0 件であること（カタログ全件）", () => {
    const p = profile({
      avoidIngredients: ["alcohol", "fragrance"],
      avoidTextures: ["rich"],
    });
    const { passed } = applyHardFilters(PRODUCTS, p);
    for (const product of passed) {
      expect(product.ingredientTags).not.toContain("alcohol");
      expect(product.ingredientTags).not.toContain("fragrance");
      expect(product.cautionTags).not.toContain("contains_alcohol");
      expect(product.cautionTags).not.toContain("contains_fragrance");
      expect(product.textureTags).not.toContain("rich");
    }
  });

  it("除外理由が日本語で説明される", () => {
    const hatomugi = getProduct("lo-naturie-hatomugi")!;
    const hit = checkExclusion(hatomugi, profile({ avoidIngredients: ["alcohol"] }));
    expect(hit?.reason).toContain("除外");
  });
});

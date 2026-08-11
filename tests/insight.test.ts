import { describe, expect, it } from "vitest";
import {
  analyzeFit,
  compareProducts,
  usageHorizon,
  HORIZON_DISCLAIMER,
  INGREDIENT_ROLE,
} from "@/domain/analysis/insight";
import { lookupReviews, REVIEW_SOURCES, searchLinksFor } from "@/domain/analysis/reviews";
import { getProduct, PRODUCTS } from "@/domain/recommendation/catalog";
import { isExpressionSafe } from "@/domain/recommendation/safety-rules";
import { DEFAULT_PROFILE, ProfileSchema, type Profile } from "@/schemas/profile";

const profile = (over: Partial<Profile> = {}): Profile =>
  ProfileSchema.parse({ ...DEFAULT_PROFILE, ...over });

describe("成分と条件の突き合わせ", () => {
  it("配合成分の役割を説明する", () => {
    const p = getProduct("lo-curel-lotion3")!;
    const fit = analyzeFit(p, profile());
    expect(fit.ingredients.length).toBeGreaterThan(0);
    const ceramide = fit.ingredients.find((i) => i.tag === "ceramide");
    expect(ceramide?.role).toContain("保湿");
  });

  it("関心に対応するものとしないものを分ける", () => {
    const p = getProduct("lo-curel-lotion3")!; // dryness, sensitivity, redness
    const fit = analyzeFit(p, profile({ concerns: ["dryness", "pores"] }));
    expect(fit.matches.some((m) => m.text.includes("乾燥"))).toBe(true);
    expect(fit.mismatches.some((m) => m.text.includes("毛穴"))).toBe(true);
  });

  it("避けたい成分を含む場合に、その点を挙げる", () => {
    const p = getProduct("lo-naturie-hatomugi")!; // アルコールを含む
    const fit = analyzeFit(p, profile({ avoidIngredients: ["alcohol"] }));
    expect(
      fit.mismatches.some((m) => m.axis === "ingredient" && m.text.includes("アルコール")),
    ).toBe(true);
  });

  it("肌傾向の表示がない場合は、断定せず「明記されていない」と書く", () => {
    const p = getProduct("lo-elixir-refle-water")!;
    const fit = analyzeFit(p, profile({ skinType: "sensitive" }));
    const hit = fit.mismatches.find((m) => m.axis === "skin");
    expect(hit?.text).toContain("明記されていません");
  });

  it("成分の説明が効果を約束しない", () => {
    for (const [tag, role] of Object.entries(INGREDIENT_ROLE)) {
      expect(isExpressionSafe(role).safe, `${tag}: ${role}`).toBe(true);
      // 「効きます」「治る」だけでなく、断定的な効能表現も避ける
      expect(role, tag).not.toMatch(/効果があります|改善|治/);
    }
  });

  it("突き合わせの文章が禁止表現を含まない", () => {
    const p = profile({
      concerns: ["dryness", "pores"],
      avoidIngredients: ["alcohol"],
      avoidTextures: ["rich"],
    });
    for (const product of PRODUCTS) {
      const fit = analyzeFit(product, p);
      for (const t of [...fit.matches, ...fit.mismatches].map((x) => x.text)) {
        expect(isExpressionSafe(t).safe, t).toBe(true);
      }
    }
  });
});

describe("提案品との違い", () => {
  it("価格・成分・使用感・注意点を並べる", () => {
    const owned = getProduct("lo-hadalabo-gokujyun")!;
    const suggested = getProduct("lo-curel-lotion3")!;
    const diffs = compareProducts(owned, suggested);
    const labels = diffs.map((d) => d.label);
    expect(labels).toContain("参考価格");
    expect(labels).toContain("主な成分");
    expect(labels).toContain("使用感");
    expect(labels).toContain("注意しておきたい点");
  });

  it("役割が違う場合だけ、役割の行を出す", () => {
    const sameRole = compareProducts(
      getProduct("lo-hadalabo-gokujyun")!,
      getProduct("lo-curel-lotion3")!,
    );
    expect(sameRole.some((d) => d.label === "ルーティン上の役割")).toBe(false);

    const otherRole = compareProducts(
      getProduct("lo-hadalabo-gokujyun")!,
      getProduct("su-muji-uv-milk")!,
    );
    expect(otherRole.some((d) => d.label === "ルーティン上の役割")).toBe(true);
  });

  it("記載が無い項目は「記載なし」と書き、埋めない", () => {
    const a = getProduct("na-nailholic-base")!; // 成分タグが空
    const diffs = compareProducts(a, getProduct("na-uka-oil")!);
    const ing = diffs.find((d) => d.label === "主な成分");
    expect(ing?.owned).toBe("記載なし");
  });

  it("どちらが優れているとは書かない", () => {
    const diffs = compareProducts(
      getProduct("lo-hadalabo-gokujyun")!,
      getProduct("lo-curel-lotion3")!,
    );
    for (const d of diffs) {
      for (const v of [d.owned, d.suggested]) {
        expect(v).not.toMatch(/おすすめ|優れ|上位|劣/);
      }
    }
  });
});

describe("続けて様子を見る目安", () => {
  it("すべての商品に目安と根拠がある", () => {
    for (const p of PRODUCTS) {
      const h = usageHorizon(p);
      expect(h.span.length, p.id).toBeGreaterThan(0);
      expect(h.basis.length, p.id).toBeGreaterThan(0);
    }
  });

  it("効果があらわれる期間として書かない", () => {
    for (const p of PRODUCTS) {
      const h = usageHorizon(p);
      expect(isExpressionSafe(h.basis).safe, h.basis).toBe(true);
      expect(h.basis).not.toMatch(/効果|改善|治/);
    }
  });

  it("効果を保証しないことを必ず添える", () => {
    expect(HORIZON_DISCLAIMER).toContain("効果があらわれる期間ではありません");
    expect(HORIZON_DISCLAIMER).toContain("個人差");
  });
});

describe("口コミの取り扱い", () => {
  it("提供元に接続していないことを、そのまま返す", async () => {
    const r = await lookupReviews(getProduct("lo-hadalabo-gokujyun")!);
    expect(r.status).toBe("not_connected");
    if (r.status === "not_connected") {
      expect(r.reason).toContain("利用許諾");
      expect(r.searchLinks.length).toBeGreaterThan(0);
    }
  });

  it("口コミを生成しない（提供元が未設定のまま）", () => {
    // 未検証の実装を置いて「接続済み」に見せないこと自体を固定する
    expect(REVIEW_SOURCES).toHaveLength(0);
  });

  it("利用者が自分で確認しに行けるリンクを出す", () => {
    const links = searchLinksFor(getProduct("lo-hadalabo-gokujyun")!);
    expect(links.some((l) => l.url.includes("cosme.net"))).toBe(true);
    expect(links.some((l) => l.url.includes("rakuten.co.jp"))).toBe(true);
    for (const l of links) expect(l.url).toMatch(/^https:\/\//);
  });
});

describe("公式サイトへの導線", () => {
  it("すべての商品が https の公式URLを持つ", () => {
    for (const p of PRODUCTS) {
      expect(p.officialUrl, p.id).toMatch(/^https:\/\//);
    }
  });
});

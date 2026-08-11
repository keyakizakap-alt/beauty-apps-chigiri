import { describe, expect, it } from "vitest";
import { buildRecommendation } from "@/domain/recommendation/engine";
import { productsInDomain, getProduct } from "@/domain/recommendation/catalog";
import { domainConfig } from "@/domain/recommendation/domains";
import { extractSlotsFromText } from "@/domain/recommendation/text-slots";
import { confidentMatches } from "@/domain/recommendation/product-matcher";
import { evaluateSafety } from "@/domain/recommendation/safety-rules";
import { isExpressionSafe } from "@/domain/recommendation/safety-rules";
import { CONCIERGES } from "@/domain/concierges";
import { DEFAULT_PROFILE, ProfileSchema, type Profile } from "@/schemas/profile";
import type { Domain } from "@/schemas/product";

const profile = (over: Partial<Profile> = {}): Profile =>
  ProfileSchema.parse({ ...DEFAULT_PROFILE, ...over });

const ALL_DOMAINS: Domain[] = [
  "skincare",
  "haircare",
  "bodycare",
  "makeup",
  "nailcare",
];

/** その分野の商品を、役割が重ならないように何点か拾う */
function ownedFor(domain: Domain, count: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of productsInDomain(domain)) {
    if (seen.has(p.category)) continue;
    seen.add(p.category);
    out.push(p.id);
    if (out.length >= count) break;
  }
  return out;
}

describe("相談先と分野の対応", () => {
  it("すべての分野に担当がいる", () => {
    const covered = new Set(CONCIERGES.map((c) => c.domain));
    for (const d of ALL_DOMAINS) expect(covered.has(d), d).toBe(true);
  });

  it("担当ごとに導入とクイック選択肢がある", () => {
    for (const c of CONCIERGES) {
      expect(c.heading.length, c.name).toBeGreaterThan(0);
      expect(c.subheading.length, c.name).toBeGreaterThan(0);
      expect(c.opening.length, c.name).toBeGreaterThan(0);
      expect(c.quickChoices.length, c.name).toBeGreaterThanOrEqual(3);
    }
  });

  it("クイック選択肢が、その分野の条件として読み取れる", () => {
    for (const c of CONCIERGES) {
      const understood = c.quickChoices.filter((q) => {
        const patch = extractSlotsFromText(q, c.domain);
        return (patch.concerns?.length ?? 0) > 0;
      });
      // 「何を使えばいいか分からない」のように条件を含まない選択肢もあるため、
      // 全部ではなく過半数が読み取れることを求める
      expect(understood.length, c.name).toBeGreaterThanOrEqual(
        Math.ceil(c.quickChoices.length / 2),
      );
    }
  });
});

describe("分野ごとのルーティン生成", () => {
  for (const domain of ALL_DOMAINS) {
    const config = domainConfig(domain);

    it(`${config.label}: 手持ちからルーティンを組める`, () => {
      const p = profile({ domain, ownedProductIds: ownedFor(domain, 4) });
      const { recommendation: r } = buildRecommendation(p);
      const steps =
        r.routines.morning.steps.length + r.routines.night.steps.length;
      expect(steps).toBeGreaterThan(0);
    });

    it(`${config.label}: 使用順が分野の定義どおりに並ぶ`, () => {
      const p = profile({
        domain,
        ownedProductIds: ownedFor(domain, 6),
        morningMinutes: 30,
        nightMinutes: 30,
      });
      const { recommendation: r } = buildRecommendation(p);
      for (const routine of [r.routines.morning, r.routines.night]) {
        const idx = routine.steps.map((s) => config.order.indexOf(s.category));
        expect(idx).toEqual([...idx].sort((a, b) => a - b));
      }
    });

    it(`${config.label}: 他分野の商品が混ざらない`, () => {
      const p = profile({
        domain,
        ownedProductIds: ownedFor(domain, 4),
        budgetYen: 8000,
      });
      const { recommendation: r } = buildRecommendation(p);
      const ids = [
        ...r.routines.morning.steps.map((s) => s.productId),
        ...r.routines.night.steps.map((s) => s.productId),
        ...(r.purchaseSuggestion ? [r.purchaseSuggestion.productId] : []),
      ];
      for (const id of ids) {
        expect(getProduct(id)!.domain, id).toBe(domain);
      }
    });

    it(`${config.label}: 手持ちが空でも破綻しない`, () => {
      const p = profile({ domain, ownedProductIds: [] });
      expect(() => buildRecommendation(p)).not.toThrow();
    });

    it(`${config.label}: 生成された文章が禁止表現を含まない`, () => {
      const p = profile({
        domain,
        ownedProductIds: ownedFor(domain, 4),
        budgetYen: 8000,
      });
      const { recommendation: r } = buildRecommendation(p);
      const texts = [
        r.summary,
        ...r.routines.morning.steps.flatMap((s) => [s.purpose, s.reason]),
        ...r.routines.night.steps.flatMap((s) => [s.purpose, s.reason]),
        ...r.unused.map((u) => u.reason),
        r.noPurchaseNeededReason ?? "",
      ];
      for (const t of texts) {
        expect(isExpressionSafe(t).safe, t).toBe(true);
      }
    });

    it(`${config.label}: 同じ入力から同じ結果になる`, () => {
      const p = profile({ domain, ownedProductIds: ownedFor(domain, 4) });
      const a = buildRecommendation(p).recommendation;
      const b = buildRecommendation(p).recommendation;
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  }
});

describe("分野ごとの自然文の読み取り", () => {
  it("ヘア: パサつきと頭皮のべたつきを区別する", () => {
    expect(extractSlotsFromText("髪がパサつきます", "haircare").concerns).toContain(
      "hair_damage",
    );
    expect(
      extractSlotsFromText("頭皮がべたつきます", "haircare").concerns,
    ).toContain("scalp_oiliness");
  });

  it("メイク: 崩れと色落ちを区別する", () => {
    expect(
      extractSlotsFromText("夕方には崩れてしまう", "makeup").concerns,
    ).toContain("makeup_lasting");
    expect(
      extractSlotsFromText("リップの色落ちが早い", "makeup").concerns,
    ).toContain("color_transfer");
  });

  it("ネイル: 二枚爪と手の乾燥を区別する", () => {
    expect(
      extractSlotsFromText("爪が割れやすい・二枚爪になる", "nailcare").concerns,
    ).toContain("nail_brittle");
    expect(
      extractSlotsFromText("手がカサカサする", "nailcare").concerns,
    ).toContain("hand_dryness");
  });

  it("ボディ: ざらつきとにおいを区別する", () => {
    expect(
      extractSlotsFromText("腕のざらつきが気になる", "bodycare").concerns,
    ).toContain("body_roughness");
    expect(
      extractSlotsFromText("汗のにおいが気になる", "bodycare").concerns,
    ).toContain("body_odor");
  });

  it("肌の傾向は、髪や爪の相談では読み取らない", () => {
    expect(extractSlotsFromText("乾燥肌です", "haircare").skinType).toBeUndefined();
    expect(extractSlotsFromText("乾燥肌です", "nailcare").skinType).toBeUndefined();
    expect(extractSlotsFromText("乾燥肌です", "skincare").skinType).toBe("dry");
  });

  it("商品名の同定も分野で絞られる", () => {
    // スキンケアの商品名は、ヘアの相談では拾わない
    expect(
      confidentMatches("極潤ヒアルロン液を使っています", "haircare"),
    ).toHaveLength(0);
    expect(
      confidentMatches("極潤ヒアルロン液を使っています", "skincare").length,
    ).toBeGreaterThan(0);
  });
});

describe("分野ごとの安全ゲート", () => {
  const stopCases: Array<[string, string]> = [
    ["nailcare", "爪に黒い線が出ていて痛みがあります"],
    ["nailcare", "爪が剥がれてしまいました"],
    ["haircare", "頭皮に強いかゆみとできものがあります"],
    ["haircare", "急に髪が抜けるようになりました"],
    ["makeup", "まぶたがただれています"],
  ];

  for (const [domain, text] of stopCases) {
    it(`${domain}: 「${text}」では推薦を止める`, () => {
      expect(evaluateSafety(text).kind).toBe("stop");
    });
  }

  it("通常の相談は止めない", () => {
    for (const t of [
      "髪のパサつきが気になります",
      "爪が割れやすいです",
      "夕方にメイクが崩れます",
      "腕がざらつきます",
    ]) {
      expect(evaluateSafety(t).kind, t).toBe("ok");
    }
  });
});

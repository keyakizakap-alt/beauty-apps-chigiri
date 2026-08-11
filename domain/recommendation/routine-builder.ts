import type { Category, Domain, UsageTiming } from "@/schemas/product";
import type {
  Gap,
  Routine,
  RoutineStep,
  UnusedProduct,
} from "@/schemas/recommendation";
import type { Profile } from "@/schemas/profile";
import { claimSentence } from "./catalog";
import { CATEGORY_LABEL, domainConfig, type Requirement } from "./domains";
import type { ScoredProduct } from "./scorer";

/**
 * ルーティン生成。
 * 使用順・必須カテゴリー・所要時間は決定論的に確定させる。
 * LLM はここで確定した並びを説明するだけで、並びを変えることはできない。
 */

/** 決定論的な採用理由（LLM が失敗してもこの文章で成立する） */
function deterministicReason(
  item: ScoredProduct,
  profile: Profile,
  category: Category,
): string {
  const p = item.product;
  const parts: string[] = [];

  const matchedConcerns = profile.concerns.filter((c) =>
    p.concernTags.includes(c),
  );
  if (matchedConcerns.length > 0) {
    parts.push(
      `関心として挙げた${matchedConcerns.map((c) => CONCERN_LABEL[c]).join("・")}に対応するタグを持つため`,
    );
  }
  if (p.skinTags.includes(profile.skinType)) {
    parts.push(`${SKIN_LABEL[profile.skinType]}向けの表示があるため`);
  }
  if (item.owned) {
    parts.push("すでに手元にあり追加費用がかからないため");
  }
  parts.push(`${CATEGORY_LABEL[category]}の役割を単独で満たせるため`);

  return `${parts.join("、")}、この工程に採用しました。公式に確認できる表現は「${claimSentence(p)}」です。`;
}

export const CONCERN_LABEL: Record<string, string> = {
  dryness: "乾燥",
  oiliness: "皮脂・テカリ",
  pores: "毛穴",
  dullness: "くすみ",
  acne_prone: "ニキビができやすい",
  texture: "ざらつき・キメ",
  firmness: "ハリ",
  uv_protection: "紫外線対策",
  redness: "赤み",
  sensitivity: "ゆらぎ・敏感",
  // ヘア・頭皮
  hair_damage: "髪のダメージ",
  frizz: "広がり・うねり",
  hair_volume: "ボリューム・コシ",
  scalp_dryness: "頭皮の乾燥",
  scalp_oiliness: "頭皮のべたつき",
  dandruff: "フケ・かゆみ",
  hair_color_care: "カラーの色持ち",
  hair_gloss: "髪のつや",
  // ボディ
  body_roughness: "ざらつき",
  body_odor: "汗のにおい",
  // メイク
  makeup_lasting: "メイクの持ち",
  color_transfer: "色移り・色落ち",
  shine_control: "テカリ",
  coverage: "カバー力",
  dewy_look: "ツヤのある仕上がり",
  // ネイル・ハンド
  nail_brittle: "爪の割れ・二枚爪",
  nail_dryness: "爪の乾燥",
  hand_dryness: "手の乾燥",
  cuticle_care: "甘皮・ささくれ",
};

export const SKIN_LABEL: Record<string, string> = {
  dry: "乾燥肌",
  oily: "脂性肌",
  combination: "混合肌",
  normal: "普通肌",
  sensitive: "敏感肌",
};

const CAUTION_LABEL: Record<string, string> = {
  contains_alcohol: "アルコール(エタノール)を含みます",
  contains_fragrance: "香料を含みます",
  contains_essential_oil: "精油を含みます",
  exfoliating: "角質ケア成分を含むため、使用頻度に注意してください",
  reapply_needed: "汗や皮脂で落ちるため、日中の塗り直しが必要です",
  patch_test_recommended: "初めて使う場合はパッチテストをおすすめします",
  may_feel_heavy: "重さを感じる場合があります",
  may_feel_drying: "乾燥を感じる場合があります",
};

export function cautionMessages(cautionTags: readonly string[]): string[] {
  return cautionTags.map((c) => CAUTION_LABEL[c] ?? c);
}

export type BuildRoutineResult = {
  routine: Routine;
  /** 時間の都合で外した商品 */
  trimmed: UnusedProduct[];
  /** このタイミングで不足しているカテゴリー */
  gaps: Gap[];
};

/**
 * 1 タイミング分のルーティンを組み立てる。
 *
 * @param groups カテゴリーごとのスコア順候補。
 *   このタイミングに対応する商品のうち最上位を採用する。
 *   最上位商品が夜専用でも、朝に使える次点があれば朝はそちらを使う。
 */
export function buildRoutine(
  timing: UsageTiming,
  groups: ReadonlyMap<Category, readonly ScoredProduct[]>,
  profile: Profile,
  domain: Domain,
): BuildRoutineResult {
  const config = domainConfig(domain);
  const budgetMinutes =
    timing === "morning" ? profile.morningMinutes : profile.nightMinutes;

  const requirements = config.requirements[timing];
  const gaps: Gap[] = [];
  const timingLabel = config.timingLabel[timing];

  type Candidate = {
    category: Category;
    severity: Requirement["severity"];
    item: ScoredProduct;
  };
  const candidates: Candidate[] = [];

  for (const req of requirements) {
    const group = groups.get(req.category) ?? [];
    // このタイミングで使える最上位の候補を選ぶ
    const item = group.find((c) => c.product.usageTiming.includes(timing));

    if (!item) {
      if (req.severity !== "optional") {
        gaps.push({
          category: req.category,
          timing,
          severity: req.severity,
          note:
            group.length === 0
              ? `${timingLabel}のルーティンに${CATEGORY_LABEL[req.category]}の役割がありません。`
              : `お持ちの${CATEGORY_LABEL[req.category]}は公式の使用タイミングが${timingLabel}向けではないため、${timingLabel}に使えるものがありません。`,
        });
      }
      continue;
    }
    candidates.push({ category: req.category, severity: req.severity, item });
  }

  // 工程過多ペナルティ：使える時間に収まるまで optional → recommended の順に外す
  const trimmed: UnusedProduct[] = [];
  const selected = [...candidates];
  const stepMinutes = (c: Category) => config.minutes[c] ?? 1;
  const totalMinutes = () =>
    selected.reduce((sum, c) => sum + stepMinutes(c.category), 0);

  const trimOrder: Array<Requirement["severity"]> = ["optional", "recommended"];
  for (const severity of trimOrder) {
    while (totalMinutes() > budgetMinutes) {
      // 同 severity の中で最もスコアの低いものから外す
      const removable = selected
        .filter((c) => c.severity === severity)
        .sort((a, b) => a.item.score - b.item.score);
      if (removable.length === 0) break;
      const victim = removable[0];
      selected.splice(selected.indexOf(victim), 1);
      trimmed.push({
        productId: victim.item.product.id,
        reasonCode: "time_budget",
        reason: `${timingLabel}に使える時間が${budgetMinutes}分のため、省略しても成立する${CATEGORY_LABEL[victim.category]}の工程を今回は外しました。時間に余裕がある日は追加してください。`,
      });
    }
  }

  // 使用順は分野ごとの定義に固定する
  selected.sort(
    (a, b) =>
      config.order.indexOf(a.category) - config.order.indexOf(b.category),
  );

  const steps: RoutineStep[] = selected.map((c, i) => ({
    order: i + 1,
    productId: c.item.product.id,
    category: c.category,
    purpose: config.purpose[c.category] ?? "この工程",
    reason: deterministicReason(c.item, profile, c.category),
    cautions: cautionMessages(c.item.product.cautionTags),
    score: c.item.score,
  }));

  return {
    routine: {
      timing,
      steps,
      budgetMinutes,
      estimatedMinutes: selected.reduce(
        (sum, c) => sum + stepMinutes(c.category),
        0,
      ),
    },
    trimmed,
    gaps,
  };
}

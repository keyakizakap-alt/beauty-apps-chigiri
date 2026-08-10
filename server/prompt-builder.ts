import "server-only";
import type { Profile } from "@/schemas/profile";
import type { Recommendation } from "@/schemas/recommendation";
import { CATEGORY_LABEL, claimText, getProduct } from "@/domain/recommendation/catalog";
import { CONCERN_LABEL, SKIN_LABEL } from "@/domain/recommendation/routine-builder";
import { INGREDIENT_LABEL, TEXTURE_LABEL } from "@/domain/recommendation/filters";

/**
 * プロンプト構築。
 *
 * 方針:
 * - 商品カタログ全体を毎回送らない。確定済みの数点だけを送る。
 * - LLM に許可する商品 ID を明示し、それ以外を出力しないよう制約する。
 * - 効能表現はホワイトリストで渡した文言の範囲内に限定する。
 */

const SAFETY_RULES = `
必ず守る制約:
- あなたは医療者ではありません。診断・治療・病名の言及をしてはいけません。
- 「治る」「改善する」「完治」「効果があります」「必ず」「絶対安全」「副作用がない」などの断定表現を使ってはいけません。
- 与えられた「使用できる表現」以外の効能を書いてはいけません。
- 成分の配合濃度を推測してはいけません。価格を推測してはいけません。
- 与えられた商品ID以外のIDを出力してはいけません。新しい商品を創作してはいけません。
- 商品の使用順・採用可否は既に決定済みです。変更や再提案をしてはいけません。
- 出力は必ず指定された JSON のみ。前置き・後書き・コードフェンスを付けないでください。
`.trim();

/* ------------------------------------------------------------------ *
 * 1. 自然文 → プロファイル（構造化）
 * ------------------------------------------------------------------ */

export const SLOT_EXTRACTION_SYSTEM = `
あなたは美容ルーティン設計サービスの入力整理担当です。
ユーザーの自然文から、指定された項目だけを抽出して JSON で返します。
書かれていない項目は絶対に推測せず、キー自体を省略してください。

${SAFETY_RULES}

出力する JSON の形（すべて任意。読み取れた項目だけを含める）:
{
  "skinType": "dry" | "oily" | "combination" | "normal" | "sensitive",
  "concerns": ["dryness"|"oiliness"|"pores"|"dullness"|"acne_prone"|"texture"|"firmness"|"uv_protection"|"redness"|"sensitivity"],
  "avoidTextures": ["watery"|"light"|"rich"|"gel"|"milky"|"balm"|"foam"|"oily_finish"|"matte_finish"|"dewy_finish"|"fragrance_free"|"fragranced"|"non_sticky"|"sticky"],
  "avoidIngredients": ["hyaluronic_acid"|"ceramide"|"niacinamide"|"vitamin_c_derivative"|"amino_acid"|"centella"|"glycerin"|"squalane"|"panthenol"|"mineral_uv"|"chemical_uv"|"salicylic_acid"|"clay"|"aha"|"alcohol"|"fragrance"|"essential_oil"],
  "budgetYen": 整数,
  "morningMinutes": 整数,
  "nightMinutes": 整数,
  "allowPurchase": true | false,
  "maxNewItems": 0 | 1 | 2 | 3
}

注意:
- concerns はユーザーが気にしている順に並べてください。
- 「香りが苦手」は avoidIngredients に "fragrance"、「ベタつくのが嫌」は avoidTextures に "sticky" を入れます。
- 「アルコールでヒリヒリする」は avoidIngredients に "alcohol" を入れます。
- 予算は「3000円まで」なら 3000。「買い足したくない」なら allowPurchase=false。
`.trim();

export function buildSlotExtractionPrompt(
  message: string,
  current: Profile,
): string {
  return [
    "現在わかっている設定（変更が読み取れた項目だけ上書きする）:",
    JSON.stringify(
      {
        skinType: current.skinType,
        concerns: current.concerns,
        avoidTextures: current.avoidTextures,
        avoidIngredients: current.avoidIngredients,
        budgetYen: current.budgetYen,
        morningMinutes: current.morningMinutes,
        nightMinutes: current.nightMinutes,
        allowPurchase: current.allowPurchase,
        maxNewItems: current.maxNewItems,
      },
      null,
      0,
    ),
    "",
    "ユーザーの発言:",
    message,
  ].join("\n");
}

/* ------------------------------------------------------------------ *
 * 2. 決定済みルーティン → 説明文
 * ------------------------------------------------------------------ */

export const EXPLANATION_SYSTEM = `
あなたは美容ルーティンの説明担当です。
商品の選定・使用順・採用可否はすでにアルゴリズムで確定しています。
あなたの仕事は、確定した内容を日本語で分かりやすく説明することだけです。

${SAFETY_RULES}

出力する JSON の形:
{
  "summary": "結果全体の要約。手持ちを何点活用でき、買い足しが何点で、何を避けられたかを1〜3文で。",
  "steps": [{ "productId": "許可されたID", "purpose": "この工程の目的(60字以内)", "reason": "なぜこの商品をここに置いたか(120字以内)" }],
  "duplicationNotes": [{ "category": "カテゴリー名", "note": "重複の説明(120字以内)" }],
  "unusedNotes": [{ "productId": "許可されたID", "reason": "今回使わない理由(120字以内)" }],
  "purchaseReason": "買い足し1点の理由(150字以内)。買い足しがない場合は null"
}

文体:
- 落ち着いた敬体。煽らない。断定しない。
- 「〜という表示があります」「〜とされています」のように、根拠の範囲を超えない書き方をする。
- ユーザーを否定しない。使っていない商品も「無駄だった」と書かない。
`.trim();

/**
 * 説明用のコンパクトなコンテキストを作る。
 * カタログ全体ではなく、確定した商品だけを渡す（コストと逸脱の抑制）。
 */
export function buildExplanationPrompt(
  profile: Profile,
  rec: Omit<Recommendation, "ai">,
  allowedProductIds: string[],
): string {
  const productLine = (id: string) => {
    const p = getProduct(id);
    if (!p) return null;
    return {
      id: p.id,
      名称: `${p.brand} ${p.name}`,
      役割: CATEGORY_LABEL[p.category],
      使用できる表現: p.allowedClaims
        .map((c) => claimText(c))
        .filter(Boolean),
      注意: p.cautionTags,
      価格: p.price,
      手持ち: profile.ownedProductIds.includes(p.id),
    };
  };

  const unusedIds = rec.unused.map((u) => u.productId);
  const referenced = [...new Set([...allowedProductIds, ...unusedIds])];

  const context = {
    ユーザー条件: {
      肌傾向: SKIN_LABEL[profile.skinType],
      関心: profile.concerns.map((c) => CONCERN_LABEL[c]),
      避けたい使用感: profile.avoidTextures.map((t) => TEXTURE_LABEL[t] ?? t),
      避けたい成分: profile.avoidIngredients.map((i) => INGREDIENT_LABEL[i] ?? i),
      予算: profile.budgetYen,
      朝に使える時間: `${profile.morningMinutes}分`,
      夜に使える時間: `${profile.nightMinutes}分`,
    },
    確定した朝のルーティン: rec.routines.morning.steps.map((s) => ({
      順番: s.order,
      id: s.productId,
      役割: CATEGORY_LABEL[s.category],
    })),
    確定した夜のルーティン: rec.routines.night.steps.map((s) => ({
      順番: s.order,
      id: s.productId,
      役割: CATEGORY_LABEL[s.category],
    })),
    役割が重複した商品: rec.duplications.map((d) => ({
      役割: CATEGORY_LABEL[d.category],
      採用: d.keptProductId,
      今回使わない: d.duplicateProductIds,
    })),
    今回使わない商品: rec.unused.map((u) => ({
      id: u.productId,
      理由コード: u.reasonCode,
    })),
    不足している役割: rec.gaps.map((g) => ({
      役割: CATEGORY_LABEL[g.category],
      タイミング: g.timing === "morning" ? "朝" : "夜",
      重要度: g.severity,
    })),
    買い足し候補: rec.purchaseSuggestion
      ? {
          id: rec.purchaseSuggestion.productId,
          役割: CATEGORY_LABEL[rec.purchaseSuggestion.category],
          価格: rec.purchaseSuggestion.price,
        }
      : null,
    集計: {
      手持ち活用: `${rec.savings.ownedUsedCount}/${rec.savings.ownedTotalCount}`,
      買い足し点数: rec.savings.newItemCount,
      追加費用: rec.savings.additionalCostYen,
      避けられた購入点数: rec.savings.avoidedItemCount,
      避けられた推定金額: rec.savings.avoidedCostYen,
    },
    商品情報: referenced.map(productLine).filter(Boolean),
  };

  return [
    `出力してよい productId は次のものだけです: ${referenced.join(", ")}`,
    "これ以外の ID を書いた場合、その出力は破棄されます。",
    "",
    JSON.stringify(context, null, 0),
  ].join("\n");
}

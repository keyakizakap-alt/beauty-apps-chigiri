import { NextResponse } from "next/server";
import { z } from "zod";
import { CategorySchema } from "@/schemas/product";
import {
  CATEGORY_LABEL,
  getProduct,
  isKnownProductId,
} from "@/domain/recommendation/catalog";
import { guardJsonRequest, invalidInput, isFailure } from "@/server/api-guard";
import { RATE_LIMITS } from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/b2b/duplicate-check
 *
 * 化粧品 EC 向けの「重複購入防止」API（設計書 §19 の収益モデル3番目）。
 *
 * カート内の商品と、購入者がすでに持っている商品を受け取り、
 * 役割が重複していないかを返す。EC 側はこの結果を購入前に表示できる。
 *
 * 立ち位置:
 *   一般的なレコメンドAPIは「もっと買わせる」ために使われる。
 *   これはその逆で、「その買い物は要りますか」を返す。
 *   返品率と、買ったのに使われない在庫を減らすことが価値になる。
 *
 * この API は:
 *   - LLM を呼ばない（決定論的な判定のみ。応答が安定し、費用もかからない）
 *   - 個人情報を受け取らない（商品 ID だけ。肌の悩みや氏名は要求しない）
 *   - 何も保存しない
 */

const RequestSchema = z.object({
  /** 購入しようとしている商品 */
  cart: z
    .array(
      z.object({
        productId: z.string().min(1).max(120),
        quantity: z.number().int().min(1).max(99).default(1),
      }),
    )
    .min(1)
    .max(50),
  /** 購入者がすでに持っている商品 */
  owned: z.array(z.string().min(1).max(120)).max(200).default([]),
  /** 未開封で残っている在庫があるカテゴリー（任意） */
  unopenedCategories: z.array(CategorySchema).max(10).default([]),
});

const VerdictSchema = z.enum([
  "duplicate_role",
  "already_owned",
  "unopened_stock",
  "unknown_product",
  "no_conflict",
]);

const VERDICT_MESSAGE: Record<z.infer<typeof VerdictSchema>, string> = {
  duplicate_role:
    "すでに同じ役割の商品をお持ちです。使い切ってからの購入でも間に合う可能性があります。",
  already_owned: "同じ商品をすでにお持ちの登録があります。",
  unopened_stock:
    "同じ役割の未開封在庫が残っています。開封してから判断しても遅くありません。",
  unknown_product:
    "この商品はカタログに存在しないため、重複の判定ができませんでした。",
  no_conflict: "手持ちと役割が重複していません。",
};

export async function POST(req: Request) {
  const guarded = await guardJsonRequest(req, "b2b", RATE_LIMITS.b2b);
  if (isFailure(guarded)) return guarded.response;

  const parsed = RequestSchema.safeParse(guarded.body);
  if (!parsed.success) return invalidInput();

  const { cart, owned, unopenedCategories } = parsed.data;

  const ownedSet = new Set(owned.filter(isKnownProductId));
  const ownedCategories = new Map<string, string[]>();
  for (const id of ownedSet) {
    const p = getProduct(id);
    if (!p) continue;
    ownedCategories.set(p.category, [
      ...(ownedCategories.get(p.category) ?? []),
      id,
    ]);
  }
  const unopened = new Set(unopenedCategories);

  const items = cart.map((line) => {
    const product = getProduct(line.productId);

    if (!product) {
      return {
        productId: line.productId,
        verdict: "unknown_product" as const,
        message: VERDICT_MESSAGE.unknown_product,
        conflictingOwnedIds: [],
        category: null,
      };
    }

    if (ownedSet.has(product.id)) {
      return {
        productId: product.id,
        category: product.category,
        verdict: "already_owned" as const,
        message: VERDICT_MESSAGE.already_owned,
        conflictingOwnedIds: [product.id],
      };
    }

    if (unopened.has(product.category)) {
      return {
        productId: product.id,
        category: product.category,
        verdict: "unopened_stock" as const,
        message: VERDICT_MESSAGE.unopened_stock,
        conflictingOwnedIds: ownedCategories.get(product.category) ?? [],
      };
    }

    const sameRole = ownedCategories.get(product.category) ?? [];
    if (sameRole.length > 0) {
      return {
        productId: product.id,
        category: product.category,
        verdict: "duplicate_role" as const,
        message: `${CATEGORY_LABEL[product.category]}は${VERDICT_MESSAGE.duplicate_role}`,
        conflictingOwnedIds: sameRole,
      };
    }

    return {
      productId: product.id,
      category: product.category,
      verdict: "no_conflict" as const,
      message: VERDICT_MESSAGE.no_conflict,
      conflictingOwnedIds: [],
    };
  });

  const flagged = items.filter(
    (i) => i.verdict !== "no_conflict" && i.verdict !== "unknown_product",
  );

  // 重複と判定した商品の金額。EC 側が「見送ると◯円」と出せるようにする。
  const avoidableYen = flagged.reduce((sum, i) => {
    const p = getProduct(i.productId);
    const line = cart.find((c) => c.productId === i.productId);
    return sum + (p ? p.price * (line?.quantity ?? 1) : 0);
  }, 0);

  return NextResponse.json({
    items,
    summary: {
      cartSize: cart.length,
      flaggedCount: flagged.length,
      avoidableYen,
      recommendation:
        flagged.length === 0
          ? "重複はありません。"
          : `${flagged.length}点が手持ちと役割で重複しています。見送ると約${avoidableYen.toLocaleString()}円の購入を避けられます。`,
    },
    /** この判定に AI は使っていない（応答が安定し、費用もかからない） */
    deterministic: true,
  });
}

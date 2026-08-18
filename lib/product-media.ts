"use client";

import { createContext, useContext } from "react";
import type { ProductMedia } from "@/schemas/media";

/**
 * 画面内で共有する商品写真の対応表。
 *
 * サムネイル1つずつが取得しにいくと、外部APIの毎秒1リクエスト制限に
 * すぐ当たる。画面の入口でまとめて引き、ここから配る。
 *
 * 未取得・取得失敗は「無い」として扱い、ProductThumb は図案を出す。
 * 読み込み中に枠だけ差し替えるようなことはしない
 * （写真が来ないほうが普通なので、そのたびに画面が揺れる）。
 */

export type ProductMediaMap = ReadonlyMap<string, ProductMedia>;

const EMPTY: ProductMediaMap = new Map();

export const ProductMediaContext = createContext<ProductMediaMap>(EMPTY);

export function useProductMedia(productId: string): ProductMedia | null {
  return useContext(ProductMediaContext).get(productId) ?? null;
}

/**
 * 入れ子の結果オブジェクトから商品 id を集める。
 *
 * 提案・ルーティンの工程・次点候補と、id の置き場所が複数あるため、
 * 場所を数え上げるのではなく productId という名前を拾う。
 * 項目が増えたときに拾い漏れて写真が出なくなるのを避けるため。
 */
export function collectProductIds(value: unknown, depth = 0): string[] {
  if (depth > 8 || value === null || typeof value !== "object") return [];

  const out: string[] = [];
  if (Array.isArray(value)) {
    for (const v of value) out.push(...collectProductIds(v, depth + 1));
    return out;
  }

  for (const [key, v] of Object.entries(value)) {
    if (key === "productId" && typeof v === "string") {
      out.push(v);
    } else if (
      (key === "ownedProductIds" || key === "productIds") &&
      Array.isArray(v)
    ) {
      out.push(...v.filter((x): x is string => typeof x === "string"));
    } else {
      out.push(...collectProductIds(v, depth + 1));
    }
  }
  return out;
}

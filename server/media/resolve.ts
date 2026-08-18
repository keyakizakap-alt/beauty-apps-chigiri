import "server-only";
import { getProduct } from "@/domain/recommendation/catalog";
import { ProductMediaSchema, type ProductMedia } from "@/schemas/media";
import type { Product } from "@/schemas/product";
import { readCache, writeCache } from "./cache";
import { AMAZON_BATCH_SIZE, fetchAmazonMedia, isAmazonConfigured } from "./amazon";
import { fetchRakutenMedia, isRakutenConfigured } from "./rakuten";

/**
 * 商品 id から表示用の画像情報を解決する。
 *
 * 優先順位:
 *   1. 楽天（itemCode か JAN が入っているもの）
 *   2. Amazon（ASIN が入っているもの）
 *
 * 楽天を先に見るのは、アプリIDの取得だけで使い始められて、
 * 利用資格が失われにくいため。どちらも引けなければ結果に含めない。
 * 呼び出し側は「引けなかった」を図案の表示として扱う。
 *
 * 識別子が入っていない商品は照会しない。
 * キーワード検索で似た商品の写真を出すより、図案のままのほうがよい。
 */

export function isMediaConfigured(): boolean {
  return isRakutenConfigured() || isAmazonConfigured();
}

function cacheKeyFor(productId: string): string {
  return `media:${productId}`;
}

/** 外部APIを引く価値がある（識別子を持っている）商品か */
export function hasExternalId(p: Product): boolean {
  return Boolean(p.rakutenItemCode || p.jan || p.asin);
}

export async function resolveProductMedia(
  productIds: readonly string[],
): Promise<ProductMedia[]> {
  if (!isMediaConfigured()) return [];

  const resolved: ProductMedia[] = [];
  const pending: Product[] = [];

  for (const id of new Set(productIds)) {
    const cached = readCache<ProductMedia>(cacheKeyFor(id));
    if (cached) {
      resolved.push(cached);
      continue;
    }
    const product = getProduct(id);
    if (product && hasExternalId(product)) pending.push(product);
  }

  if (pending.length === 0) return resolved;

  // 1. 楽天。1件ずつの照会になるため、間隔制御に任せて順に投げる
  const remaining: Product[] = [];
  if (isRakutenConfigured()) {
    for (const p of pending) {
      if (!p.rakutenItemCode && !p.jan) {
        remaining.push(p);
        continue;
      }
      const media = await fetchRakutenMedia(p.id, {
        itemCode: p.rakutenItemCode ?? undefined,
        jan: p.jan ?? undefined,
      });
      if (media) {
        remember(media, resolved);
      } else {
        remaining.push(p);
      }
    }
  } else {
    remaining.push(...pending);
  }

  // 2. Amazon。まとめて照会できるので 10 件ずつに割る
  if (isAmazonConfigured()) {
    const withAsin = remaining.filter((p) => p.asin);
    for (let i = 0; i < withAsin.length; i += AMAZON_BATCH_SIZE) {
      const chunk = withAsin.slice(i, i + AMAZON_BATCH_SIZE);
      const map = new Map(chunk.map((p) => [p.asin as string, p.id]));
      const found = await fetchAmazonMedia(map);
      for (const media of found) remember(media, resolved);
    }
  }

  return resolved;
}

/**
 * 自分で組み立てた値でも、クライアントへ返す前に必ず形を確かめる。
 * 外部応答の変化がそのまま画面へ流れないようにするため。
 */
function remember(media: ProductMedia, out: ProductMedia[]): void {
  const parsed = ProductMediaSchema.safeParse(media);
  if (!parsed.success) return;
  writeCache(cacheKeyFor(parsed.data.productId), parsed.data);
  out.push(parsed.data);
}

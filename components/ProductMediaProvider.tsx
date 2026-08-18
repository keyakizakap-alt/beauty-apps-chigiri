"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ProductMediaResponseSchema,
  type ProductMedia,
} from "@/schemas/media";
import { ProductMediaContext, type ProductMediaMap } from "@/lib/product-media";

/**
 * 画面に出る商品の写真を、まとめて1回だけ引く。
 *
 * 外部APIは毎秒1リクエストが上限なので、サムネイル側からは呼ばない。
 * 失敗しても何も起きない（図案のまま）。読み込み中の表示も出さない。
 */
export default function ProductMediaProvider({
  productIds,
  children,
}: {
  productIds: readonly string[];
  children: React.ReactNode;
}) {
  const [media, setMedia] = useState<ProductMediaMap>(() => new Map());

  // 並び順の違いだけで引き直さないよう、id を正規化して依存に使う
  const key = useMemo(
    () => [...new Set(productIds)].sort().join(","),
    [productIds],
  );

  useEffect(() => {
    const ids = key.length > 0 ? key.split(",") : [];
    if (ids.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/product-media", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // 1回のリクエストで受け付ける上限に合わせる
          body: JSON.stringify({ productIds: ids.slice(0, 30) }),
        });
        if (!res.ok) return;
        const parsed = ProductMediaResponseSchema.safeParse(await res.json());
        if (!parsed.success || cancelled) return;

        setMedia(
          new Map(parsed.data.media.map((m: ProductMedia) => [m.productId, m])),
        );
      } catch {
        // 写真が出ないだけ。ここで画面を壊さない
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key]);

  return (
    <ProductMediaContext.Provider value={media}>
      {children}
    </ProductMediaContext.Provider>
  );
}

"use client";

import {
  brandInitial,
  geometryForShape,
  productImagePath,
  shapeForCategory,
  toneForBrand,
} from "@/domain/recommendation/product-image";
import type { Category } from "@/schemas/product";
import { PROVIDER_ATTRIBUTION } from "@/schemas/media";
import { useProductMedia } from "@/lib/product-media";

/**
 * 商品のサムネイル。出すものの優先順位:
 *
 *   1. public/products/ に置いた自分の写真（許諾を確認して置いたもの）
 *   2. 外部サービス（楽天・Amazon）から引いた写真
 *   3. 役割とブランドから決まる線画
 *
 * 2 は各社の CDN から配信する。規約上、取得した画像を自分の配信元へ
 * 保存し直すことはできないため。出典の表記が要るので、詳細画面
 * （caption 付き）では提供元を明記する。
 *
 * 3 は写真ではないので、詳細画面では未登録であることを明記する。
 *
 * 一覧では図案そのものに意味を持たせない（隣に必ずブランド名と商品名が
 * 並ぶ）ため aria-hidden にし、読み上げの邪魔をしない。
 */

export type ThumbSubject = {
  id?: string;
  brand: string;
  name: string;
  category: Category;
  imagePath?: string | null;
};

export default function ProductThumb({
  product,
  size = 56,
  caption = false,
  className = "",
}: {
  product: ThumbSubject;
  /** 一辺の長さ(px) */
  size?: number;
  /** 出典・未登録の別を図案の下に明記する（詳細画面向け） */
  caption?: boolean;
  className?: string;
}) {
  const ownPhoto = productImagePath(product.imagePath);
  const external = useProductMedia(product.id ?? "");

  const photo = ownPhoto ?? external?.imageUrl ?? null;
  // 自分で正方形に整えた写真は切り抜き、外部の写真は全体を収める
  const fitClass = ownPhoto ? "object-cover" : "object-contain";

  const tone = toneForBrand(product.brand);
  const geo = geometryForShape(shapeForCategory(product.category));
  const initial = brandInitial(product.brand);

  // ボタンの中に置く箇所があるため、要素はすべてフレージング・コンテンツにする
  return (
    <span className={`block ${className}`}>
      <span
        className="block overflow-hidden rounded-xl border border-black/[0.06]"
        style={{
          width: size,
          height: size,
          // 写真は白地に収めて取り込むため、下地の色は敷かない
          backgroundColor: photo ? "#FFFFFF" : tone.bg,
        }}
      >
        {photo ? (
          // 自分の配信元の画像か、CSP で許可した提供元の画像のみ。
          // 経路の検証は productImagePath と server/media/* で済ませている
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={`${product.brand} ${product.name}`}
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            // 提供元へ閲覧経路を渡さない
            referrerPolicy="no-referrer"
            className={`h-full w-full ${fitClass}`}
          />
        ) : (
          <svg
            viewBox="0 0 64 64"
            width={size}
            height={size}
            aria-hidden
            focusable="false"
          >
            <g
              fill={tone.ink}
              fillOpacity={0.12}
              stroke={tone.ink}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {geo.solid.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
            <g
              fill="none"
              stroke={tone.ink}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.75}
            >
              {geo.line.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
            {size >= 48 && initial && (
              <text
                x={53}
                y={58}
                textAnchor="middle"
                fontSize={11}
                fill={tone.ink}
                fillOpacity={0.5}
              >
                {initial}
              </text>
            )}
          </svg>
        )}
      </span>

      {caption && (
        <span className="mt-1 block text-center text-[10px] leading-tight text-sumi/45">
          {photo === null
            ? "写真未登録"
            : external && !ownPhoto
              ? PROVIDER_ATTRIBUTION[external.provider]
              : "公式配布素材"}
        </span>
      )}
    </span>
  );
}

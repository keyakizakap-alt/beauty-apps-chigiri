import {
  brandInitial,
  geometryForShape,
  productImagePath,
  shapeForCategory,
  toneForBrand,
} from "@/domain/recommendation/product-image";
import type { Category } from "@/schemas/product";

/**
 * 商品のサムネイル。
 *
 * public/products/ に写真が置かれていればそれを出し、無ければ
 * 役割とブランドから決まる線画を出す。線画は写真ではないので、
 * 詳細画面（caption 付き）では未登録であることを明記する。
 *
 * 一覧では図案そのものに意味を持たせない（隣に必ずブランド名と商品名が
 * 並ぶ）ため aria-hidden にし、読み上げの邪魔をしない。
 */

export type ThumbSubject = {
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
  /** 写真が未登録であることを図案の下に明記する（詳細画面向け） */
  caption?: boolean;
  className?: string;
}) {
  const photo = productImagePath(product.imagePath);
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
          // 自分の配信元に置いた画像のみ。外部ホストは productImagePath が弾く
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={`${product.brand} ${product.name}`}
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
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

      {caption && !photo && (
        <span className="mt-1 block text-center text-[10px] leading-tight text-sumi/45">
          写真未登録
        </span>
      )}
    </span>
  );
}

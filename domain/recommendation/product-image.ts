import type { Category } from "@/schemas/product";

/**
 * 商品のビジュアル。
 *
 * 実写真の扱い:
 *   ブランドの商品写真は各社の著作物なので、公式が配布しているものを
 *   許諾のうえで自分の配信元（public/products/）に置いたときだけ表示する。
 *   外部ホストへの直リンクはしない（CSP の img-src を 'self' data: に保つ）。
 *   置かれるまでの間、商品の見た目を推測した画像は作らない。
 *
 * 写真が無いときに出すもの:
 *   役割（化粧水・チューブ等）とブランドから決まる線画。
 *   これは商品の写真ではなく、一覧を見分けるための図案。
 *   撮影物に似せず線画に留め、詳細画面では未登録である旨を併記する。
 *
 * 同じ商品には必ず同じ図案が出る（ランダム性を持たせない）。
 * 一覧を上下にスクロールするたびに絵が変わると、見分ける手がかりにならないため。
 */

/* ------------------------------------------------------------------ *
 * 容器の形
 * ------------------------------------------------------------------ */

export type ThumbShape =
  | "pump"
  | "tall"
  | "dropper"
  | "jar"
  | "tube"
  | "wide"
  | "compact"
  | "stick";

/**
 * 役割ごとの容器の形。
 * 実際にその容器で売られていることが多いものを選んでいるが、
 * 個々の商品の容器を再現するものではない。
 */
const SHAPE_BY_CATEGORY: Record<Category, ThumbShape> = {
  // スキンケア
  cleanser: "pump",
  lotion: "tall",
  serum: "dropper",
  moisturizer: "jar",
  sunscreen: "tube",
  // ヘア・頭皮ケア
  shampoo: "wide",
  conditioner: "wide",
  hair_treatment: "jar",
  scalp_care: "dropper",
  hair_outbath: "tall",
  // ボディケア
  body_wash: "pump",
  body_moisturizer: "jar",
  body_special: "tube",
  // メイク
  makeup_remover: "pump",
  makeup_base: "tube",
  foundation: "tube",
  face_powder: "compact",
  lip: "stick",
  eye_makeup: "stick",
  // ネイル・ハンド
  hand_wash: "pump",
  hand_cream: "tube",
  nail_oil: "dropper",
  nail_base: "jar",
};

export function shapeForCategory(category: Category): ThumbShape {
  return SHAPE_BY_CATEGORY[category] ?? "tall";
}

/* ------------------------------------------------------------------ *
 * 図形（viewBox 0 0 64 64）
 * ------------------------------------------------------------------ */

/** 角丸長方形のパス */
function rr(x: number, y: number, w: number, h: number, r: number): string {
  const k = Math.min(r, w / 2, h / 2);
  return [
    `M${x + k} ${y}`,
    `H${x + w - k}`,
    `A${k} ${k} 0 0 1 ${x + w} ${y + k}`,
    `V${y + h - k}`,
    `A${k} ${k} 0 0 1 ${x + w - k} ${y + h}`,
    `H${x + k}`,
    `A${k} ${k} 0 0 1 ${x} ${y + h - k}`,
    `V${y + k}`,
    `A${k} ${k} 0 0 1 ${x + k} ${y}`,
    "Z",
  ].join(" ");
}

/** 円のパス */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
}

export type ThumbGeometry = {
  /** 閉じた輪郭。うすく塗ってから線を引く */
  solid: string[];
  /** 開いた線。塗らずに線だけ引く */
  line: string[];
};

const GEOMETRY: Record<ThumbShape, ThumbGeometry> = {
  pump: {
    solid: [rr(20, 27, 24, 29, 6), rr(29, 19, 6, 8, 1.5), rr(23, 12, 12, 7, 3)],
    line: ["M35 15.5 H42 V20"],
  },
  tall: {
    solid: [rr(23, 23, 18, 33, 5), rr(27, 9, 10, 14, 2.5)],
    line: ["M23 33 H41"],
  },
  dropper: {
    solid: [rr(23, 29, 18, 27, 6), rr(28, 8, 8, 21, 3)],
    line: ["M28 25 H36"],
  },
  jar: {
    solid: [rr(17, 29, 30, 23, 7), rr(15, 19, 34, 11, 4)],
    line: [],
  },
  tube: {
    solid: [rr(23, 17, 18, 35, 4), rr(27, 8, 10, 9, 2.5)],
    line: ["M23 46 H41"],
  },
  wide: {
    solid: [rr(18, 25, 28, 31, 7), rr(27, 11, 10, 14, 3)],
    line: ["M24 37 H40"],
  },
  compact: {
    solid: [circle(32, 33, 18), circle(32, 33, 10)],
    line: [],
  },
  stick: {
    solid: [rr(26, 21, 12, 35, 3), rr(28.5, 10, 7, 12, 3)],
    line: ["M26 27 H38"],
  },
};

export function geometryForShape(shape: ThumbShape): ThumbGeometry {
  return GEOMETRY[shape];
}

/* ------------------------------------------------------------------ *
 * 配色
 * ------------------------------------------------------------------ */

export type ThumbTone = { bg: string; ink: string };

/**
 * ブランドごとの色。
 * 地の washi / kinari と並べても浮かない範囲に彩度を抑えている。
 * ブランドの実際のコーポレートカラーではない（推測で色を当てない）。
 */
const TONES: readonly ThumbTone[] = [
  { bg: "#E4EDE3", ink: "#4A6B52" }, // セージ
  { bg: "#F1E7D3", ink: "#8A6D3C" }, // シャンパン
  { bg: "#F4EAE3", ink: "#8F5A42" }, // テラコッタ
  { bg: "#E6EBEF", ink: "#4E6377" }, // ダスティブルー
  { bg: "#EAE7EF", ink: "#5F5570" }, // 藤
  { bg: "#E9EEE6", ink: "#3E5A47" }, // 深いセージ
  { bg: "#F0EDE4", ink: "#6F6A4A" }, // オリーブ
  { bg: "#EDE6E6", ink: "#7A5259" }, // ローズウッド
];

/** 文字列から決まる値。同じブランドなら必ず同じ色になる。 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function toneForBrand(brand: string): ThumbTone {
  return TONES[hash(brand) % TONES.length];
}

/** ブランド名の頭一文字。図案の隅に小さく置く。 */
export function brandInitial(brand: string): string {
  const first = [...brand.trim()][0];
  return first ? first.toUpperCase() : "";
}

/* ------------------------------------------------------------------ *
 * 実写真のパス
 * ------------------------------------------------------------------ */

/**
 * 受け付ける画像パス。
 *
 * 自分の配信元に置いたファイルだけを許す。外部URL・上位ディレクトリへの
 * 参照・大文字を含むパスは、カタログに書かれていても表示しない。
 * カタログを直接編集した際の書き間違いが、そのまま外部読み込みに
 * ならないようにするための歯止め。
 */
export const IMAGE_PATH_RE =
  /^\/products\/[a-z0-9][a-z0-9-]*\.(jpg|jpeg|png|webp)$/;

export function productImagePath(imagePath: unknown): string | null {
  if (typeof imagePath !== "string") return null;
  if (!IMAGE_PATH_RE.test(imagePath)) return null;
  return imagePath;
}

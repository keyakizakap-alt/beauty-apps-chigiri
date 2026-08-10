import { PRODUCTS } from "./catalog";
import type { Product } from "@/schemas/product";

/**
 * 自然文から手持ち商品を特定する決定論的マッチャー。
 *
 * 商品名の同定を LLM に任せると、カタログにない商品を「それらしく」
 * 返してくる余地が生まれる。ここは文字列一致だけで解決する。
 */

const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　・･,、.。（）()「」【】]/g, "");

/** ブランド名の別表記 */
const ALIASES: Record<string, string[]> = {
  "肌ラボ": ["ハダラボ", "hadalabo", "はだらぼ"],
  "ビオレ": ["biore"],
  "ビオレ UV": ["ビオレuv", "bioreuv"],
  "キュレル": ["curel"],
  "専科": ["senka", "せんか"],
  "無印良品": ["無印", "muji"],
  "ニベア": ["nivea"],
  "ニベアサン": ["niveasun", "ニベアサン"],
  "アネッサ": ["anessa"],
  "スキンアクア": ["skinaqua"],
  "d プログラム": ["dプログラム", "dprogram", "ディープログラム"],
  "エリクシール": ["elixir"],
  "アクアレーベル": ["aqualabel"],
  "メラノCC": ["melanocc", "メラノシーシー"],
  "ナチュリエ": ["naturie", "ハトムギ"],
  "ちふれ": ["chifure"],
  "オバジ": ["obagi"],
  "アリィー": ["allie"],
  "ロゼット": ["rosette"],
  "カウブランド": ["cowbrand", "牛乳石鹸"],
  "IHADA": ["イハダ", "ihada"],
  "innisfree": ["イニスフリー"],
  "VT COSMETICS": ["vt", "ブイティー", "vtコスメ"],
  "Anua": ["アヌア", "anua"],
  "Torriden": ["トリデン", "torriden"],
  "魔女工場": ["manyo", "マニョ", "まじょこうじょう"],
};

const nameHeadOf = (p: Product) => normalize(p.name.split(/[\s　]/)[0] ?? "");

/**
 * 商品名の先頭トークン（例:「潤浸保湿」）は、同一ブランドの製品ラインで
 * 共有されていることが多い。カタログ内で一意なものだけをマッチキーに使う。
 * これを怠ると「潤浸保湿 泡洗顔料」と書いただけで
 * 同ラインの化粧水・クリームまで手持ちに登録されてしまう。
 */
const UNIQUE_NAME_HEADS: ReadonlySet<string> = (() => {
  const counts = new Map<string, number>();
  for (const p of PRODUCTS) {
    const head = nameHeadOf(p);
    counts.set(head, (counts.get(head) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()]
      .filter(([head, n]) => n === 1 && head.length >= 4)
      .map(([head]) => head),
  );
})();

export type MatchResult = {
  product: Product;
  /** 一致の強さ: full=ブランド+商品名, name=商品名, brand=ブランドのみ */
  strength: "full" | "name" | "brand";
};

/**
 * 文章中に出てくる商品を列挙する。
 * ブランド名だけの一致は候補が複数になりうるため strength で区別し、
 * 呼び出し側が「どれですか？」と確認できるようにする。
 */
export function matchProducts(text: string): MatchResult[] {
  const hay = normalize(text);
  if (hay.length === 0) return [];

  const results = new Map<string, MatchResult>();

  for (const p of PRODUCTS) {
    const full = normalize(`${p.brand}${p.name}`);
    const name = normalize(p.name);
    const brandKeys = [p.brand, ...(ALIASES[p.brand] ?? [])].map(normalize);

    if (hay.includes(full)) {
      results.set(p.id, { product: p, strength: "full" });
      continue;
    }
    if (name.length >= 4 && hay.includes(name)) {
      results.set(p.id, { product: p, strength: "name" });
      continue;
    }
    const nameHead = nameHeadOf(p);
    if (UNIQUE_NAME_HEADS.has(nameHead) && hay.includes(nameHead)) {
      const brandHit = brandKeys.some((b) => b.length >= 2 && hay.includes(b));
      results.set(p.id, { product: p, strength: brandHit ? "full" : "name" });
      continue;
    }
    if (brandKeys.some((b) => b.length >= 3 && hay.includes(b))) {
      results.set(p.id, { product: p, strength: "brand" });
    }
  }

  return [...results.values()];
}

/**
 * 手持ち商品として確定してよいものだけを返す。
 * ブランド名だけの一致は確定させない（別商品を勝手に登録しないため）。
 */
export function confidentMatches(text: string): Product[] {
  return matchProducts(text)
    .filter((m) => m.strength !== "brand")
    .map((m) => m.product);
}

/** ブランド名だけ一致した場合の確認候補 */
export function ambiguousBrandMatches(text: string): Product[] {
  const all = matchProducts(text);
  if (all.some((m) => m.strength !== "brand")) return [];
  return all.filter((m) => m.strength === "brand").map((m) => m.product);
}

/**
 * 1行のテキストから、確定してよい商品を1点だけ返す。
 *
 * 写真から読み取った文字列（「キュレル 潤浸保湿 泡洗顔料」など）を
 * カタログへ突き合わせる用途。ブランド名だけの一致では確定しない
 * （別の商品を勝手に手持ちへ入れないため）。
 *
 * 複数に当たった場合は、より強く一致したものを選ぶ。
 */
export function matchByText(text: string): Product | null {
  const results = matchProducts(text).filter((m) => m.strength !== "brand");
  if (results.length === 0) return null;

  const rank = { full: 0, name: 1, brand: 2 } as const;
  return [...results].sort((a, b) => rank[a.strength] - rank[b.strength])[0]
    .product;
}

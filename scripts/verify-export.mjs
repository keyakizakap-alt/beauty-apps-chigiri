/**
 * 公式ページ突合のワークシートを書き出す。
 *
 *   npm run verify:export              全92点
 *   npm run verify:export -- skincare  分野を絞る
 *   npm run verify:export -- demo      デモで使う6点だけ
 *
 * 出力: verification/products-worksheet.csv
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { COLUMNS, toCsv, toWorksheetRows } from "./verification-lib.mjs";

/** 3分デモで使う手持ち構成＋提案される日焼け止め */
const DEMO_IDS = [
  "cl-curel-foam",
  "lo-hadalabo-gokujyun",
  "lo-muji-sensitive-high",
  "se-torriden-dive-in-serum",
  "mo-hadalabo-gokujyun-milk",
  "mo-curel-facecream",
  "su-muji-uv-milk",
];

const catalog = JSON.parse(readFileSync("data/products.json", "utf8"));
const filter = process.argv[2];

let products = catalog.products;
if (filter === "demo") {
  products = products.filter((p) => DEMO_IDS.includes(p.id));
} else if (filter) {
  products = products.filter((p) => p.domain === filter);
  if (products.length === 0) {
    console.error(`分野「${filter}」の商品がありません`);
    process.exit(1);
  }
}

// 未確認のものを先頭に並べる（作業の優先順位がそのまま並び順になるように）
products = [...products].sort((a, b) => {
  const av = a.sourceCheckedAt === null ? 0 : 1;
  const bv = b.sourceCheckedAt === null ? 0 : 1;
  return av - bv || a.id.localeCompare(b.id);
});

mkdirSync("verification", { recursive: true });
const path = "verification/products-worksheet.csv";
writeFileSync(path, toCsv(toWorksheetRows(products), COLUMNS), "utf8");

const unchecked = products.filter((p) => p.sourceCheckedAt === null).length;
console.log(`${path} に ${products.length} 件を書き出しました（未確認 ${unchecked} 件）`);
console.log("");
console.log("記入のしかた:");
console.log("  確認結果   ok=現在の値で正しい / fix=直す / drop=取り扱いをやめる");
console.log("  確認日     YYYY-MM-DD（必須。これが無い行は反映しません）");
console.log("  fix のときだけ「正しい〜」の列を埋めてください（空欄は現状維持）");
console.log("");
console.log("商品写真を登録する場合:");
console.log("  1. メーカーが配布している画像を、許諾を確認したうえで用意する");
console.log("  2. public/products/<商品id>.jpg として置く（png/webp も可）");
console.log("  3. 「商品写真ファイル名」に置いたファイル名を書き、確認結果を fix にする");
console.log("  外部サイトの画像URLは受け付けません（直リンクはしない方針のため）");
console.log("");
console.log("記入後: npm run verify:import");

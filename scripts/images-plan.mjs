/**
 * 商品写真の作業リストを出す。
 *
 *   npm run images:plan            写真が無いもの全部
 *   npm run images:plan -- demo    デモで使う7点だけ
 *   npm run images:plan -- haircare  分野を絞る
 *
 * 「どのファイル名で保存すればよいか」と「どこから取ってくるか」を並べる。
 * 保存したら npm run images:add <フォルダ> で取り込む。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { productsWithoutImage } from "./images-lib.mjs";

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

const missing = productsWithoutImage(products);
const done = products.length - missing.length;

console.log(`写真あり ${done} / ${products.length} 件`);
console.log("");

if (missing.length === 0) {
  console.log("すべて登録済みです。");
  process.exit(0);
}

console.log("次のファイル名で保存してください（拡張子は jpg / png / webp）:");
console.log("");
for (const p of missing) {
  console.log(`  ${p.id}.jpg`);
  console.log(`      ${p.brand} ${p.name}`);
  if (p.officialUrl) console.log(`      ${p.officialUrl}`);
  console.log("");
}

mkdirSync("verification", { recursive: true });
const listPath = "verification/images-todo.txt";
writeFileSync(
  listPath,
  missing
    .map((p) => `${p.id}.jpg\t${p.brand} ${p.name}\t${p.officialUrl ?? ""}`)
    .join("\n") + "\n",
  "utf8",
);

console.log(`同じ内容を ${listPath} にも書き出しました。`);
console.log("");
console.log("保存し終えたら:");
console.log("  npm run images:add <保存したフォルダ>");
console.log("");
console.log(
  "画像はメーカーが配布しているものを、利用許諾を確認したうえでお使いください。",
);

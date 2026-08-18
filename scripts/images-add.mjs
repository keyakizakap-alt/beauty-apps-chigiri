/**
 * 用意した商品写真を取り込む。
 *
 *   npm run images:add ~/Downloads/chigiri-images
 *   npm run images:add ~/Downloads/chigiri-images -- --dry-run
 *
 * ファイル名（拡張子を除く）が商品 id と一致するものだけを取り込む。
 * 正方形に収めて webp へ変換し、public/products/ に置いたうえで
 * data/products.json の imagePath を更新する。
 *
 * 写真を入れても「公式ページ突合」の状態は変えない。
 * 写真があることと、価格やURLを確認したことは別のため。
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  detectImageType,
  matchFilesToProducts,
  targetPathFor,
} from "./images-lib.mjs";

/** 一辺の上限。カードは最大96pxなので、拡大表示を考えてもこれで足りる */
const MAX_SIDE = 800;
/** 取り込み前のファイルサイズ上限 */
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dir = args.find((a) => !a.startsWith("--"));

if (!dir) {
  console.error("画像の入ったフォルダを指定してください。");
  console.error("  npm run images:add ~/Downloads/chigiri-images");
  console.error("");
  console.error("どのファイル名で保存すればよいかは npm run images:plan で確認できます。");
  process.exit(1);
}

let filenames;
try {
  filenames = readdirSync(dir);
} catch {
  console.error(`${dir} を開けません。`);
  process.exit(1);
}

const catalog = JSON.parse(readFileSync("data/products.json", "utf8"));
const { matched, unmatched } = matchFilesToProducts(filenames, catalog.products);

if (unmatched.length > 0) {
  console.log("商品 id と一致しないため取り込まないファイル:");
  for (const f of unmatched) console.log(`  ${f}`);
  console.log("  （npm run images:plan で正しいファイル名を確認できます）");
  console.log("");
}

if (matched.length === 0) {
  console.error("取り込めるファイルがありませんでした。");
  process.exit(1);
}

const byId = new Map(catalog.products.map((p) => [p.id, p]));
const applied = [];
const errors = [];

mkdirSync("public/products", { recursive: true });

for (const { file, productId } of matched) {
  const src = join(dir, file);
  let buf;
  try {
    buf = readFileSync(src);
  } catch {
    errors.push(`${file}: 読み込めません`);
    continue;
  }

  if (buf.length > MAX_INPUT_BYTES) {
    errors.push(
      `${file}: ファイルが大きすぎます（${(buf.length / 1024 / 1024).toFixed(1)}MB／上限 12MB）`,
    );
    continue;
  }

  // 拡張子ではなく中身で判定する
  const kind = detectImageType(buf);
  if (!kind) {
    errors.push(`${file}: jpeg / png / webp として読めません`);
    continue;
  }

  const outPath = targetPathFor(productId);
  if (dryRun) {
    applied.push({ productId, file, bytes: null, outPath });
    continue;
  }

  try {
    const out = await sharp(buf)
      .rotate() // Exif の向きを反映してから向き情報を捨てる
      .resize(MAX_SIDE, MAX_SIDE, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();

    writeFileSync(`public${outPath}`, out);
    byId.get(productId).imagePath = outPath;
    applied.push({ productId, file, bytes: out.length, outPath });
  } catch (e) {
    errors.push(`${file}: 変換に失敗しました（${e.message}）`);
  }
}

for (const a of applied) {
  const size = a.bytes === null ? "" : ` (${Math.round(a.bytes / 1024)}KB)`;
  console.log(`  ${a.file} → public${a.outPath}${size}`);
}

if (errors.length > 0) {
  console.log("");
  console.error(`取り込めなかったファイル ${errors.length} 件:`);
  for (const e of errors) console.error(`  - ${e}`);
}

if (dryRun) {
  console.log("");
  console.log(`--dry-run のため書き込みませんでした（対象 ${applied.length} 件）。`);
  process.exit(0);
}

if (applied.length === 0) {
  console.error("");
  console.error("取り込めたファイルがありませんでした。");
  process.exit(1);
}

writeFileSync(
  "data/products.json",
  JSON.stringify(catalog, null, 2) + "\n",
  "utf8",
);

const withImage = catalog.products.filter((p) => p.imagePath).length;
console.log("");
console.log(`${applied.length} 件を取り込みました。`);
console.log(`写真あり: ${withImage} / ${catalog.products.length} 件`);
console.log("");
console.log("次に実行してください:");
console.log("  npm test");
console.log("  npm run dev   （画面で確認）");

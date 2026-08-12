/**
 * 記入済みワークシートをカタログへ反映する。
 *
 *   npm run verify:import                      既定のパスから読む
 *   npm run verify:import -- path/to/file.csv
 *   npm run verify:import -- --dry-run         書き込まずに結果だけ見る
 *
 * エラーが1件でもあれば、何も書き込まずに終了する。
 * 一部だけ反映されて「どこまで進んだか分からない」状態を作らないため。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { applyVerification, parseCsv } from "./verification-lib.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const path =
  args.find((a) => !a.startsWith("--")) ?? "verification/products-worksheet.csv";

let csv;
try {
  csv = readFileSync(path, "utf8");
} catch {
  console.error(`${path} が読めません。先に npm run verify:export を実行してください。`);
  process.exit(1);
}

const catalog = JSON.parse(readFileSync("data/products.json", "utf8"));
const registry = JSON.parse(readFileSync("data/merchants.json", "utf8"));
const allowedHosts = registry.merchants.flatMap((m) => m.hosts);

const rows = parseCsv(csv);
const result = applyVerification(catalog.products, rows, { allowedHosts });

console.log(`読み込み: ${rows.length} 行`);
console.log(`反映対象: ${result.applied.length} 件`);
console.log(`未記入 : ${result.skipped.length} 件`);
if (result.dropped.length > 0) {
  console.log(`取り扱いをやめる: ${result.dropped.join(", ")}`);
  console.log("  （この操作は自動では行いません。data/products.json から手で外してください）");
}

if (result.errors.length > 0) {
  console.error("");
  console.error(`エラー ${result.errors.length} 件。何も書き込みませんでした。`);
  for (const e of result.errors) console.error(`  - ${e}`);

  if (result.newHosts.length > 0) {
    console.error("");
    console.error("data/merchants.json に未登録のホストがあります:");
    for (const h of result.newHosts) console.error(`  - ${h}`);
    console.error("");
    console.error("そのブランドの既存エントリの hosts に足すか、新しい販売者を足してください。");
    console.error("例: { \"id\": \"...\", \"name\": \"... 公式サイト\", \"kind\": \"brand_official\",");
    console.error("     \"hosts\": [\"example.com\"], \"shippingFeeYen\": null,");
    console.error("     \"returnPolicyUrl\": null, \"affiliate\": false }");
  }
  process.exit(1);
}

if (result.applied.length === 0) {
  console.log("反映する行がありませんでした。");
  process.exit(0);
}

if (dryRun) {
  console.log("");
  console.log("--dry-run のため書き込みませんでした。");
  process.exit(0);
}

catalog.products = result.products;
writeFileSync("data/products.json", JSON.stringify(catalog, null, 2) + "\n", "utf8");

const verified = catalog.products.filter((p) => p.sourceCheckedAt !== null).length;
const remaining = catalog.products.length - verified;
console.log("");
console.log(`data/products.json を更新しました。`);
console.log(`突合済み: ${verified} / ${catalog.products.length} 件（残り ${remaining} 件）`);
console.log("");
console.log("次に実行してください:");
console.log("  npm test        （カタログの整合性を確認）");
console.log("  npm run build");
if (remaining > 0) {
  console.log("");
  console.log("残りを続けるとき:");
  console.log("  npm run verify:export -- unchecked   （未確認だけ書き出す）");
}

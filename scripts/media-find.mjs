/**
 * 商品の識別子（楽天 itemCode / JAN）を人が確定させるための下調べ。
 *
 *   RAKUTEN_APP_ID=xxx npm run media:find -- cl-curel-foam
 *   RAKUTEN_APP_ID=xxx npm run media:find -- demo
 *
 * キーワードで楽天市場を検索し、候補を並べるだけ。**カタログは書き換えない。**
 * 同名・類似名の別商品を拾うため、どれが同一商品かは人が判断する必要がある。
 * 確認できたら data/products.json の rakutenItemCode か jan に自分で書く。
 */
import { readFileSync } from "node:fs";

const ENDPOINT =
  "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601";

const DEMO_IDS = [
  "cl-curel-foam",
  "lo-hadalabo-gokujyun",
  "lo-muji-sensitive-high",
  "se-torriden-dive-in-serum",
  "mo-hadalabo-gokujyun-milk",
  "mo-curel-facecream",
  "su-muji-uv-milk",
];

const appId = process.env.RAKUTEN_APP_ID;
if (!appId) {
  console.error("RAKUTEN_APP_ID が設定されていません。");
  console.error("https://webservice.rakuten.co.jp/ でアプリIDを取得してください。");
  process.exit(1);
}

const arg = process.argv[2];
if (!arg) {
  console.error("商品 id か demo を指定してください。");
  console.error("  npm run media:find -- cl-curel-foam");
  process.exit(1);
}

const catalog = JSON.parse(readFileSync("data/products.json", "utf8"));
const targets =
  arg === "demo"
    ? catalog.products.filter((p) => DEMO_IDS.includes(p.id))
    : catalog.products.filter((p) => p.id === arg);

if (targets.length === 0) {
  console.error(`商品 ${arg} が見つかりません。`);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [i, product] of targets.entries()) {
  // 楽天APIは概ね毎秒1リクエストが上限
  if (i > 0) await sleep(1200);

  const params = new URLSearchParams({
    applicationId: appId,
    format: "json",
    formatVersion: "2",
    hits: "5",
    imageFlag: "1",
    keyword: `${product.brand} ${product.name}`,
  });

  console.log("");
  console.log("=".repeat(60));
  console.log(`${product.id}`);
  console.log(`  ${product.brand} ${product.name}`);
  if (product.rakutenItemCode) {
    console.log(`  登録済み itemCode: ${product.rakutenItemCode}`);
  }
  console.log("");

  let json;
  try {
    const res = await fetch(`${ENDPOINT}?${params.toString()}`);
    if (!res.ok) {
      console.log(`  検索できませんでした (HTTP ${res.status})`);
      continue;
    }
    json = await res.json();
  } catch (e) {
    console.log(`  検索できませんでした (${e.message})`);
    continue;
  }

  const items = json.Items ?? [];
  if (items.length === 0) {
    console.log("  候補が見つかりませんでした。");
    continue;
  }

  for (const raw of items) {
    const item = raw.Item ?? raw;
    console.log(`  itemCode: ${item.itemCode}`);
    console.log(`    ${item.itemName}`);
    console.log(`    ${item.itemPrice}円  ${item.shopName ?? ""}`);
    console.log(`    ${item.itemUrl ?? ""}`);
    console.log("");
  }
}

console.log("=".repeat(60));
console.log("");
console.log("同一商品と確認できたものだけ、data/products.json に書いてください:");
console.log('  "rakutenItemCode": "shop:10000001"');
console.log('  "jan": "4901301234567"');
console.log("");
console.log("このスクリプトはカタログを書き換えません。");
console.log("検索結果をそのまま採用すると、別商品の写真が出ることがあるためです。");

/**
 * モバイル幅での E2E 確認。
 *
 *   npm run build && npm start &
 *   npm run e2e
 *
 * 確認するもの:
 *   - 主要画面で横スクロールが発生しないこと（受け入れ条件）
 *   - チャットから実際にルーティンが生成され、結果カードが描画されること
 *
 * BASE_URL / PW_CHROMIUM で上書きできます。
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EXECUTABLE = process.env.PW_CHROMIUM ?? undefined;
const OUT = ".e2e-output";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(
  EXECUTABLE ? { executablePath: EXECUTABLE } : {},
);
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

let allOk = true;

const noHorizontalScroll = async (label) => {
  const r = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  const ok = r.scrollWidth <= r.innerWidth;
  allOk = ok && allOk;
  console.log(
    `${ok ? "OK " : "NG "} ${label.padEnd(14)} scrollWidth=${r.scrollWidth} innerWidth=${r.innerWidth}`,
  );
};

for (const [path, label] of [
  ["/", "home"],
  ["/chat", "chat"],
  ["/onboarding", "onboarding"],
  ["/inventory", "inventory"],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await noHorizontalScroll(label);
}

// デモ構成（洗顔1・化粧水2・美容液1・乳液2、日焼け止めなし）でルーティンを生成する
await page.goto(`${BASE}/chat`, { waitUntil: "networkidle" });
await page.evaluate(() => {
  localStorage.setItem(
    "chigiri.profile.v1",
    JSON.stringify({
      skinType: "dry",
      concerns: ["dryness", "sensitivity"],
      avoidTextures: [],
      avoidIngredients: [],
      budgetYen: 3000,
      morningMinutes: 5,
      nightMinutes: 10,
      ownedProductIds: [
        "cl-curel-foam",
        "lo-hadalabo-gokujyun",
        "lo-muji-sensitive-high",
        "se-torriden-dive-in-serum",
        "mo-hadalabo-gokujyun-milk",
        "mo-curel-facecream",
      ],
      allowPurchase: true,
      maxNewItems: 1,
    }),
  );
});
await page.reload({ waitUntil: "networkidle" });
await page
  .getByPlaceholder("肌の悩み、予算、持っている化粧品など")
  .fill("いまの条件で組み立ててください");
await page.getByRole("button", { name: "送る" }).click();
await page.getByText("手持ち活用率").waitFor({ timeout: 30000 });

await noHorizontalScroll("chat+result");

const summary = await page.locator("section").first().innerText();
console.log("\n--- 結果カードの要約 ---\n" + summary.slice(0, 300));

await page.screenshot({ path: `${OUT}/mobile-result.png`, fullPage: true });
console.log(`\nスクリーンショット: ${OUT}/mobile-result.png`);

/* ------------------------------------------------------------------ *
 * 相談ログの回帰確認
 *
 * 過去に次の2点を落としたことがあるため、毎回確認する。
 *   - 1024px 未満でサイドバーが畳まれ、履歴への入口が分からなくなった
 *   - 端末に保存できない状況で、黙って消えていた（画面上は保存済みに見える）
 * ------------------------------------------------------------------ */
const check = (label, condition, detail = "") => {
  allOk = condition && allOk;
  console.log(`${condition ? "OK " : "NG "} ${label.padEnd(24)} ${detail}`);
};

console.log("\n--- 相談ログ ---");

// 履歴への入口がモバイル幅でも見えること
const historyButton = page.getByRole("button", { name: /相談ログ/ });
check(
  "履歴への入口が見える",
  await historyButton.isVisible().catch(() => false),
  await historyButton.innerText().then((t) => t.replace(/\n/g, " ")).catch(() => ""),
);

// 引き出しを開くと履歴が並ぶこと
await historyButton.click();
const drawer = page.locator("div.fixed.inset-0.z-40");
await drawer.waitFor({ timeout: 5000 });
const drawerItems = await drawer.locator("li").count();
check("引き出しに履歴が並ぶ", drawerItems > 0, `${drawerItems}件`);
await drawer.getByRole("button", { name: "閉じる", exact: true }).click();

// リロードしても残ること
const before = await page.evaluate(() => {
  const raw = localStorage.getItem("chigiri.conversations.v1");
  return raw ? JSON.parse(raw).conversations.length : 0;
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const after = await page.evaluate(() => {
  const raw = localStorage.getItem("chigiri.conversations.v1");
  return raw ? JSON.parse(raw).conversations.length : 0;
});
check("リロードしても残る", before > 0 && after === before, `${before} → ${after}件`);

// 保存できない環境では警告を出すこと（黙って消さない）
const blocked = await browser.newContext({
  viewport: { width: 375, height: 812 },
  isMobile: true,
  hasTouch: true,
});
const blockedPage = await blocked.newPage();
await blockedPage.addInitScript(() => {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (String(key).startsWith("chigiri.conversations")) {
      throw new DOMException("QuotaExceededError");
    }
    return original.call(this, key, value);
  };
});
await blockedPage.goto(`${BASE}/chat`, { waitUntil: "networkidle" });
await blockedPage.waitForTimeout(1500);
await blockedPage
  .getByPlaceholder("肌の悩み、予算、持っている化粧品など")
  .fill("保存できない環境の確認");
await blockedPage.getByRole("button", { name: "送る" }).click();
await blockedPage.waitForTimeout(3000);
/*
 * 対話画面の上部に出る警告を見る。
 * サイドバーは 1024px 未満では畳まれている（DOM には残るが非表示）ため、
 * 文言で探すと非表示側に当たる。header に絞って「見えているか」を確かめる。
 */
const warned = await blockedPage
  .locator("header")
  .getByText("保存できていない", { exact: false })
  .first()
  .isVisible()
  .catch(() => false);
check("保存失敗を利用者に伝える", warned);
if (!warned) {
  await blockedPage.screenshot({ path: `${OUT}/storage-warning-missing.png` });
}
await blocked.close();

await browser.close();
console.log(allOk ? "\nALL PASS" : "\nFAILURES PRESENT");
process.exit(allOk ? 0 : 1);

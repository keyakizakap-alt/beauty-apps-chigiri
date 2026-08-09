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

await browser.close();
console.log(allOk ? "\nALL PASS" : "\nFAILURES PRESENT");
process.exit(allOk ? 0 : 1);

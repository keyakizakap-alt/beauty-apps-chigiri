/**
 * 主要画面のスクリーンショットを撮る（デモ資料・レビュー用）。
 *
 *   npm run build && npm start &
 *   BASE_URL=http://localhost:3000 node scripts/screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EXECUTABLE = process.env.PW_CHROMIUM ?? undefined;
const OUT = process.env.SHOT_DIR ?? ".e2e-output";

mkdirSync(OUT, { recursive: true });

const DEMO_PROFILE = {
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
};

const browser = await chromium.launch(
  EXECUTABLE ? { executablePath: EXECUTABLE } : {},
);

async function shoot(name, { width, height }, prepare) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: width < 700,
    hasTouch: width < 700,
  });
  const page = await ctx.newPage();
  await prepare(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`${OUT}/${name}.png`);
  await ctx.close();
}

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

const seed = async (page) => {
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle" });
  await page.evaluate((p) => {
    localStorage.setItem("chigiri.profile.v1", JSON.stringify(p));
  }, DEMO_PROFILE);
};

// 1. トップ
await shoot("01-home", MOBILE, async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
});

// 2. チャット初期状態
await shoot("02-chat-empty", MOBILE, async (page) => {
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle" });
});

// 3. 手持ち商品の選択パネル
await shoot("03-inventory", MOBILE, async (page) => {
  await seed(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^手持ち/ }).click();
  await page.waitForTimeout(400);
});

// 4. 条件パネル
await shoot("04-profile", MOBILE, async (page) => {
  await seed(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "条件" }).click();
  await page.waitForTimeout(400);
});

// 5. チャットでルーティン生成（モバイル）
await shoot("05-chat-result-mobile", MOBILE, async (page) => {
  await seed(page);
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByPlaceholder("肌の悩み、予算、持っている化粧品など")
    .fill("いまの条件で組み立ててください");
  await page.getByRole("button", { name: "送る" }).click();
  await page.getByText("手持ち活用率").waitFor({ timeout: 30000 });
  await page.waitForTimeout(400);
});

// 6. 結果ページ（デスクトップ幅・採用理由を開いた状態）
await shoot("06-result-desktop", DESKTOP, async (page) => {
  await seed(page);
  await page.goto(`${BASE}/result`, { waitUntil: "networkidle" });
  await page.getByText("手持ち活用率").waitFor({ timeout: 30000 });
  for (const d of await page.locator("details").all()) {
    await d.evaluate((el) => el.setAttribute("open", ""));
  }
  await page.waitForTimeout(400);
});

// 7. 安全ゲート（受診勧奨で推薦を停止する挙動）
await shoot("07-safety-gate", MOBILE, async (page) => {
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle" });
  await page
    .getByPlaceholder("肌の悩み、予算、持っている化粧品など")
    .fill("頬が赤く腫れていて痛みがあります");
  await page.getByRole("button", { name: "送る" }).click();
  await page.getByText(/医療機関/).waitFor({ timeout: 30000 });
  await page.waitForTimeout(400);
});

await browser.close();
console.log("done");

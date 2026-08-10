/**
 * app/icon.svg から PWA / iOS 用の PNG アイコンを書き出す。
 *
 * 実行時ではなくビルド前に一度だけ走らせ、成果物を public/icons へコミットする。
 * リクエストごとの画像生成を避けるためと、Playwright を本番依存にしないため。
 *
 *   node scripts/build-icons.mjs
 *
 * maskable 版は Android のアダプティブアイコン用に角丸を付けず全面を塗る
 * （OS 側が任意の形にマスクするため、こちらで角を丸めると二重に欠ける）。
 */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "icons");

/** 環境によって Chromium の配置が違うため、見つかったものを使う */
const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium/chrome-linux/chrome",
].filter(Boolean);

async function resolveChromium() {
  for (const p of CHROMIUM_CANDIDATES) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* 次の候補へ */
    }
  }
  return undefined; // Playwright の既定に任せる
}

const TARGETS = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "apple-touch-icon.png", size: 180, maskable: false },
  { file: "maskable-512.png", size: 512, maskable: true },
];

const svg = await fs.readFile(path.join(root, "app", "icon.svg"), "utf8");
await fs.mkdir(outDir, { recursive: true });

const executablePath = await resolveChromium();
const browser = await chromium.launch(
  executablePath ? { executablePath } : undefined,
);

try {
  for (const { file, size, maskable } of TARGETS) {
    // maskable は角丸を外し、セーフゾーン（中央80%）に収まるよう少し縮める
    const body = maskable
      ? svg
          .replace(/rx="114"/, 'rx="0"')
          .replace(/<g clip-path/, '<g transform="scale(0.86) translate(42 42)" clip-path')
          .replace(
            /<g fill="none"/,
            '<g transform="scale(0.86) translate(42 42)" fill="none"',
          )
      : svg;

    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0"><div style="width:${size}px;height:${size}px">${body}</div></body>`,
    );
    await page.screenshot({
      path: path.join(outDir, file),
      omitBackground: true,
    });
    await page.close();
    console.log(`wrote public/icons/${file} (${size}x${size})`);
  }
} finally {
  await browser.close();
}

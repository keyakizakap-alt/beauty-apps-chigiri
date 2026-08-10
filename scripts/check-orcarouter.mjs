/**
 * OrcaRouter への疎通確認（アプリを起動せずに単体で実行できる）。
 *
 *   ORCAROUTER_API_KEY=sk-... npm run orca:check
 *
 * .env.local に書いてあれば自動で読み込みます。
 *
 * 確認する順序:
 *   1. 名前解決・接続        … そもそも到達できるか
 *   2. 認証（GET /models）   … キーが通るか（生成しないので費用ゼロ）
 *   3. 生成（POST /chat/completions）… 実際に応答が返るか
 *   4. 構造化出力（JSON）    … response_format が効くか
 *
 * どこで落ちたかを切り分けられるよう、段階ごとに結果を出します。
 * APIキーは表示しません（先頭数文字のみ）。
 */
import fs from "node:fs";
import path from "node:path";

/* ---- .env.local の読み込み（依存を増やさないため簡易パーサ） ---- */
function loadEnvLocal() {
  for (const name of [".env.local", ".env"]) {
    const file = path.resolve(process.cwd(), name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, rawValue] = m;
      if (process.env[key]) continue; // 既存の環境変数を上書きしない
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}
loadEnvLocal();

const KEY = process.env.ORCAROUTER_API_KEY;
const BASE = (process.env.ORCAROUTER_BASE_URL ?? "https://api.orcarouter.com/v1").replace(
  /\/+$/,
  "",
);
const MODEL = process.env.ORCAROUTER_MODEL_CHEAP || "auto";
const TIMEOUT = Number(process.env.ORCAROUTER_TIMEOUT_MS ?? 20000);

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const ng = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const info = (m) => console.log(`    \x1b[2m${m}\x1b[0m`);

if (!KEY) {
  ng("ORCAROUTER_API_KEY が設定されていません");
  info("ORCAROUTER_API_KEY=sk-... npm run orca:check");
  info("または .env.local に書いてください（.gitignore 済み）");
  process.exit(1);
}

console.log("\nOrcaRouter 疎通確認");
console.log(`  接続先 : ${BASE}`);
console.log(`  キー   : ${KEY.slice(0, 8)}…（${KEY.length}文字）`);
console.log(`  モデル : ${MODEL}\n`);

async function withTimeout(fn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

let failed = false;

/* ---- 1 & 2. 認証（GET /models） ---- */
console.log("1. 認証と接続（GET /models）");
let models = [];
try {
  const started = Date.now();
  const res = await withTimeout((signal) =>
    fetch(`${BASE}/models`, {
      headers: { Authorization: `Bearer ${KEY}` },
      signal,
    }),
  );
  const ms = Date.now() - started;

  if (res.ok) {
    const json = await res.json().catch(() => null);
    models = Array.isArray(json?.data) ? json.data.map((m) => m.id) : [];
    ok(`接続・認証に成功（${ms}ms）`);
    if (models.length > 0) {
      info(`利用可能なモデル ${models.length} 件`);
      info(models.slice(0, 8).join(", ") + (models.length > 8 ? " …" : ""));
    }
  } else {
    failed = true;
    const body = await res.text().catch(() => "");
    ng(`HTTP ${res.status}（${ms}ms）`);
    if (res.status === 401 || res.status === 403) {
      info("キーが正しくないか、権限がありません。再発行を確認してください。");
    } else if (res.status === 404) {
      info("接続先のパスが違う可能性があります。ORCAROUTER_BASE_URL を確認してください。");
    }
    if (body) info(`応答: ${body.slice(0, 200)}`);
  }
} catch (e) {
  failed = true;
  const name = e?.name === "AbortError" ? "タイムアウト" : "接続できません";
  ng(`${name}（${e?.cause?.code ?? e?.message ?? ""}）`);
  info("ネットワーク制限やプロキシで塞がれていないか確認してください。");
}

/* ---- 3 & 4. 生成と構造化出力 ---- */
console.log("\n2. 生成と構造化出力（POST /chat/completions）");
try {
  const started = Date.now();
  const res = await withTimeout((signal) =>
    fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              'あなたは接続確認用の応答器です。必ず {"ok":true} という JSON だけを返してください。',
          },
          { role: "user", content: "接続確認" },
        ],
        temperature: 0,
        max_tokens: 32,
        response_format: { type: "json_object" },
      }),
      signal,
    }),
  );
  const ms = Date.now() - started;

  if (!res.ok) {
    failed = true;
    const body = await res.text().catch(() => "");
    ng(`HTTP ${res.status}（${ms}ms）`);
    if (body) info(`応答: ${body.slice(0, 300)}`);
    if (res.status === 400) {
      info(`モデル指定「${MODEL}」が受け付けられていない可能性があります。`);
      if (models.length > 0) info(`例: ORCAROUTER_MODEL_CHEAP=${models[0]}`);
    }
  } else {
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content ?? "";
    const selected =
      res.headers.get("x-orcarouter-model") ??
      res.headers.get("x-model") ??
      res.headers.get("openai-model") ??
      json?.model ??
      null;

    ok(`生成に成功（${ms}ms）`);
    info(`要求モデル: ${MODEL}`);
    info(`選択モデル: ${selected ?? "（応答に含まれず）"}`);

    const usage = json?.usage;
    if (usage) {
      info(
        `トークン: 入力${usage.prompt_tokens ?? "?"} / 出力${usage.completion_tokens ?? "?"} / 合計${usage.total_tokens ?? "?"}`,
      );
    }

    // アプリは選択モデルをヘッダーまたは本文から取る。どちらも無いと表示できない。
    if (!selected) {
      info(
        "警告: 選択モデルを取得できませんでした。結果画面のモデル表示が空になります。",
      );
    }

    let parsed = null;
    try {
      parsed = JSON.parse(content.trim().replace(/^```(?:json)?|```$/g, ""));
    } catch {
      /* 後段で扱う */
    }
    if (parsed) ok("構造化出力（JSON）を取得");
    else {
      ng("JSON として解釈できませんでした");
      info(`応答: ${String(content).slice(0, 200)}`);
      info("アプリ側はこの場合、決定論的な説明へ自動で切り替わります。");
    }
  }
} catch (e) {
  failed = true;
  const name = e?.name === "AbortError" ? "タイムアウト" : "接続できません";
  ng(`${name}（${e?.cause?.code ?? e?.message ?? ""}）`);
}

console.log(
  failed
    ? "\n\x1b[31m疎通に失敗した項目があります。\x1b[0m 上の内容を確認してください。\n"
    : "\n\x1b[32mすべて成功しました。\x1b[0m .env.local に同じ設定を入れればアプリから利用できます。\n",
);
process.exit(failed ? 1 : 0);

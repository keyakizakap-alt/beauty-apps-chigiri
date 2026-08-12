/**
 * 公式ページ突合のためのワークシート処理。
 *
 * 目的は「確認していないものを確認したことにしない」まま、
 * 人が確認した結果だけをカタログへ反映すること。
 *
 * 入出力は CSV。表計算ソフトで開いて埋められる形にする。
 * 反映は記入された行だけに限り、空欄の項目は現状を維持する。
 */

/** 記入してもらう列（この順で出力する） */
export const COLUMNS = [
  "id",
  "分野",
  "役割",
  "ブランド",
  "商品名",
  "現在の公式URL",
  "現在の参考価格",
  "現在の内容量",
  // ここから記入欄
  "確認結果",
  "正しい商品名",
  "正しい公式URL",
  "正しい価格",
  "正しい内容量",
  "確認日",
  "備考",
];

const DOMAIN_LABEL = {
  skincare: "スキンケア",
  haircare: "ヘア・頭皮ケア",
  bodycare: "ボディケア",
  makeup: "メイク・コスメ",
  nailcare: "ネイル・ハンド",
};

/* ------------------------------------------------------------------ *
 * CSV（RFC 4180 の最小実装）
 * ------------------------------------------------------------------ */

function escapeCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows, columns = COLUMNS) {
  const head = columns.map(escapeCell).join(",");
  const body = rows.map((r) => columns.map((c) => escapeCell(r[c])).join(","));
  // Excel が UTF-8 と判定できるよう BOM を付ける
  return "﻿" + [head, ...body].join("\r\n") + "\r\n";
}

export function parseCsv(text) {
  const src = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim().length > 0))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/* ------------------------------------------------------------------ *
 * ワークシートの生成
 * ------------------------------------------------------------------ */

export function toWorksheetRows(products) {
  return products.map((p) => ({
    id: p.id,
    分野: DOMAIN_LABEL[p.domain] ?? p.domain,
    役割: p.category,
    ブランド: p.brand,
    商品名: p.name,
    現在の公式URL: p.officialUrl ?? "",
    現在の参考価格: p.price,
    現在の内容量: p.volume ?? "",
    確認結果: "",
    正しい商品名: "",
    正しい公式URL: "",
    正しい価格: "",
    正しい内容量: "",
    確認日: "",
    備考: "",
  }));
}

/* ------------------------------------------------------------------ *
 * 記入結果の反映
 * ------------------------------------------------------------------ */

const RESULT_OK = ["ok", "OK", "○", "そのまま", "一致"];
const RESULT_FIX = ["fix", "FIX", "修正", "△"];
const RESULT_DROP = ["drop", "DROP", "削除", "×", "廃番"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 確認日を YYYY-MM-DD に正規化する。
 *
 * 手で書くと `2026/08/12` や `2026年8月12日` になりやすいので、
 * **年が明記されていて日付として実在する**ものだけ受け取る。
 * `8月12日` のように年が無いものは、どの年か決められないので受け取らない
 * （「いつ確認したか分からない突合済み」を作らないため）。
 *
 * @returns {string|null} 正規化した日付。解釈できなければ null
 */
export function normalizeCheckedAt(raw) {
  const s = (raw ?? "").trim();
  if (s.length === 0) return null;

  const m = s.match(/^(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})\s*日?$/);
  if (!m) return null;

  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);

  // 実在する日付か（2026-02-30 のようなものを通さない）
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }

  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * URL のホストが許可リストにあるか。
 * 完全一致か、ドット境界のサブドメインだけを認める
 * （`domain/commerce/merchants.ts` の判定と同じ規則にそろえる。
 *  ここで弾いておかないと、カタログ読み込み時に例外になって
 *  アプリごと起動しなくなる）。
 */
function hostAllowed(host, allowedHosts) {
  const normalized = host.toLowerCase();
  for (const allowed of allowedHosts) {
    const a = allowed.toLowerCase();
    if (normalized === a || normalized.endsWith(`.${a}`)) return true;
  }
  return false;
}

/**
 * 記入済みの行をカタログへ反映する。
 *
 * - 「確認結果」が空の行は手つかずとみなし、何もしない
 * - ok/fix の行だけ sourceCheckedAt と dataConfidence を更新する
 * - 確認日が無い、または形式が違う行はエラーにして反映しない
 *   （確認日の無い「確認済み」を作らないため）
 * - drop の行は削除対象として返すだけで、ここでは消さない
 * - allowedHosts を渡すと、許可リストに無いホストの URL をエラーにする
 *   （merchants.json への追加漏れでアプリが起動しなくなるのを防ぐ）
 *
 * @param {any[]} products カタログ
 * @param {any[]} rows 記入済みワークシートの行
 * @param {{allowedHosts?: string[]}} [options]
 * @returns {{products: any[], applied: string[], dropped: string[], skipped: string[], errors: string[], newHosts: string[]}}
 */
export function applyVerification(products, rows, options = {}) {
  const allowedHosts = options.allowedHosts ?? null;
  const newHosts = new Set();
  const byId = new Map(products.map((p) => [p.id, { ...p }]));
  const applied = [];
  const dropped = [];
  const skipped = [];
  const errors = [];

  for (const row of rows) {
    const id = (row.id ?? "").trim();
    if (id.length === 0) continue;

    const product = byId.get(id);
    if (!product) {
      errors.push(`${id}: カタログに存在しない id です`);
      continue;
    }

    const result = (row["確認結果"] ?? "").trim();
    if (result.length === 0) {
      skipped.push(id);
      continue;
    }

    if (RESULT_DROP.includes(result)) {
      // 「正しい〜」が埋まっている drop は、fix の書き間違いである可能性が高い。
      // そのまま流すと修正内容が黙って捨てられるので、ここで止める
      const filled = ["正しい商品名", "正しい公式URL", "正しい価格", "正しい内容量"].filter(
        (c) => (row[c] ?? "").trim().length > 0,
      );
      if (filled.length > 0) {
        errors.push(
          `${id}: 確認結果が drop（取り扱いをやめる）なのに ${filled.join("・")} が記入されています。値を直したいのなら fix です`,
        );
        continue;
      }
      dropped.push(id);
      continue;
    }

    const isOk = RESULT_OK.includes(result);
    const isFix = RESULT_FIX.includes(result);
    if (!isOk && !isFix) {
      errors.push(
        `${id}: 「確認結果」が解釈できません（${result}）。ok / fix / drop のいずれかを入れてください`,
      );
      continue;
    }

    const checkedAt = normalizeCheckedAt(row["確認日"]);
    if (checkedAt === null || !DATE_RE.test(checkedAt)) {
      errors.push(
        `${id}: 確認日を YYYY-MM-DD で入れてください（${(row["確認日"] ?? "").trim() || "空欄"}）。` +
          `2026/08/12 や 2026年8月12日 も可。年の無い「8月12日」は、いつ確認したか決められないので受け取りません`,
      );
      continue;
    }

    if (isFix) {
      const name = (row["正しい商品名"] ?? "").trim();
      const url = (row["正しい公式URL"] ?? "").trim();
      const price = (row["正しい価格"] ?? "").trim();
      const volume = (row["正しい内容量"] ?? "").trim();

      if (url.length > 0) {
        if (!/^https:\/\//.test(url)) {
          errors.push(`${id}: 公式URLは https で始まる必要があります（${url}）`);
          continue;
        }
        let host;
        try {
          host = new URL(url).hostname;
        } catch {
          errors.push(`${id}: 公式URLが URL として読めません（${url}）`);
          continue;
        }
        if (allowedHosts && !hostAllowed(host, allowedHosts)) {
          newHosts.add(host);
          errors.push(
            `${id}: ${host} は data/merchants.json の許可ホストにありません。` +
              `先に追加してください（無いままだとカタログ読み込み時にエラーになります）`,
          );
          continue;
        }
        product.officialUrl = url;
      }
      if (price.length > 0) {
        const n = Number(price.replace(/[,，円\s]/g, ""));
        if (!Number.isFinite(n) || n < 0) {
          errors.push(`${id}: 価格が数値として読めません（${price}）`);
          continue;
        }
        product.price = Math.round(n);
      }
      if (volume.length > 0) product.volume = volume;
      // リニューアルで商品名が変わることがある。
      // 名前が古いまま「公式確認済み」にすると、公式ページと突き合わせられなくなる
      if (name.length > 0) product.name = name;
    }

    product.sourceCheckedAt = checkedAt;
    // 価格を確認したと言えるのは、
    //   ok  = 現在の値が正しいと確認した
    //   fix = 正しい価格を書いた
    // のどちらか。fix で価格欄が空欄の場合は「直さない」であって
    // 「確認した」ではないので、参考価格のままにしておく
    const priceConfirmed = isOk || (row["正しい価格"] ?? "").trim().length > 0;
    if (priceConfirmed) product.priceCheckedAt = checkedAt;
    product.dataConfidence = "official";
    byId.set(id, product);
    applied.push(id);
  }

  return {
    products: products.map((p) => byId.get(p.id) ?? p),
    applied,
    dropped,
    skipped,
    errors,
    newHosts: [...newHosts],
  };
}

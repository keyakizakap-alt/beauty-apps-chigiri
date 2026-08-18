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
  "現在の商品写真",
  // ここから記入欄
  "確認結果",
  "正しい公式URL",
  "正しい価格",
  "正しい内容量",
  "商品写真ファイル名",
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
    現在の商品写真: p.imagePath ?? "",
    確認結果: "",
    正しい公式URL: "",
    正しい価格: "",
    正しい内容量: "",
    商品写真ファイル名: "",
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
 * 商品写真は public/products/ に置いたものだけを指す。
 * 外部URLを書かれても受け付けない（直リンクはしない方針のため）。
 * domain/recommendation/product-image.ts の IMAGE_PATH_RE と同じ形。
 */
const IMAGE_PATH_RE = /^\/products\/[a-z0-9][a-z0-9-]*\.(jpg|jpeg|png|webp)$/;

/**
 * 記入済みの行をカタログへ反映する。
 *
 * - 「確認結果」が空の行は手つかずとみなし、何もしない
 * - ok/fix の行だけ sourceCheckedAt と dataConfidence を更新する
 * - 確認日が無い、または形式が違う行はエラーにして反映しない
 *   （確認日の無い「確認済み」を作らないため）
 * - drop の行は削除対象として返すだけで、ここでは消さない
 *
 * @param options.imageExists 画像ファイルが実在するかを返す関数。
 *   渡すと、置かれていないファイル名を指した行をエラーにする
 *   （読み込めない画像を指したまま「確認済み」にしないため）。
 *
 * @returns {{products: any[], applied: string[], dropped: string[], skipped: string[], errors: string[]}}
 */
export function applyVerification(products, rows, options = {}) {
  const imageExists = options.imageExists ?? (() => true);
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

    const checkedAt = (row["確認日"] ?? "").trim();
    if (!DATE_RE.test(checkedAt)) {
      errors.push(
        `${id}: 確認日が YYYY-MM-DD 形式ではありません（${checkedAt || "空欄"}）。確認日の無い突合済みは作りません`,
      );
      continue;
    }

    if (isFix) {
      const url = (row["正しい公式URL"] ?? "").trim();
      const price = (row["正しい価格"] ?? "").trim();
      const volume = (row["正しい内容量"] ?? "").trim();

      if (url.length > 0) {
        if (!/^https:\/\//.test(url)) {
          errors.push(`${id}: 公式URLは https で始まる必要があります（${url}）`);
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

      const image = (row["商品写真ファイル名"] ?? "").trim();
      if (image.length > 0) {
        // ファイル名だけ書かれた場合も受け付ける
        const path = image.startsWith("/") ? image : `/products/${image}`;
        if (!IMAGE_PATH_RE.test(path)) {
          errors.push(
            `${id}: 商品写真は public/products/ に置いた jpg/png/webp のファイル名で指定してください（${image}）`,
          );
          continue;
        }
        if (!imageExists(path)) {
          errors.push(`${id}: public${path} が見つかりません`);
          continue;
        }
        product.imagePath = path;
      }
    }

    product.sourceCheckedAt = checkedAt;
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
  };
}

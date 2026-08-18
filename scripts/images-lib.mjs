/**
 * 商品写真の取り込みで使う判定。
 *
 * ここに副作用を書かない（ファイルを読む・書くのは呼び出し側）。
 * 「置かれたファイルが本当に画像か」「どの商品のものか」を決めるだけ。
 */

/** 保存先。拡張子は webp に揃える（表示側の許可パターンと合わせている） */
export function targetPathFor(productId) {
  return `/products/${productId}.webp`;
}

/**
 * 中身を見て画像形式を判定する。
 *
 * 拡張子は信用しない。.jpg という名前の別形式が混ざったまま
 * 公開ディレクトリへ入るのを防ぐため、先頭のバイト列で判断する。
 */
export function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return "png";
  }
  // RIFF....WEBP
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/** 受け取る拡張子。判定は detectImageType で行うので、ここは入口の足切りだけ */
const INPUT_EXT_RE = /\.(jpe?g|png|webp)$/i;

export function isCandidateFile(filename) {
  if (filename.startsWith(".")) return false;
  return INPUT_EXT_RE.test(filename);
}

/** 拡張子を除いたファイル名を商品 id とみなす */
export function productIdFromFilename(filename) {
  return filename.replace(INPUT_EXT_RE, "").trim().toLowerCase();
}

/**
 * フォルダ内のファイルをカタログの商品に割り当てる。
 *
 * ファイル名（拡張子を除く）が商品 id と一致するものだけを取り込む。
 * 曖昧な推測はしない。取り違えた写真を出すくらいなら、
 * 取り込まずに未対応として報告する。
 *
 * @returns {{matched: Array<{file: string, productId: string}>, unmatched: string[]}}
 */
export function matchFilesToProducts(filenames, products) {
  const known = new Set(products.map((p) => p.id));
  const matched = [];
  const unmatched = [];

  for (const file of filenames) {
    if (!isCandidateFile(file)) continue;
    const productId = productIdFromFilename(file);
    if (known.has(productId)) {
      matched.push({ file, productId });
    } else {
      unmatched.push(file);
    }
  }
  return { matched, unmatched };
}

/** 写真がまだ無い商品 */
export function productsWithoutImage(products) {
  return products.filter((p) => !p.imagePath);
}

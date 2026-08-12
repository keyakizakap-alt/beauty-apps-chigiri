/**
 * 運用画面の公開可否。
 *
 * 相談ログの内訳、モデルの選択状況、費用、判定の内部指標といった
 * 「運用者が見るもの」は、既定で利用者に見せない。
 * 見せるかどうかは環境変数だけで決め、URL を知っていても入れないようにする。
 *
 * 有効化するときは CHIGIRI_OPS=1 を本番以外の環境変数に置く。
 */
export function opsVisible(): boolean {
  return process.env.CHIGIRI_OPS === "1";
}

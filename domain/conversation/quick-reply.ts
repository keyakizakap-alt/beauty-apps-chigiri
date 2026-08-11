/**
 * その場で押せる選択肢。
 *
 * 相談の進め方（counsel）と分野の定義（experts）の両方が使うため、
 * どちらにも依存しない場所に置いて循環参照を避ける。
 */
export type QuickReply = {
  label: string;
  /** 押したときに送る文章 */
  send: string;
};

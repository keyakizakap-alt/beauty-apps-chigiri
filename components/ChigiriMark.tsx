/**
 * CHIGIRI のシンボル。
 *
 * 深緑とシャンパンカラーの2つの曲線がつながる、結び・循環のモチーフ。
 * 「買う前に、今あるものをつなぐ」＝すでにあるものを結び直す、という意味を持たせている。
 *
 * NOTE: これは仕様書の記述（4.2）から起こした暫定シンボルです。
 * 公式のブランドアセットが提供された場合は、必ずそちらへ差し替えてください。
 */
export default function ChigiriMark({
  size = 32,
  className = "",
  title,
}: {
  size?: number;
  className?: string;
  /** 指定するとアイコンとして読み上げられる。装飾用途では省略する。 */
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {/* シャンパン側の曲線 */}
      <circle cx="24" cy="24" r="18" fill="#C6A868" />
      {/* 深緑側の曲線。互いに噛み合って循環する形になる */}
      <path
        d="M24 6 A18 18 0 0 1 24 42 A9 9 0 0 1 24 24 A9 9 0 0 0 24 6 Z"
        fill="#24402F"
      />
      {/* 結び目 */}
      <circle cx="24" cy="15" r="2.6" fill="#F4ECDD" />
      <circle cx="24" cy="33" r="2.6" fill="#1B2A20" />
    </svg>
  );
}

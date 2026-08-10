/**
 * セキュリティヘッダー。
 *
 * CSP の方針:
 * - default-src 'self'。外部からのスクリプト読み込みを許可しない。
 * - connect-src は 'self' のみ。ブラウザから OrcaRouter や EC を直接叩かない
 *   （API キーがクライアントへ出ない構成であることを、ブラウザ側でも担保する）。
 * - form-action 'self'。フォーム送信先を外部に差し替えられないようにする。
 * - frame-ancestors 'none'。クリックジャッキングで承認ボタンを押させない。
 * - img-src に data: を許可（インライン装飾のみ。外部画像は読み込まない）。
 *
 * 'unsafe-inline' は Next.js のハイドレーション用インラインスクリプトのために
 * 必要になる。nonce 方式へ移すにはミドルウェアでの nonce 配布が要るため、
 * MVP では style/script の inline を許可しつつ、外部オリジンを塞ぐ方針を取る。
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          // 販売サイトへ CHIGIRI 内の閲覧経路を渡さない
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // 承認・引き継ぎに関わる応答はキャッシュさせない
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;

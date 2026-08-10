import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CHIGIRI Beauty — 買う前に、今あるものをつなぐ。",
  description:
    "手持ちの化粧品を再編成し、本当に不足している商品だけを理由付きで提案する美容ルーティン最適化AIです。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FCFBF8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-dvh bg-washi font-sans text-sumi antialiased">
        {children}
      </body>
    </html>
  );
}

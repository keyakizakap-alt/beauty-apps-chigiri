import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppSplash from "@/components/AppSplash";

export const metadata: Metadata = {
  title: "CHIGIRI Beauty — 買う前に、今あるものをつなぐ。",
  description:
    "手持ちの化粧品を再編成し、本当に不足している商品だけを理由付きで提案する美容ルーティン最適化AIです。",
  applicationName: "CHIGIRI Beauty",
  manifest: "/manifest.webmanifest",
  icons: {
    // ブラウザのタブ用。SVG なのでどの解像度でも滲まない。
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    // iOS はホーム画面追加時に SVG を使えないため PNG を渡す。
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "CHIGIRI",
    statusBarStyle: "default",
  },
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
        <AppSplash />
        {children}
      </body>
    </html>
  );
}

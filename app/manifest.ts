import type { MetadataRoute } from "next";

/**
 * PWA マニフェスト。
 * ホーム画面へ追加したときに、ブラウザのショートカットではなく
 * CHIGIRI のアイコンとブランド色で開くようにする。
 *
 * アイコンは scripts/build-icons.mjs で app/icon.svg から書き出したものを使う
 * （リクエストごとの画像生成を避けるため、成果物を public/icons へ置いている）。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CHIGIRI Beauty — 買う前に、今あるものをつなぐ。",
    short_name: "CHIGIRI",
    description:
      "手持ちの化粧品を再編成し、本当に不足している商品だけを理由付きで提案する美容ルーティン最適化AIです。",
    lang: "ja",
    start_url: "/",
    display: "standalone",
    background_color: "#FCFBF8",
    theme_color: "#26415E",
    orientation: "portrait",
    categories: ["lifestyle", "shopping", "health"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Android のアダプティブアイコン用（OS 側が任意の形に切り抜く）
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "チャットで相談する",
        url: "/chat",
      },
      {
        name: "買わずに済んだ記録",
        url: "/ledger",
      },
    ],
  };
}

import type { Config } from "tailwindcss";

/**
 * CHIGIRI Beauty デザインシステム。
 *
 * 「静かで上質、清潔感があり、相談しやすい美容相談室」の雰囲気にする。
 * 管理画面にも派手な EC にもしない。
 *
 * 色の役割:
 *   mist    … 相談エリアの背景（淡いセージ）
 *   ivory   … サイドバー・淡い面の背景（温かみのあるクリーム）
 *   cream   … カードの地色（白）
 *   forest  … 主色（深いフォレストグリーン）。見出し・主要ボタン
 *   sage    … 副色。送信ボタン、選択中の縁
 *   champagne … 装飾のみ。本文色には使わない（コントラスト不足のため）
 *   ink / inkSoft … 文字（濃い緑黒 / グレーグリーン）
 *   clay    … 注意喚起。色だけに意味を持たせず、必ず文言を添える
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mist: "#EFF3EC",
        ivory: "#FAF9F5",
        cream: "#FFFFFF",
        greige: "#E8EAE2",

        forest: "#24402F",
        forestDeep: "#182C20",
        forestSoft: "#3A5C46",

        sage: "#8CA894",
        sageSoft: "#E3EDE3",
        sageLine: "#B9CDBE",

        champagne: "#C6A868",
        champagneSoft: "#F1E7D3",

        ink: "#1B2A20",
        inkSoft: "#6B7A6E",

        line: "#E4E6DE",
        lineGreen: "#D5E0D7",

        clay: "#8F5A42",
        claySoft: "#F4EAE3",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "Hiragino Sans",
          "Hiragino Kaku Gothic ProN",
          "Noto Sans JP",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "20px",
        panel: "28px",
        soft: "14px",
      },
      boxShadow: {
        soft: "0 6px 24px rgba(36, 64, 47, 0.05)",
        lift: "0 12px 36px rgba(36, 64, 47, 0.09)",
      },
      letterSpacing: {
        eyebrow: "0.16em",
        brand: "0.22em",
      },
    },
  },
  plugins: [],
};

export default config;

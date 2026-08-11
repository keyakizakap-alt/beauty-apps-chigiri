import type { Config } from "tailwindcss";

/**
 * CHIGIRI Beauty デザイントークン。
 *
 * 「静かで上質、清潔感があり、相談しやすい美容相談室」を目指す。
 * 管理画面にも派手な EC にもしない。
 *
 * NOTE: トークン名は既存のまま、値だけをブランドの配色（温かみのある
 * アイボリー〜淡いセージの地に、深いフォレストグリーン）へ差し替えている。
 * 名前を変えると全画面のマークアップを触ることになり、
 * 進行中の実装と衝突するため、ここでは値の変更にとどめている。
 * 名前の意味と色がずれている点は将来の整理対象。
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 地色（淡いセージ〜クリーム）
        washi: "#F3F6F1",
        kinari: "#E9EEE6",
        beige: "#DFE4DB",
        sumi: "#1B2A20",

        // 主色（深いフォレストグリーン）
        ai: "#24402F",
        aiDeep: "#182C20",

        // 注意喚起。色だけに意味を持たせず、必ず文言を添える
        sakura: "#8F5A42",
        sakuraSoft: "#F4EAE3",

        // 「買わない」を成功として見せるための落ち着いた緑
        matcha: "#4A6B52",
        matchaSoft: "#E4EDE3",

        // 対話画面の地色と、その上の深緑
        blush: "#EFF3EC",
        blushSoft: "#FAF9F5",
        mori: "#24402F",
        moriSoft: "#7E9885",

        // 装飾のみ。コントラストが足りないため本文色には使わない
        champagne: "#C6A868",
        champagneSoft: "#F1E7D3",
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
        // 20〜32px 程度の大きな角丸
        card: "20px",
        panel: "28px",
      },
      boxShadow: {
        // 広く柔らかく、強すぎない
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

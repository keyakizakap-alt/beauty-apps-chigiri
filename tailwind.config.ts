import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 白・生成り・淡いベージュを基調
        washi: "#FCFBF8",
        kinari: "#F5F1E9",
        beige: "#EAE2D6",
        sumi: "#2E2A26",
        // アクセント: 深い藍 / くすみピンク
        ai: "#26415E",
        aiDeep: "#1B2E43",
        sakura: "#C98B92",
        sakuraSoft: "#F3E1E2",
        // 「買わない」を成功として見せるための落ち着いた緑
        matcha: "#5A7355",
        matchaSoft: "#E9EFE6",
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
        card: "14px",
      },
    },
  },
  plugins: [],
};

export default config;

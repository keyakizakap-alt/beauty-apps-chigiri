import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // server-only はクライアント条件で解決されると例外を投げるため、
      // テストでは空モジュールへ差し替える（本番ビルドには影響しない）。
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});

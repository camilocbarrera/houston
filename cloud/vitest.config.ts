import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // Don't load the project postcss.config.mjs (it uses the string-plugin form
  // Next needs, which Vite rejects). Unit tests don't render CSS — an inline
  // empty PostCSS config skips the file search entirely.
  css: { postcss: { plugins: [] } },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

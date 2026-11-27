import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  // tsconfig says jsx: preserve (Next compiles it); tests that render a component need the automatic runtime
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      "@yaoflow/engine": resolve(import.meta.dirname, "../../packages/engine/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    server: { deps: { external: [/node:sqlite/] } },
  },
  ssr: { external: ["node:sqlite"] },
});

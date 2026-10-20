import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Vite configuration for the Draftly playground.
 *
 * The app consumes the library through `draftly/src` — raw TypeScript rather than
 * `dist/` — so a library edit hot-reloads here with no rebuild step. That only works
 * if Vite is allowed to crawl outside this package, hence the explicit `fs.allow`
 * entry for the monorepo root.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // `draftly/src` resolves to a sibling workspace, which is outside Vite's default
    // serving root. Without this, every raw-TS library import 403s in dev.
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))],
    },
  },
  optimizeDeps: {
    // Pre-bundling the library would freeze it at dev-server start and defeat the
    // raw-source import above.
    exclude: ["draftly"],
  },
});

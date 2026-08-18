import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/editor/index.ts",
    "src/plugins/index.ts",
    "src/preview/index.ts",
    "src/lib/index.ts",
    // Heavy plugins get their own entry points so they land in their own chunks; see
    // src/plugins/index.ts for why keeping them in the barrel leaked into every import.
    "src/plugins/mermaid.ts",
    "src/plugins/math.ts",
    "src/plugins/emoji.ts",
    "src/plugins/all.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    "@codemirror/state",
    "@codemirror/view",
    "@codemirror/language",
    "@codemirror/commands",
    "@codemirror/lang-markdown",
    "@codemirror/language-data",
    "@lezer/markdown",
    "@lezer/common",
    "@lezer/highlight",
  ],
});

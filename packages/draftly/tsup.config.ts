import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/editor/index.ts", "src/plugins/index.ts", "src/preview/index.ts", "src/lib/index.ts"],
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

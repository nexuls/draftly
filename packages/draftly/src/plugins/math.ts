/**
 * Entry point for {@link MathPlugin} — `draftly/plugins/math`.
 *
 * Separate from the `draftly/plugins` barrel because `katex`, plus its inlined stylesheet,
 * is ~475 KB bundled. Importing from here is the opt-in.
 *
 * @example
 * ```ts
 * import { createEssentialPlugins } from "draftly/plugins";
 * import { MathPlugin } from "draftly/plugins/math";
 *
 * draftly({ plugins: [...createEssentialPlugins(), new MathPlugin()] });
 * ```
 */
export { MathPlugin, latexHighlightTags } from "./math-plugin";
export type { MathPluginOptions } from "./math-plugin";

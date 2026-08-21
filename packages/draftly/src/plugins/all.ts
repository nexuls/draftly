/**
 * Every plugin Draftly ships — `draftly/plugins/all`.
 *
 * This entry point reaches `mermaid`, `katex` and `node-emoji`, so importing anything from
 * it costs roughly 6 MB before minification. That is the point: the cost is attached to an
 * import path a reader can see, rather than to the barrel every plugin comes from.
 *
 * `createAllPlugins` deliberately lives here rather than in `draftly/plugins`. tsup
 * concatenates everything reachable from an entry point into one chunk, so a
 * `createAllPlugins` sitting next to `createEssentialPlugins` would put the heavy modules
 * back in the light chunk and undo the split entirely.
 */
import type { DraftlyPlugin } from "../editor/plugin";
import { createEssentialPlugins } from "./index";
import { MermaidPlugin } from "./mermaid-plugin";
import { MathPlugin } from "./math-plugin";
import { EmojiPlugin } from "./emoji-plugin";

export { MermaidPlugin } from "./mermaid-plugin";
export { MathPlugin, latexHighlightTags } from "./math-plugin";
export type { MathPluginOptions } from "./math-plugin";
export { EmojiPlugin } from "./emoji-plugin";

/**
 * Build a fresh set of every plugin Draftly ships — the essential set plus the three
 * behind their own entry points.
 *
 * **Call this once per editor**, for the same reason as `createEssentialPlugins()`: plugin
 * instances hold per-view state, so sharing one set across editors makes them overwrite
 * each other's configuration.
 *
 * @returns A new array of newly-constructed plugin instances, owned by the caller
 *
 * @example
 * ```ts
 * import { draftly } from "draftly";
 * import { createAllPlugins } from "draftly/plugins/all";
 *
 * const extensions = draftly({ plugins: createAllPlugins() });
 * ```
 */
export function createAllPlugins(): DraftlyPlugin[] {
  return [...createEssentialPlugins(), new MathPlugin(), new MermaidPlugin(), new EmojiPlugin()];
}

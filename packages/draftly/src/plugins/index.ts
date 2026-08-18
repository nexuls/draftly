// Re-export individual plugins
//
// The three plugins with heavy third-party dependencies are deliberately absent:
// `MermaidPlugin` (mermaid, 5.3 MB), `MathPlugin` (katex, 452 KB) and `EmojiPlugin`
// (node-emoji, 312 KB). They live behind `draftly/plugins/mermaid`, `/math` and `/emoji`.
//
// This is a bundling constraint, not a stylistic one. tsup concatenates everything
// reachable from an entry point into one chunk, and a chunk's top-level
// `import mermaid from "mermaid"` runs whenever any binding in that chunk is used — so
// while these three were in this barrel, `import { HeadingPlugin } from "draftly/plugins"`
// pulled 8 MB. Adding a heavy plugin back here silently undoes that; give it its own
// entry point instead.
export { ParagraphPlugin } from "./paragraph-plugin";
export { HeadingPlugin } from "./heading-plugin";
export { InlinePlugin } from "./inline-plugin";
export { LinkPlugin } from "./link-plugin";
export { ListPlugin } from "./list-plugin";
export { TablePlugin } from "./table-plugin";
export { HTMLPlugin } from "./html-plugin";
export { ImagePlugin } from "./image-plugin";
export { CodePlugin } from "./code-plugin";
export { QuotePlugin } from "./quote-plugin";
export { HRPlugin } from "./hr-plugin";

// Plugin collections
import type { DraftlyPlugin } from "../editor/plugin";
import { ParagraphPlugin } from "./paragraph-plugin";
import { HeadingPlugin } from "./heading-plugin";
import { InlinePlugin } from "./inline-plugin";
import { LinkPlugin } from "./link-plugin";
import { ListPlugin } from "./list-plugin";
import { TablePlugin } from "./table-plugin";
import { HTMLPlugin } from "./html-plugin";
import { ImagePlugin } from "./image-plugin";
import { CodePlugin } from "./code-plugin";
import { QuotePlugin } from "./quote-plugin";
import { HRPlugin } from "./hr-plugin";

/**
 * Build a fresh set of the essential plugins — the built-in markdown features Draftly
 * enables by default.
 *
 * **Call this once per editor.** Plugin instances carry per-view state (`_context`, and in
 * `TablePlugin`'s case the deferred-work re-entrancy locks), so two editors sharing one
 * set overwrite each other's configuration and silently cancel each other's scheduled
 * work. A factory makes that impossible to get wrong by accident; the deprecated
 * {@link essentialPlugins} array does not.
 *
 * Excludes the three plugins with heavy dependencies. For everything, use
 * `createAllPlugins()` from `draftly/plugins/all`, or add the ones you want:
 *
 * ```ts
 * import { createEssentialPlugins } from "draftly/plugins";
 * import { MermaidPlugin } from "draftly/plugins/mermaid";
 *
 * const plugins = [...createEssentialPlugins(), new MermaidPlugin()];
 * ```
 *
 * The order is the registration order, which is *not* the decoration order — plugins are
 * sorted by `decorationPriority` downstream.
 *
 * @returns A new array of newly-constructed plugin instances, owned by the caller
 *
 * @example
 * ```ts
 * import { draftly } from "draftly";
 * import { createEssentialPlugins } from "draftly/plugins";
 *
 * const extensions = draftly({ plugins: createEssentialPlugins() });
 * ```
 */
export function createEssentialPlugins(): DraftlyPlugin[] {
  return [
    new ParagraphPlugin(),
    new HeadingPlugin(),
    new InlinePlugin(),
    new LinkPlugin(),
    new ListPlugin(),
    new TablePlugin(),
    new HTMLPlugin(),
    new ImagePlugin(),
    new CodePlugin(),
    new QuotePlugin(),
    new HRPlugin(),
  ];
}

/**
 * The essential plugins, as a single shared array.
 *
 * @deprecated Use {@link createEssentialPlugins} instead. These instances are module-level
 * singletons shared by every importer, and they hold per-view state — so two editors on
 * one page overwrite each other's config and cancel each other's table normalization.
 * A one-line migration: `plugins: essentialPlugins` -> `plugins: createEssentialPlugins()`.
 *
 * Retained unchanged for one deprecation cycle, including the shared-instance behaviour;
 * upgrading is what fixes the cross-talk, not merely recompiling.
 */
const essentialPlugins: DraftlyPlugin[] = createEssentialPlugins();

export { essentialPlugins };

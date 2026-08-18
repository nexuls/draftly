// Re-export individual plugins
export { ParagraphPlugin } from "./paragraph-plugin";
export { HeadingPlugin } from "./heading-plugin";
export { InlinePlugin } from "./inline-plugin";
export { LinkPlugin } from "./link-plugin";
export { ListPlugin } from "./list-plugin";
export { TablePlugin } from "./table-plugin";
export { HTMLPlugin } from "./html-plugin";
export { ImagePlugin } from "./image-plugin";
export { MathPlugin } from "./math-plugin";
export { MermaidPlugin } from "./mermaid-plugin";
export { CodePlugin } from "./code-plugin";
export { QuotePlugin } from "./quote-plugin";
export { HRPlugin } from "./hr-plugin";
export { EmojiPlugin } from "./emoji-plugin";

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
import { MathPlugin } from "./math-plugin";
import { MermaidPlugin } from "./mermaid-plugin";
import { CodePlugin } from "./code-plugin";
import { QuotePlugin } from "./quote-plugin";
import { HRPlugin } from "./hr-plugin";
import { EmojiPlugin } from "./emoji-plugin";

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
    new MathPlugin(),
    new MermaidPlugin(),
    new CodePlugin(),
    new QuotePlugin(),
    new HRPlugin(),
    new EmojiPlugin(),
  ];
}

/**
 * Build a fresh set of every plugin Draftly ships.
 *
 * Same one-set-per-editor rule as {@link createEssentialPlugins}.
 *
 * Currently returns exactly the essential set: nothing is opt-in yet, so the two factories
 * are equivalent. They are kept distinct because T-028 will move the heavy plugins
 * (`MermaidPlugin`, `MathPlugin`) out of the essential set, at which point this is the one
 * that still includes them.
 *
 * @returns A new array of newly-constructed plugin instances, owned by the caller
 */
export function createAllPlugins(): DraftlyPlugin[] {
  return createEssentialPlugins();
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

/**
 * Every plugin Draftly ships, as a single shared array.
 *
 * @deprecated Use {@link createAllPlugins} instead — see {@link essentialPlugins} for why.
 * Note that this array holds the *same instances* as `essentialPlugins`, so mutating a
 * plugin reached through one is visible through the other.
 */
const allPlugins: DraftlyPlugin[] = [...essentialPlugins];

export { essentialPlugins, allPlugins };

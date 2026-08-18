/**
 * Entry point for {@link EmojiPlugin} — `draftly/plugins/emoji`.
 *
 * Separate from the `draftly/plugins` barrel because `node-emoji` carries a full shortcode
 * dictionary, 312 KB bundled. Importing from here is the opt-in.
 *
 * @example
 * ```ts
 * import { createEssentialPlugins } from "draftly/plugins";
 * import { EmojiPlugin } from "draftly/plugins/emoji";
 *
 * draftly({ plugins: [...createEssentialPlugins(), new EmojiPlugin()] });
 * ```
 */
export { EmojiPlugin } from "./emoji-plugin";

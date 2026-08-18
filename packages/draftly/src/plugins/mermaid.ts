/**
 * Entry point for {@link MermaidPlugin} — `draftly/plugins/mermaid`.
 *
 * Separate from the `draftly/plugins` barrel because `mermaid` is 5.3 MB bundled, by far
 * the largest dependency Draftly has. Importing from here is the opt-in.
 *
 * @example
 * ```ts
 * import { createEssentialPlugins } from "draftly/plugins";
 * import { MermaidPlugin } from "draftly/plugins/mermaid";
 *
 * draftly({ plugins: [...createEssentialPlugins(), new MermaidPlugin()] });
 * ```
 */
export { MermaidPlugin } from "./mermaid-plugin";

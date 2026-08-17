/**
 * draftly/preview - Static HTML rendering for markdown
 *
 * @packageDocumentation
 */

// Main preview function
export { preview } from "./preview";

// CSS generation
export { generateCSS } from "./css-generator";
export { generateSyntaxThemeCSS } from "./syntax-theme";

// Types
export type {
  PreviewConfig,
  PreviewContext,
  GenerateCSSConfig,
  SyntaxThemeInput,
  NodeRenderer,
  NodeRendererMap,
} from "./types";

// Utilities
export { escapeHtml, defaultRenderers } from "./default-renderers";

// Renderer class (for advanced usage)
export { PreviewRenderer } from "./renderer";

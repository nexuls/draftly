import type { NodeRenderer, NodeRendererMap } from "./types";

// Re-exported rather than defined here: plugins need it too, and a plugin
// reaching into the preview pipeline for a pure string utility is the wrong
// dependency direction. `draftly/preview` has always exported it, so the
// re-export keeps that public entry point intact.
export { escapeHtml } from "../lib/escape-html";

// ============================================
// DEFAULT RENDERERS
// ============================================

const renderDocument: NodeRenderer = (_node, children) => {
  return children;
};

/**
 * Default node renderers for all markdown node types
 */
export const defaultRenderers: NodeRendererMap = {
  // Document structure
  Document: renderDocument,
};

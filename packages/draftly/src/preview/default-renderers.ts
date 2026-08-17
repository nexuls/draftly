import type { NodeRenderer, NodeRendererMap } from "./types";

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

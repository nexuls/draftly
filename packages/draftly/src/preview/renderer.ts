import type { SyntaxNode } from "@lezer/common";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import type { MarkdownConfig } from "@lezer/markdown";
import { languages } from "@codemirror/language-data";

import type { DraftlyPlugin } from "../editor/plugin";
import { ThemeEnum } from "../editor/utils";
import { createPreviewContext } from "./context";
import { defaultRenderers } from "./default-renderers";
import { escapeHtml } from "../lib/escape-html";
import { devWarn } from "../lib/dev";
import { resolveMarkdownConfig } from "../editor/markdown-cache";
import { resolveSyntaxHighlighters } from "./syntax-theme";
import type { NodeRendererMap, PreviewContext } from "./types";

/**
 * Single-entry cache for the markdown parser.
 *
 * `preview()` builds a fresh `PreviewRenderer` per call, and constructing the language
 * support pulls in the whole `@codemirror/language-data` registry. In the playground
 * that ran on every debounced keystroke.
 *
 * A single entry is enough: realistic usage renders many documents with one stable
 * plugin set, and the comparison is element-wise, so it survives the fresh arrays
 * `preview()` builds each call. It does *not* survive alternating between two different
 * plugin sets — that falls back to the old cost rather than misbehaving.
 */
let parserCache: { extensions: readonly MarkdownConfig[]; parser: ReturnType<typeof buildParser> } | null = null;

/**
 * Build the markdown parser through `@codemirror/lang-markdown`.
 *
 * Deliberately not `@lezer/markdown` directly (changed in `dab22ab`): going through the
 * language support is what makes the preview tree match the editor tree. The option
 * object is duplicated in `editor/draftly.ts` and the two must be kept in sync.
 *
 * @param extensions - Markdown parser extensions, config-level then plugin-contributed
 * @returns The configured Lezer parser
 */
function buildParser(extensions: readonly MarkdownConfig[]) {
  return markdown({
    base: markdownLanguage,
    codeLanguages: languages,
    extensions: extensions as MarkdownConfig[],
    addKeymap: true,
    completeHTMLTags: true,
    pasteURLAsLink: true,
  }).language.parser;
}

/**
 * Get the parser for an extension set, reusing the cached one when it matches.
 *
 * @param extensions - Resolved markdown extensions for this render
 * @returns A parser configured for exactly those extensions
 */
function getParser(extensions: readonly MarkdownConfig[]) {
  const cached = parserCache;
  if (
    cached &&
    cached.extensions.length === extensions.length &&
    cached.extensions.every((ext, i) => ext === extensions[i])
  ) {
    return cached.parser;
  }

  const parser = buildParser(extensions);
  parserCache = { extensions, parser };
  return parser;
}

/**
 * Renderer class that walks the syntax tree and produces HTML
 */
export class PreviewRenderer {
  private doc: string;
  private theme: ThemeEnum;
  private plugins: DraftlyPlugin[];
  private markdown: MarkdownConfig[];
  private sanitizeHtml: boolean;
  private syntaxTheme: import("./types").SyntaxThemeInput | import("./types").SyntaxThemeInput[] | undefined;
  private renderers: NodeRendererMap;
  private ctx: PreviewContext;
  private nodeToPlugins: Map<string, DraftlyPlugin[]>;

  constructor(
    doc: string,
    plugins: DraftlyPlugin[] = [],
    markdown: MarkdownConfig[],
    theme: ThemeEnum = ThemeEnum.AUTO,
    sanitize = true,
    syntaxTheme?: import("./types").SyntaxThemeInput | import("./types").SyntaxThemeInput[],
    sanitizer?: (html: string) => string
  ) {
    this.doc = doc;
    this.theme = theme;
    this.plugins = plugins;
    this.markdown = markdown;
    this.sanitizeHtml = sanitize;
    this.syntaxTheme = syntaxTheme;
    this.renderers = { ...defaultRenderers };

    const syntaxHighlighters = resolveSyntaxHighlighters(this.syntaxTheme, true);

    // Create context with reference to renderChildren
    this.ctx = createPreviewContext(
      doc,
      theme,
      this.renderChildren.bind(this),
      sanitize,
      syntaxHighlighters,
      sanitizer
    );

    // Build node-to-plugin map for O(1) lookup
    this.nodeToPlugins = this.buildNodePluginMap();
  }

  /**
   * Build a map from node names to the plugins that handle them.
   *
   * Candidates for a node are ordered by **descending `decorationPriority`**, so the
   * plugin that would win visually in the editor is the one consulted first here.
   * `renderNode` takes the first non-null result, so highest priority wins.
   *
   * That direction is the inverse of the editor's sort, and deliberately so: the editor
   * sorts ascending because it applies *every* plugin and later decorations layer over
   * earlier ones. The two surfaces have different composition models — layering versus
   * precedence — and this is what makes one priority number mean the same thing in both.
   * Before this, preview resolved conflicts by whatever order the consumer happened to
   * write their plugin array in.
   *
   * @returns Node name to prioritised candidate list
   */
  private buildNodePluginMap(): Map<string, DraftlyPlugin[]> {
    const map = new Map<string, DraftlyPlugin[]>();
    for (const plugin of this.plugins) {
      // The sharpest edge in the system: `requiredNodes` is the preview dispatch key,
      // so a plugin with a renderer but no declared nodes is silently absent from
      // preview while working perfectly in the editor. Say so during development.
      if (plugin.renderToHTML && plugin.requiredNodes.length === 0) {
        devWarn(
          `Plugin "${plugin.name}" defines renderToHTML() but declares no requiredNodes, ` +
            "so it will never be called during preview rendering."
        );
      }

      if (plugin.renderToHTML && plugin.requiredNodes.length > 0) {
        for (const nodeName of plugin.requiredNodes) {
          const list = map.get(nodeName) || [];
          list.push(plugin);
          map.set(nodeName, list);
        }
      }
    }

    for (const [nodeName, candidates] of map) {
      if (candidates.length < 2) continue;

      candidates.sort((a, b) => b.decorationPriority - a.decorationPriority);

      // Equal priority on a shared node is genuinely ambiguous -- the sort cannot break
      // the tie, so the outcome falls back to array order and the author should know.
      const [first, second] = candidates as [DraftlyPlugin, DraftlyPlugin];
      if (first.decorationPriority === second.decorationPriority) {
        devWarn(
          `Plugins "${first.name}" and "${second.name}" both claim node "${nodeName}" at ` +
            `decorationPriority ${first.decorationPriority}. Which one renders it is ` +
            "unspecified; give one a higher priority."
        );
      }
    }

    return map;
  }

  /**
   * Render the document to HTML
   */
  async render(): Promise<string> {
    // Collect markdown extensions from plugins. resolveMarkdownConfig memoizes per
    // plugin instance, which is what gives these entries the stable identity the
    // parser cache compares on.
    const extensions = [
      ...this.markdown,
      ...this.plugins.map(resolveMarkdownConfig).filter((ext): ext is MarkdownConfig => ext !== null),
    ];

    // Parse the document
    const tree = getParser(extensions).parse(this.doc);

    // Render from root
    return await this.renderNode(tree.topNode);
  }

  /**
   * Render a single node to HTML
   */
  private async renderNode(node: SyntaxNode): Promise<string> {
    const plugins = this.nodeToPlugins.get(node.name);
    const renderer = this.renderers[node.name];

    // Render the subtree at most once per node. It used to be re-rendered inside the
    // candidate loop and again for the default renderer, and since renderNode recurses,
    // that duplication compounded multiplicatively with depth -- table nodes nest three
    // deep, all three claimed by TablePlugin.
    let children: string | undefined;
    const getChildren = async (): Promise<string> => {
      children ??= await this.renderChildren(node);
      return children;
    };

    if (plugins) {
      const rendered = await getChildren();
      for (const plugin of plugins) {
        const result = await plugin.renderToHTML!(node, rendered, this.ctx);
        if (result !== null) {
          return result;
        }
      }
    }

    // Use default renderer
    if (renderer) {
      return renderer(node, await getChildren(), this.ctx);
    }

    // Unknown node - render children or text
    if (node.firstChild) {
      return await getChildren();
    }

    // Leaf node - return its text content, escaped.
    //
    // This is a safety net, not a pass-through. `defaultRenderers` holds only
    // `Document`, so most node types reach this line, and returning document source
    // unescaped is how raw HTML used to enter the output. A plugin that genuinely
    // needs to emit markup does so from `renderToHTML`, where the decision is explicit.
    return escapeHtml(this.ctx.sliceDoc(node.from, node.to));
  }

  /**
   * Render all children of a node, including text between nodes
   */
  private async renderChildren(node: SyntaxNode): Promise<string> {
    let result = "";
    let pos = node.from; // Track position to find text gaps
    let child = node.firstChild;

    while (child) {
      // Add any text between the last position and this child
      if (child.from > pos) {
        result += escapeHtml(this.ctx.sliceDoc(pos, child.from));
      }

      // Render the child node
      result += await this.renderNode(child);

      // Update position to end of this child
      pos = child.to;
      child = child.nextSibling;
    }

    // Add any trailing text after the last child
    if (pos < node.to) {
      result += escapeHtml(this.ctx.sliceDoc(pos, node.to));
    }

    return result;
  }
}

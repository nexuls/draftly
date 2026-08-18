import { StyleModule } from "style-mod";
import { draftlyBaseStyles } from "../editor/theme";
import { ThemeEnum } from "../editor/utils";
import type { GenerateCSSConfig } from "./types";
import { generateSyntaxThemeCSS } from "./syntax-theme";

/**
 * Rendered base CSS, keyed by wrapper class.
 *
 * `generateCSS` is commonly called once per render on the server, and the rules
 * only depend on the wrapper name, so there is no reason to re-render them.
 */
const baseStyleCache = new Map<string, string>();

/**
 * Render {@link draftlyBaseStyles} for the static preview.
 *
 * The editor's selectors name two elements — the surface root (`&.cm-draftly`)
 * and the content container (`.cm-content`). In the preview a single wrapper
 * plays both roles, so both collapse onto it; the content rules are emitted
 * second and win where the two overlap, which is the same order the editor
 * resolves them in.
 *
 * Sharing one source of truth is what keeps preview padding, width and
 * typography from drifting away from the editor's.
 *
 * @param wrapperClass - Wrapper class name, without the leading dot
 * @returns Base CSS for the preview
 */
function generateBaseStyles(wrapperClass: string): string {
  const cached = baseStyleCache.get(wrapperClass);
  if (cached !== undefined) return cached;

  const wrapperSelector = `.${wrapperClass}`;
  const rules = new StyleModule(draftlyBaseStyles, {
    finish: (selector) =>
      selector.replace(/&\.cm-draftly \.cm-content/g, wrapperSelector).replace(/&\.cm-draftly/g, wrapperSelector),
  }).getRules();

  baseStyleCache.set(wrapperClass, rules);
  return rules;
}

/**
 * Generate CSS for preview rendering
 *
 * @param config - CSS generation configuration
 * @returns CSS string
 *
 * @example
 * ```ts
 * import { generateCSS } from 'draftly/preview';
 * import { HeadingPlugin, ListPlugin } from 'draftly/plugins';
 *
 * const css = generateCSS({
 *   plugins: [new HeadingPlugin(), new ListPlugin()],
 *   theme: ThemeEnum.AUTO,
 *   includeBase: true,
 * });
 * ```
 */
export function generateCSS(config: GenerateCSSConfig = {}): string {
  const {
    plugins = [],
    theme = ThemeEnum.AUTO,
    wrapperClass = "draftly-preview",
    includeBase = true,
    syntaxTheme,
  } = config;

  const cssChunks: string[] = [];

  // Include base styles, derived from the editor's own base theme
  if (includeBase) {
    cssChunks.push(generateBaseStyles(wrapperClass));
  }

  // Collect syntax highlight styles (`tok-*` classes) from CodeMirror theme/extensions
  const syntaxCSS = generateSyntaxThemeCSS(syntaxTheme, wrapperClass);
  if (syntaxCSS) {
    cssChunks.push("/* syntax-theme */\n" + syntaxCSS);
  }

  // Collect styles from plugins
  for (const plugin of plugins) {
    const pluginCSS = plugin.getPreviewStyles(theme, wrapperClass);
    if (pluginCSS) cssChunks.push(`/* ${plugin.name} - ${plugin.version} */\n` + pluginCSS);
  }

  return cssChunks.join("\n\n");
}

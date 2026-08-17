import { ThemeEnum } from "../editor/utils";
import type { GenerateCSSConfig } from "./types";
import { generateSyntaxThemeCSS } from "./syntax-theme";

/**
 * Base CSS styles for preview rendering
 */
const baseStyles = `.draftly-preview {
  padding: 0 0.5rem;
}`;

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

  // Include base styles
  if (includeBase) {
    // Replace default wrapper class if custom one is provided
    if (wrapperClass !== "draftly-preview") {
      cssChunks.push(baseStyles.replace(/\.draftly-preview/g, `.${wrapperClass}`));
    } else {
      cssChunks.push(baseStyles);
    }
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

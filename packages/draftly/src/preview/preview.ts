import { ThemeEnum } from "../editor/utils";
import { PreviewRenderer } from "./renderer";
import type { PreviewConfig } from "./types";

/**
 * Render markdown to semantic HTML
 *
 * @param markdown - Markdown string to render
 * @param config - Preview configuration
 * @returns HTML string
 *
 * @example
 * ```ts
 * import { preview } from 'draftly/preview';
 * import { HeadingPlugin, ListPlugin } from 'draftly/plugins';
 *
 * const html = preview('# Hello World', {
 *   plugins: [new HeadingPlugin(), new ListPlugin()],
 *   wrapperClass: 'draftly-preview',
 * });
 * ```
 */
export async function preview(markdown: string, config: PreviewConfig = {}): Promise<string> {
  const {
    plugins = [],
    markdown: markdownConfig = [],
    wrapperClass = "draftly-preview",
    wrapperTag = "article",
    sanitize = true,
    theme = ThemeEnum.AUTO,
    syntaxTheme,
  } = config;

  // Create renderer and generate HTML
  const renderer = new PreviewRenderer(markdown, plugins, markdownConfig, theme, sanitize, syntaxTheme);
  const content = await renderer.render();

  // Wrap in container
  const classAttr = wrapperClass ? ` class="${wrapperClass}"` : "";
  return `<${wrapperTag}${classAttr}>\n${content}</${wrapperTag}>`;
}

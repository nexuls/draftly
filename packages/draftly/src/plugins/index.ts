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
 * Default plugins
 *
 * This is the set of essential plugins
 */
const essentialPlugins: DraftlyPlugin[] = [
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

/**
 * All plugins
 *
 * This is the set of all plugins available with draftly
 */
const allPlugins: DraftlyPlugin[] = [...essentialPlugins];

export { essentialPlugins, allPlugins };

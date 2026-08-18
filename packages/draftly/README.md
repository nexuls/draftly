<h1 align="center">Draftly</h1>

<p align="center">
  <strong>A modern, extensible markdown editor and previewer for the web.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/draftly"><img src="https://img.shields.io/npm/v/draftly?style=flat-square&color=blue" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/draftly"><img src="https://img.shields.io/npm/dm/draftly?style=flat-square" alt="npm downloads" /></a>
  <a href="https://github.com/NeuroNexul/draftly/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/draftly?style=flat-square" alt="license" /></a>
  <a href="https://github.com/NeuroNexul/draftly"><img src="https://img.shields.io/github/stars/NeuroNexul/draftly?style=flat-square" alt="GitHub stars" /></a>
  <img src="https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/CodeMirror-6-orange?style=flat-square" alt="CodeMirror 6" />
</p>

<p align="center">
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#usage">Usage</a> •
  <a href="#features">Features</a> •
  <a href="#api-reference">API</a> •
  <a href="#license">License</a>
</p>

---

## Overview

**Draftly** is a powerful, pluggable markdown editor and preview toolkit built on top of **CodeMirror 6**. It provides a seamless "rich text" editing experience while preserving standard markdown syntax. Draftly also includes a static HTML renderer that produces output visually identical to the editor, making it perfect for blogs, documentation sites, and content management systems.

### Why Draftly?

- 🚀 **Modern Architecture**: Built on CodeMirror 6 with incremental Lezer parsing.
- 🎨 **Rich Editing**: WYSIWYG-like experience with full markdown control.
- 🔌 **Extensible Plugin System**: Add custom rendering, keymaps, and syntax.
- 🖼️ **Static Preview**: Render markdown to semantic HTML with visual parity.
- 🌗 **Theming**: First-class support for light and dark modes.
- 📦 **Modular Exports**: Import only what you need (`draftly/editor`, `draftly/preview`, `draftly/plugins`).

---

## Installation

Install the package via your preferred package manager:

```bash
# npm
npm install draftly

# yarn
yarn add draftly

# pnpm
pnpm add draftly

# bun
bun add draftly
```

### Peer Dependencies

Draftly requires the following CodeMirror packages as peer dependencies. Make sure they are installed in your project:

```bash
npm install @codemirror/commands @codemirror/lang-markdown @codemirror/language @codemirror/language-data @codemirror/state @codemirror/view
```

---

## Quick Start

Get up and running in seconds.

```tsx
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { draftly } from "draftly";

const view = new EditorView({
  state: EditorState.create({
    doc: "# Hello, Draftly!",
    extensions: [draftly()],
  }),
  parent: document.getElementById("editor")!,
});
```

---

## Usage

Draftly is designed for flexibility. Use it as a CodeMirror extension for interactive editing or as a standalone renderer for static previews.

### Editor Integration

Here's a complete example using `@uiw/react-codemirror`:

```tsx
import CodeMirror from "@uiw/react-codemirror";
import { draftly, createAllPlugins, ThemeEnum } from "draftly";
import { githubDark } from "@uiw/codemirror-theme-github";

function MarkdownEditor() {
  return (
    <CodeMirror
      value="# Welcome to Draftly\n\nStart writing..."
      height="500px"
      extensions={[
        draftly({
          theme: ThemeEnum.DARK,
          themeStyle: githubDark,
          plugins: createAllPlugins(),
          lineWrapping: true,
          history: true,
          indentWithTab: true,
          onNodesChange: (nodes) => console.log("AST:", nodes),
        }),
      ]}
    />
  );
}
```

#### Editor Configuration (`DraftlyConfig`)

| Option                | Type                             | Default          | Description                                              |
| --------------------- | -------------------------------- | ---------------- | -------------------------------------------------------- |
| `theme`               | `ThemeEnum`                      | `ThemeEnum.AUTO` | Theme mode: `LIGHT`, `DARK`, or `AUTO`.                  |
| `themeStyle`          | `Extension`                      | `undefined`      | CodeMirror theme extension (e.g., `githubDark`).         |
| `plugins`             | `DraftlyPlugin[]`                | `[]`             | Plugins to enable for rendering and parsing.             |
| `baseStyles`          | `boolean`                        | `true`           | Load default base styles.                                |
| `disableViewPlugin`   | `boolean`                        | `false`          | Disable rich rendering (raw markdown mode).              |
| `defaultKeybindings`  | `boolean`                        | `true`           | Enable default CodeMirror keybindings.                   |
| `history`             | `boolean`                        | `true`           | Enable undo/redo history.                                |
| `indentWithTab`       | `boolean`                        | `true`           | Use Tab for indentation.                                 |
| `highlightActiveLine` | `boolean`                        | `true`           | Highlight the current line (in raw mode).                |
| `lineWrapping`        | `boolean`                        | `true`           | Enable line wrapping.                                    |
| `onNodesChange`       | `(nodes: DraftlyNode[]) => void` | `undefined`      | Callback fired on every document update with parsed AST. |
| `markdown`            | `MarkdownConfig[]`               | `[]`             | Additional Lezer markdown parser extensions.             |
| `extensions`          | `Extension[]`                    | `[]`             | Additional CodeMirror extensions.                        |
| `keymap`              | `KeyBinding[]`                   | `[]`             | Additional keybindings.                                  |

---

### Static Preview

Render markdown to semantic HTML for server-side rendering, static site generation, or read-only views.

```tsx
import { preview, generateCSS, createAllPlugins, ThemeEnum } from "draftly";
import { githubLight } from "@uiw/codemirror-theme-github";

const plugins = createAllPlugins();

const markdown = `
# Hello World

This is a **bold** statement with some \`inline code\`.

- Item 1
- Item 2
- Item 3
`;

// Generate HTML
const html = preview(markdown, {
  theme: ThemeEnum.LIGHT,
  plugins,
  sanitize: true,
  wrapperClass: "prose",
});

// Generate matching CSS
const css = generateCSS({
  theme: ThemeEnum.LIGHT,
  plugins,
  wrapperClass: "prose",
  includeBase: true,
  syntaxTheme: githubLight,
});

// Use in your app
function ArticlePreview() {
  return (
    <>
      <style>{css}</style>
      <article dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
```

#### Preview Configuration (`PreviewConfig`)

| Option         | Type               | Default             | Description                           |
| -------------- | ------------------ | ------------------- | ------------------------------------- |
| `plugins`      | `DraftlyPlugin[]`  | `[]`                | Plugins for rendering.                |
| `theme`        | `ThemeEnum`        | `ThemeEnum.AUTO`    | Theme mode.                           |
| `sanitize`     | `boolean`          | `true`              | Sanitize HTML output. **Browser only** — see below. |
| `sanitizer`    | `(html) => string` | `undefined`         | Sanitizer to use instead of the bundled DOMPurify. Required for SSR. |
| `wrapperClass` | `string`           | `"draftly-preview"` | CSS class for the wrapper element.    |
| `wrapperTag`   | `string`           | `"article"`         | HTML tag for the wrapper element.     |
| `markdown`     | `MarkdownConfig[]` | `[]`                | Additional parser extensions.         |

> [!WARNING]
> **`sanitize: true` does nothing outside a browser.** It is implemented with DOMPurify,
> which needs a DOM, so during SSR or static generation the option is a no-op and any HTML
> in the markdown is emitted **unsanitized**. Draftly warns on the console when this
> happens, but if you render untrusted markdown on a server you must pass your own
> sanitizer:
>
> ```ts
> import DOMPurify from "isomorphic-dompurify";
>
> preview(markdown, {
>   plugins: createAllPlugins(),
>   sanitizer: (html) => DOMPurify.sanitize(html),
> });
> ```
>
> Draftly does not bundle `jsdom` — it is heavy, and every browser consumer would pay for
> it. Sanitizing at the application layer works equally well.


#### CSS Configuration (`GenerateCSSConfig`)

| Option         | Type                                         | Default             | Description                                                                   |
| -------------- | -------------------------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| `plugins`      | `DraftlyPlugin[]`                            | `[]`                | Plugins to collect preview styles from.                                       |
| `theme`        | `ThemeEnum`                                  | `ThemeEnum.AUTO`    | Theme mode for plugin preview styles.                                         |
| `wrapperClass` | `string`                                     | `"draftly-preview"` | Wrapper class used for CSS scoping.                                           |
| `includeBase`  | `boolean`                                    | `true`              | Include Draftly base preview layout styles.                                   |
| `syntaxTheme`  | `HighlightStyle \| Extension \| Extension[]` | `undefined`         | CodeMirror syntax theme/extensions used to generate `tok-*` syntax token CSS. |

---

## Features

### 🎯 Rich Text Editing

Draftly's `ViewPlugin` decorates the editor to hide markdown syntax and render styled content inline. This provides a WYSIWYG-like experience while keeping the source as plain markdown.

- **Inline Formatting**: Bold, italic, strikethrough, and code are styled in-place.
- **Headings**: Rendered with proper sizes and weights.
- **Lists**: Ordered and unordered lists with custom bullets.
- **Images**: Displayed inline with alt text and captions.
- **Links**: Clickable with visual distinction.
- **Code Blocks**: Syntax highlighted with language detection.

### 🔌 Plugin Architecture

Every feature in Draftly is a plugin. Plugins can provide:

- **CodeMirror Extensions**: Custom decorations, widgets, and behaviors.
- **Markdown Parser Extensions**: Extend the Lezer parser for custom syntax.
- **Keymaps**: Add keyboard shortcuts.
- **Themes**: Inject custom styles based on the current theme.
- **Preview Renderers**: Define how elements are rendered to static HTML.

```typescript
import { DraftlyPlugin } from "draftly/editor";

class MyCustomPlugin extends DraftlyPlugin {
  name = "my-custom-plugin";

  onRegister(context) {
    console.log("Plugin registered!", context.config);
  }

  getExtensions() {
    return [
      /* CodeMirror extensions */
    ];
  }

  getKeymap() {
    return [
      /* KeyBinding[] */
    ];
  }

  getMarkdownConfig() {
    return {
      /* MarkdownConfig */
    };
  }

  theme(mode) {
    return {
      /* Theme spec */
    };
  }
}
```

### 🌲 AST Access

Access the parsed document structure via the `onNodesChange` callback. Perfect for building:

- **Table of Contents**
- **Document Outlines**
- **Navigation Breadcrumbs**
- **Word/Line Counters**

```typescript
type DraftlyNode = {
  from: number; // Start position
  to: number; // End position
  name: string; // Node type (e.g., "Heading", "Paragraph")
  children: DraftlyNode[];
  isSelected: boolean; // True if cursor is within this node
};
```

### 🌗 Theming

Draftly provides seamless theming with automatic light/dark mode support:

- **Auto Detection**: Follows system preference with `ThemeEnum.AUTO`.
- **Manual Control**: Force `ThemeEnum.LIGHT` or `ThemeEnum.DARK`.
- **Custom Themes**: Pass any CodeMirror theme via `themeStyle`.
- **Preview Parity**: CSS generation ensures preview matches editor styling.

### 📦 Modular Imports

Import only what you need to minimize bundle size:

```typescript
// Full package
import { draftly, preview, createAllPlugins } from "draftly";

// Editor only
import { draftly, DraftlyPlugin } from "draftly/editor";

// Preview only
import { preview, generateCSS } from "draftly/preview";

// Individual plugins
import { HeadingPlugin, ListPlugin } from "draftly/plugins";
```

---

## API Reference

### Exports

| Export          | Path              | Description                                     |
| --------------- | ----------------- | ----------------------------------------------- |
| `draftly`       | `draftly/editor`  | Main editor extension factory.                  |
| `DraftlyPlugin` | `draftly/editor`  | Base class for creating plugins.                |
| `ThemeEnum`     | `draftly/editor`  | Enum for theme modes (`AUTO`, `LIGHT`, `DARK`). |
| `DraftlyNode`   | `draftly/editor`  | Type for AST nodes.                             |
| `preview`       | `draftly/preview` | Function to render markdown to HTML.            |
| `generateCSS`   | `draftly/preview` | Function to generate CSS for preview styling.   |
| `createEssentialPlugins()` | `draftly/plugins` | Builds a fresh set of the essential plugins. Call once per editor. |
| `createAllPlugins()`       | `draftly/plugins` | Builds a fresh set of every built-in plugin. Call once per editor. |
| ~~`allPlugins`~~           | `draftly/plugins` | **Deprecated** — shared array of all built-in plugins. Use `createAllPlugins()`. |

---

## Keyboard Shortcuts

Contributed by the built-in plugins. `Mod` is `Cmd` on macOS and `Ctrl` elsewhere.

| Shortcut                                | Action                                           |
| --------------------------------------- | ------------------------------------------------ |
| `Mod-B` / `Mod-I` / `Mod-Shift-S`       | Bold / italic / strikethrough                    |
| `Mod-,` / `Mod-.`                       | Subscript / superscript                          |
| `Mod-Shift-H`                           | Highlight                                        |
| `Mod-E` / `Mod-Shift-E`                 | Inline code / fenced code block                  |
| `Mod-K`                                 | Link                                             |
| `Mod-Shift-I`                           | Image                                            |
| `Mod-Shift-8` / `Mod-Shift-7`           | Bullet list / ordered list                       |
| `Mod-Shift-9`                           | Task list                                        |
| `Mod-Enter`                             | Toggle the task(s) on the selected lines         |
| `Mod-Shift-T`                           | Insert table                                     |
| `Mod-Alt-Down` / `Mod-Alt-Right`        | Add table row / column                           |
| `Mod-Alt-Backspace` / `Mod-Alt-Delete`  | Remove table row / column                        |
| `Tab` / `Shift-Tab` (in a table)        | Next / previous cell                             |
| `Shift-Enter` (in a table)              | Insert a line break inside a cell                |

`Mod-Enter` is the only way to toggle a task without a mouse: the rendered checkbox is
deliberately not focusable, because focusable children inside a `contenteditable` surface
interfere with the editor's own focus and selection handling.

---

## Browser Support

Draftly supports all modern browsers:

| Browser | Version |
| ------- | ------- |
| Chrome  | 88+     |
| Firefox | 78+     |
| Safari  | 14+     |
| Edge    | 88+     |

Table column alignment in the **raw markdown** uses `Intl.Segmenter` (Chrome 87+,
Safari 14.1+, Firefox 125+) to group grapheme clusters. Where it is unavailable Draftly
falls back to per-code-point measurement, which still handles CJK, emoji and combining
marks and only slightly over-estimates emoji built from ZWJ sequences. The support floor
above is unchanged, and the rendered table view is unaffected either way — it is laid out
with CSS, not with padding.

---

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a pull request.

---

## License

[MIT](LICENSE) © [NeuroNexul](https://github.com/NeuroNexul)

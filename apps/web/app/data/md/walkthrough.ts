export default `
# Draftly — A Complete Walkthrough

**Draftly** is a rich Markdown editor extension for CodeMirror 6. It transforms a standard code editor into a beautiful, WYSIWYG-style writing experience — rendering headings, images, math, diagrams, and more **inline** as you type.

This walkthrough covers every feature, plugin, and API surface area. Let's dive in.

---
## 1. Getting Started
### Installation
Install the package via npm:

\`\`\`shell title="npm"
npm install draftly
\`\`\`

#### Peer Dependencies
Draftly requires the following CodeMirror 6 peer dependencies:

\`\`\`shell title="peer deps" line-numbers
npm install @codemirror/commands @codemirror/lang-markdown @codemirror/language @codemirror/language-data @codemirror/state @codemirror/view
\`\`\`

### Minimal Setup
The \`draftly()\` function returns a CodeMirror extension bundle. Drop it into any \`EditorView\`:

\`\`\`ts title="main.ts" line-numbers caption="This is all you need to get a rich editor up and running."
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { draftly } from "draftly/editor";
import { createAllPlugins } from "draftly/plugins/all";

const view = new EditorView({
  state: EditorState.create({
    doc: "# Hello, Draftly!",
    extensions: [draftly({ plugins: createAllPlugins() })],
  }),
  parent: document.getElementById("editor")!,
});
\`\`\`

---
## 2. Configuration
The \`draftly()\` function accepts a \`DraftlyConfig\` object. Here is a full example with all options:

\`\`\`ts title="config.ts" line-numbers {4-15}
import { draftly } from "draftly/editor";
import { createAllPlugins } from "draftly/plugins/all";

const extensions = draftly({
  theme: "auto",                // "auto" | "dark" | "light"
  baseStyles: true,             // Apply default styling
  plugins: createAllPlugins(),  // One set per editor
  defaultKeybindings: true,     // Default CodeMirror keybindings
  history: true,                // Undo / Redo
  indentWithTab: true,          // Tab indentation
  highlightActiveLine: true,    // Highlight current line (raw mode)
  lineWrapping: true,           // Soft word wrap
  disableViewPlugin: false,     // Disable rich rendering (raw mode)
  onNodesChange: (nodes) => {}, // Callback on AST changes
});
\`\`\`

> Setting \`disableViewPlugin: true\` turns Draftly into a plain Markdown editor — no decorations, no widgets, just raw text.

---
## 3. Modular Exports
Draftly ships three entry points so you can import only what you need:

| Entry Point        | What it provides |
|--------------------|-----------------|
| \`draftly/editor\`   | Core \`draftly()\` function, \`DraftlyPlugin\` base class, utilities |
| \`draftly/plugins\`  | The light built-in plugins + \`createEssentialPlugins()\` |
| \`draftly/plugins/all\` | \`createAllPlugins()\` — everything, including the heavy plugins |
| \`draftly/plugins/mermaid\`, \`/math\`, \`/emoji\` | The three opt-in plugins with heavy dependencies |
| \`draftly/preview\`  | Server-side \`preview()\` renderer + \`generateCSS()\` |

---
## 4. The Plugin System
Every feature in Draftly is a **plugin**. Plugins extend the abstract \`DraftlyPlugin\` class and can:

- **Contribute decorations** — Mark, line, and widget decorations applied to the editor
- **Extend the markdown parser** — Custom block/inline syntax via Lezer
- **Add keybindings** — Keyboard shortcuts scoped to the plugin
- **Provide themes** — Dark / light / auto CSS via \`createTheme()\`
- **Render to HTML** — Static preview rendering via \`renderToHTML()\`

#### Plugin Lifecycle
1. **\`onRegister(ctx)\`** — Called when the plugin is added; receives the editor config.
2. **\`onViewReady(view)\`** — Called once the \`EditorView\` is mounted.
3. **\`onViewUpdate(update)\`** — Called on every document/selection change.
4. **\`buildDecorations(ctx)\`** — Called to rebuild decorations.
5. **\`onUnregister()\`** — Cleanup hook.

#### Creating a Custom Plugin
\`\`\`ts title="my-plugin.ts" line-numbers caption="A minimal custom plugin skeleton."
import { DraftlyPlugin, DecorationContext } from "draftly/editor";

class MyPlugin extends DraftlyPlugin {
  readonly name = "my-plugin";
  readonly version = "1.0.0";

  buildDecorations(ctx: DecorationContext) {
    // Add decorations here
  }
}
\`\`\`

---
## 5. Built-in Plugins — Full Reference

Draftly ships with **12** built-in plugins. Each one handles specific Markdown constructs, provides keyboard shortcuts, applies theming, and renders to HTML for the preview.

---
### 5.1 ParagraphPlugin
Adds vertical spacing between paragraphs for visual breathing room.

This is a simple paragraph. Notice the comfortable spacing between blocks of text.

---
### 5.2 HeadingPlugin
Renders ATX headings (\`#\` through \`######\`) with proportional font sizes.

**Behaviour:** The \`#\` markers are *hidden* when the cursor is **outside** the heading, and revealed when editing.

# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

---
### 5.3 InlinePlugin
Handles inline text formatting with smart marker toggling. Formatting markers are hidden when the cursor is outside the styled range.

| Format        | Syntax         | Shortcut             | Example |
|---------------|----------------|----------------------|---------|
| **Bold**      | \`**text**\`     | \`Ctrl/Cmd + B\`       | **Bold** |
| *Italic*      | \`*text*\`       | \`Ctrl/Cmd + I\`       | *Italic* |
| ~~Strike~~    | \`~~text~~\`     | \`Ctrl/Cmd + Shift+S\` | ~~Strikethrough~~ |
| ==Highlight== | \`==text==\`     | \`Ctrl/Cmd + Shift+H\` | ==Highlighted Text== |
| ~Subscript~   | \`~text~\`       | \`Ctrl/Cmd + ,\`       | H~2~O |
| ^Superscript^ | \`^text^\`       | \`Ctrl/Cmd + .\`       | E = mc^2^ |

Combine them freely: ***Bold Italic***, ~~**Struck Bold**~~, ==**Bold Highlight**==

---
### 5.4 LinkPlugin
Full [link](https://draftly.dev) support with interactive hover tooltips and smart insertion.

**Features:**
- **Hover** a link to see a tooltip with the URL
- **Click** a rendered link to reveal the raw markdown
- **Ctrl+Click** a link to open it in a new tab
- **\`Ctrl/Cmd + K\`** to insert/toggle a link

[Visit Draftly](https://github.com/neuronexul/draftly)

---
### 5.5 ListPlugin
Supports unordered lists, ordered lists, and task lists with interactive checkboxes.

**Shortcuts:**
| Action           | Shortcut            |
|------------------|---------------------|
| Unordered list   | \`Ctrl/Cmd+Shift+8\` |
| Ordered list     | \`Ctrl/Cmd+Shift+7\` |
| Task list        | \`Ctrl/Cmd+Shift+9\` |

#### Unordered List
- First item
- Second item
  - Nested item
  - Another nested item

#### Ordered List
1. First step
2. Second step
   1. Sub-step
   2. Another sub-step

#### Task List
- [ ] Write the walkthrough
- [x] Explore all plugins
- [ ] Create custom plugin

---
### 5.6 ImagePlugin
Renders images inline with figure/figcaption semantics and lazy loading.

**Shortcut:** \`Ctrl/Cmd + Shift + I\` to insert an image.

**Syntax:** \`![alt text](url "optional title")\`

![Draftly Placeholder](https://res.cloudinary.com/djoo8ogmp/image/upload/v1746213279/uploaded/image_yjzjdl.png "A beautiful Minecraft sunset")

**Behaviour:** The image is always rendered below the syntax. When you click the image, it reveals the raw markdown for editing. Broken images show a helpful error message.

---
### 5.7 CodePlugin
The most feature-rich plugin. Handles both inline code and fenced code blocks with syntax highlighting, line numbers, highlights, title, caption, and copy button.

#### Inline Code
Use backticks for inline code: \`const x = 42;\` — the backticks are hidden when the cursor moves away.

**Shortcuts:**
| Action           | Shortcut             |
|------------------|----------------------|
| Inline code      | \`Ctrl/Cmd + E\`       |
| Code block       | \`Ctrl/Cmd + Shift+E\` |

#### Fenced Code Blocks
The CodeInfo line (after \` \` \` \`) supports these properties:

| Property       | Syntax                | Description |
|----------------|-----------------------|-------------|
| Language       | \`tsx\`                 | Syntax highlighting language |
| Title          | \`title="file.tsx"\`    | Header title |
| Caption        | \`caption="A demo"\`    | Footer caption |
| Line numbers   | \`line-numbers\`        | Show line numbers |
| Start line     | \`line-numbers{10}\`    | Start from line 10 |
| Line highlight | \`{2-4,7}\`             | Highlight lines 2—4 and 7 |
| Text highlight | \`/pattern/\`           | Highlight text matching regex |
| Specific match | \`/pattern/2-4\`        | Highlight 2nd—4th match only |
| Copy button    | \`copy\` (on by default) | Clipboard copy button |

#### Example: All Features Combined
\`\`\`tsx line-numbers{1} title="Counter.tsx" caption="A React counter component with state management." {1,4-6} /count/
import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  const increment = () => setCount(count + 1);
  const decrement = () => setCount(count - 1);

  return (
    <div>
      <button onClick={decrement}>-</button>
      <span>{count}</span>
      <button onClick={increment}>+</button>
    </div>
  );
}
\`\`\`

#### Example: Python with Line Highlights
\`\`\`python line-numbers title="fibonacci.py" {4-6} /fibonacci/
def fibonacci(n):
    """Generate Fibonacci sequence up to n terms."""
    a, b = 0, 1
    for _ in range(n):
        yield a
        a, b = b, a + b

for num in fibonacci(10):
    print(num)
\`\`\`

---
### 5.8 QuotePlugin
Renders blockquotes with a styled left border. The \`>\` markers are hidden when the cursor moves away.

> "The best time to plant a tree was 20 years ago. The second best time is now."
>
> — Chinese Proverb

---
### 5.9 MathPlugin (KaTeX)
Renders LaTeX math expressions using **KaTeX**. Supports both inline and block (display) modes with custom parsers.

#### Inline Math
The formula $E = mc^2$ explains mass-energy equivalence.

The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$.

#### Block Math (Display Mode)
$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

$$
\\begin{aligned}
\\nabla \\cdot \\mathbf{E} &= \\frac{\\rho}{\\varepsilon_0} \\\\
\\nabla \\cdot \\mathbf{B} &= 0 \\\\
\\nabla \\times \\mathbf{E} &= -\\frac{\\partial \\mathbf{B}}{\\partial t} \\\\
\\nabla \\times \\mathbf{B} &= \\mu_0 \\mathbf{J} + \\mu_0 \\varepsilon_0 \\frac{\\partial \\mathbf{E}}{\\partial t}
\\end{aligned}
$$

---
### 5.10 MermaidPlugin
Renders **Mermaid** diagrams from fenced code blocks with \` \`\`\`mermaid\` syntax. Supports \`theme\` attributes and asynchronous rendering with loading states.

\`\`\`mermaid
graph TD
    A[Write Markdown] --> B{Does it render?}
    B -->|Yes| C[Ship it!]
    B -->|No| D[Check syntax]
    D --> A
\`\`\`

Diagrams are rendered live below the code block. Click the rendered diagram to edit the definition.

---
### 5.11 HTMLPlugin
Supports raw HTML in markdown — both **inline elements** and **block-level elements**. Uses **DOMPurify** for sanitization.

#### Inline HTML
This has an <span style="color: #FF6B6B; font-weight: bold;">inline styled span</span> embedded in the text.

#### HTML Blocks
<div style="text-align: center; padding: 1rem; border-radius: 0.5rem; border: 1px solid currentColor;">
  <strong>This is a full HTML block</strong>
  <p style="margin: 0.5rem 0;">Draftly renders it inline, and reveals the raw source when clicked.</p>
</div>

---
## 6. Static Preview (Server-Side Rendering)
Draftly's **preview** module renders Markdown to semantic HTML — perfect for server-side rendering, export, or static site generation.

\`\`\`ts title="preview-example.ts" line-numbers caption="Render Markdown to HTML on the server."
import { preview } from "draftly/preview";
import { createAllPlugins } from "draftly/plugins/all";

const html = await preview("# Hello World\\n\\nSome **bold** text.", {
  plugins: createAllPlugins(),
  wrapperClass: "draftly-preview",
  wrapperTag: "article",
  sanitize: true,
  theme: "auto",
});

console.log(html);
// <article class="draftly-preview">
//   <div class="cm-draftly-line-h1"><h1 class="cm-draftly-h1">Hello World</h1></div>
//   <p class="cm-draftly-paragraph">Some <span class="cm-draftly-strong">bold</span> text.</p>
// </article>
\`\`\`

### Generating CSS
Use \`generateCSS()\` to extract all plugin styles for the preview:

\`\`\`ts title="css-gen.ts" line-numbers
import { generateCSS } from "draftly/preview";
import { createAllPlugins } from "draftly/plugins/all";

const css = generateCSS({
  plugins: createAllPlugins(),
  theme: "auto",
  wrapperClass: "draftly-preview",
  includeBase: true,
});
\`\`\`

---
## 7. Theming
Plugins use a **three-layer theme** system via \`createTheme()\`:

| Layer     | When Applied |
|-----------|-------------|
| \`default\` | Always |
| \`dark\`    | When theme is \`"dark"\` |
| \`light\`   | When theme is \`"light"\` |

\`\`\`ts title="theme-example.ts" line-numbers caption="How plugin themes are structured internally."
import { createTheme } from "draftly/editor";

const myTheme = createTheme({
  default: {
    ".cm-my-element": {
      fontSize: "1rem",
    },
  },
  dark: {
    ".cm-my-element": {
      color: "#58a6ff",
    },
  },
  light: {
    ".cm-my-element": {
      color: "#0366d6",
    },
  },
});
\`\`\`

---
## 8. Keyboard Shortcuts — Quick Reference

| Action               | Shortcut              |
|----------------------|-----------------------|
| **Bold**             | \`Ctrl/Cmd + B\`        |
| **Italic**           | \`Ctrl/Cmd + I\`        |
| **Strikethrough**    | \`Ctrl/Cmd + Shift + S\` |
| **Highlight**        | \`Ctrl/Cmd + Shift + H\` |
| **Subscript**        | \`Ctrl/Cmd + ,\`        |
| **Superscript**      | \`Ctrl/Cmd + .\`        |
| **Inline Code**      | \`Ctrl/Cmd + E\`        |
| **Code Block**       | \`Ctrl/Cmd + Shift + E\` |
| **Link**             | \`Ctrl/Cmd + K\`        |
| **Image**            | \`Ctrl/Cmd + Shift + I\` |
| **Unordered List**   | \`Ctrl/Cmd + Shift + 8\` |
| **Ordered List**     | \`Ctrl/Cmd + Shift + 7\` |
| **Task List**        | \`Ctrl/Cmd + Shift + 9\` |
| **Undo**             | \`Ctrl/Cmd + Z\`        |
| **Redo**             | \`Ctrl/Cmd + Shift + Z\` |

---
## 9. Architecture Overview
Draftly is built on a clean, layered architecture:

\`\`\`mermaid
graph LR
    A[draftly/editor] --> B[DraftlyPlugin]
    A --> C[View Plugin]
    A --> D[Theme System]
    B --> E[Decorations]
    B --> F[Markdown Parser]
    B --> G[Keymaps]
    B --> H[renderToHTML]
    H --> I[draftly/preview]
    I --> J[PreviewRenderer]
    I --> K[generateCSS]
\`\`\`

**Key Design Patterns:**
- **Plugin Architecture** — All features are encapsulated in plugins with clear interfaces
- **Cursor-Aware Rendering** — Syntax markers are hidden when the cursor is away; revealed when editing
- **Widget Decorations** — Complex elements (images, math, mermaid, checkboxes) are rendered via CodeMirror widgets
- **Preview Parity** — The same plugins that decorate the editor also render the static HTML preview

---
## 10. Summary
Draftly brings the best of both worlds: the **precision of Markdown** and the **fluidity of a WYSIWYG editor**. With its modular plugin system, full keyboard shortcut coverage, dark/light theming, and dual editor + preview rendering — it's a complete solution for modern Markdown editing.

| Feature           | Status |
|-------------------|--------|
| Headings (1—6)    | ✅     |
| Bold / Italic     | ✅     |
| Strikethrough     | ✅     |
| Highlight         | ✅     |
| Sub / Superscript | ✅     |
| Links             | ✅     |
| Images            | ✅     |
| Lists (UL/OL)     | ✅     |
| Task Lists        | ✅     |
| Code (Inline)     | ✅     |
| Code (Fenced)     | ✅     |
| Blockquotes       | ✅     |
| Math (KaTeX)      | ✅     |
| Mermaid Diagrams  | ✅     |
| HTML (Inline)     | ✅     |
| HTML (Block)      | ✅     |
| Static Preview    | ✅     |
| CSS Generation    | ✅     |
| Dark / Light Theme| ✅     |
| Custom Plugins    | ✅     |
`;

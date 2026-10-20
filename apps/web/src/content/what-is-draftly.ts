export default `
## Draftly - See What You Get
Removes the barrier between Writing and Preview.

**Draftly** is a modern, intuitive Markdown editor built on the powerful CodeMirror 6 framework, designed to deliver a truly **What You See Is What You Get (WYSIWYG)** experience for plain text. Forget the distraction of raw ~~Markdown syntax~~; with _Draftly_, your document transforms into a beautiful, readable preview as you type, while keeping the underlying Markdown accessible and editable.

![My PlaceHolder](https://res.cloudinary.com/djoo8ogmp/image/upload/v1746213279/uploaded/image_yjzjdl.png "Hello From Minecraft")
### Why Draftly?
- **🚀 Modern Architecture:** Built on CodeMirror 6 with incremental Lezer parsing.
- **🎨 Rich Editing:** WYSIWYG-like experience with full markdown control.
- **🔌 Extensible Plugin System:** Add custom rendering, keymaps, and syntax.
- **🖼️ Static Preview:** Render markdown to semantic HTML with visual parity.
- **🌗 Theming:** First-class support for light and dark modes.
- **📦 Modular Exports:** Import only what you need (draftly/editor, draftly/preview, draftly/plugins).

### Examples:
So far, we have seen headings, Images, and Lists. Let's explore some additional features you can utilise with Draftly.

#### Typography
There is inline styling for typography. **Bold** Text can also be written as __Bold__. *Italics* can be written as _Italics_. We have ~~Strikethrough~~ as well. \`Inline Code\` can be used to display code pieces.

- **Subscript:** 2H~2~O => 2H~2~ + O~2~
- **Superscript:** a^2^ + b^2^ = (a+b)^2^

#### Code Blocks:
Code blocks are useful for displaying large chunks of code. The code plugin includes several additional features that can be tweaked via CodeInfo (First Line).
- **Language** - The first thing after the code mark (\`\`\`) is the language. This is the only positional argument.
- **title=** The title of the Code Block. If not provided, *language* will be displayed in the header.
- **caption=** The caption shown below the code block.
- **line-numbers** Whether to display line numbers. Additionally can take a value as an initial line number (i.e., \`line-numbers{5}\`).
- **/pattern/** Highlight matched pattern. If no parameter is present, all instances will be highlighted. \`/pattern/3\` Only 3rd instance will be highlighted. \`/pattern/2-4\` 2nd to 4th insyances will be highlighted.
- **{line_no}** Line highlight. \`{2}\` 2nd line will be highlighted. \`{2-4}\` 2nd to 4th line will be highlighted. Both patterns can be merged with a comma. \`{2,4-6,9}\` 2, 4, 5, 6, 9th line will be highlighted.

\`\`\`tsx line-numbers title="hello.tsx" caption="This component renders 'Hello World'" /Hello World/1-5,8-10,19 {2,6-8}
"use client";
import React from "react";

export default function page(props: Props) {
  return (
    <div className="w-full h-full grid place-items-center">
        <h1>Hello World</h1>
    </div>
  )
}
\`\`\`

#### Ordered & Task Lists
1. Here's an example of **Ordered List**.
2. Here's the second Line
   1. Here's a nested List
   2. Here's a nested Second Line
- [ ] Here's a Task List
- [x] Here's a Checked Task List Item

#### Math (Katex):
- Inline Math: $\\min_{(w\\in\\mathbb R^d)}\\sum_{i=1}^n(w^Tx_i-y_i)^2$
- Block Math:

$$
\\begin{aligned}

\\nabla_w \\left( \\frac{1}{2 \\sigma^2} \\sum_{i=1}^n(w^Tx_i-y_i)^2 \\right)
      &= \\frac{1}{2\\sigma^2} \\sum_{i=1}^n \\nabla_w(w^Tx_i-y_i)^2 \\\\
      &= \\frac{1}{2\\sigma^2} \\sum_{i=1}^n 2(w^Tx_i-y_i)x_i\\\\
      &= \\frac{1}{\\sigma^2} \\sum_{i=1}^n (w^Tx_i-y_i)x_i

\\end{aligned}
$$

#### HTML:
**Draftly** Supports both inline **HTML**, **HTML blocks**, & **comment**. <span style="border: 1px solid; padding: 0 0.5rem;">Inline HTML</span>

<div style="display: grid; place-items: center">
  <svg viewBox="0 0 200 200" width="400px" xmlns="http://www.w3.org/2000/svg" aria-labelledby="t">
    <image href="https://res.cloudinary.com/djoo8ogmp/image/upload/w_500/v1770482161/uploaded/image-1770482148521_vpqle9.webp"
      width="200" height="200"
      preserveAspectRatio="xMidYMid slice"
      clip-path="url(#blobClip)"/>
    <clipPath id="blobClip">
      <path d="M43.1,-68.5C56.2,-58.6,67.5,-47.3,72.3,-33.9C77.2,-20.5,75.5,-4.9,74.2,11.3C72.9,27.6,71.9,44.5,63.8,57.2C55.7,69.8,40.6,78.2,25.5,79.2C10.4,80.1,-4.7,73.6,-20.9,69.6C-37.1,65.5,-54.5,63.9,-66,54.8C-77.5,45.8,-83.2,29.3,-85.7,12.3C-88.3,-4.8,-87.7,-22.3,-79.6,-34.8C-71.5,-47.3,-55.8,-54.9,-41.3,-64.2C-26.7,-73.6,-13.4,-84.7,0.8,-86C15,-87.2,29.9,-78.5,43.1,-68.5Z"
        transform="translate(100 100)"/>
    </clipPath>
    <path
      class="blob"
      d="M43.1,-68.5C56.2,-58.6,67.5,-47.3,72.3,-33.9C77.2,-20.5,75.5,-4.9,74.2,11.3C72.9,27.6,71.9,44.5,63.8,57.2C55.7,69.8,40.6,78.2,25.5,79.2C10.4,80.1,-4.7,73.6,-20.9,69.6C-37.1,65.5,-54.5,63.9,-66,54.8C-77.5,45.8,-83.2,29.3,-85.7,12.3C-88.3,-4.8,-87.7,-22.3,-79.6,-34.8C-71.5,-47.3,-55.8,-54.9,-41.3,-64.2C-26.7,-73.6,-13.4,-84.7,0.8,-86C15,-87.2,29.9,-78.5,43.1,-68.5Z"
      transform="translate(100 100)"
      fill="url(#imgFill)"
    />
    <path
      id="text"
      d="M43.1,-68.5C56.2,-58.6,67.5,-47.3,72.3,-33.9C77.2,-20.5,75.5,-4.9,74.2,11.3C72.9,27.6,71.9,44.5,63.8,57.2C55.7,69.8,40.6,78.2,25.5,79.2C10.4,80.1,-4.7,73.6,-20.9,69.6C-37.1,65.5,-54.5,63.9,-66,54.8C-77.5,45.8,-83.2,29.3,-85.7,12.3C-88.3,-4.8,-87.7,-22.3,-79.6,-34.8C-71.5,-47.3,-55.8,-54.9,-41.3,-64.2C-26.7,-73.6,-13.4,-84.7,0.8,-86C15,-87.2,29.9,-78.5,43.1,-68.5Z"
      transform="translate(100 100)"
      fill="none" stroke="none"
      pathLength="100"
    />
    <text class="text-content" fill="currentColor">
      <textPath href="#text" startOffset="0%">❤ MADE WITH LOVE ❤ MADE WITH LOVE ❤ MADE WITH LOVE ❤ MADE WITH LOVE
        <animate attributeName="startOffset" from="0%" to="100%" dur="15s" repeatCount="indefinite" />
      </textPath>
      <textPath href="#text" startOffset="100%">❤ MADE WITH LOVE ❤ MADE WITH LOVE ❤ MADE WITH LOVE ❤ MADE WITH LOVE
        <animate attributeName="startOffset" from="-100%" to="0%" dur="15s" repeatCount="indefinite" />
      </textPath>
    </text>
  </svg>
  <style>
    svg{
      max-width: 70vw;
      max-height: 80vh;
      aspect-ratio: 1/1;
    }
    svg>#blobClip{
      transform-origin: center;
      transition: ease-out transform .4s;
    }
    svg:hover>#blobClip{
      transform: scale(1.15) translate(0%, 0%);
    }
    svg:hover>.text-content{
      fill: white;
      mix-blend-mode: overlay;
    }
    .text-content {
      font: 700 10px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      fill: currentColor;
      mix-blend-mode: normal;
      transition: ease fill .5s;
    }
  </style>
</div>

## Installation
Install the package via your preferred package manager:
\`\`\`shell title="npm"
npm install draftly
\`\`\`

#### Peer Dependencies
Draftly requires the following CodeMirror packages as peer dependencies. Make sure they are installed in your project:
\`\`\`shell title="npm"
npm install @codemirror/commands @codemirror/lang-markdown @codemirror/language @codemirror/language-data @codemirror/state @codemirror/view
\`\`\`

#### Quick Start
Get up and running in seconds.
\`\`\`js title="index.js" line-numbers
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

In essence, **Draftly** represents a significant leap forward in Markdown editing, effectively dissolving the barrier between writing and previewing. By harnessing the modern, high-performance capabilities of CodeMirror 6, it provides a fluid, real-time WYSIWYG experience that intuitively renders everything from basic typography to complex elements like code blocks and KaTeX math equations. This seamless integration of Markdown's raw power with the immediate visual feedback of a rich text editor creates a focused, efficient, and powerful environment, making it an exceptional tool for writers, developers, and academics alike.

As **LiveMD is an early-stage project undergoing active development**, we invite you to help shape its future. Your feedback is invaluable, and we welcome contributions to this open-source initiative.
`;

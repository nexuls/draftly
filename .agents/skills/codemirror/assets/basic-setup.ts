import { EditorState, Compartment } from "@codemirror/state"
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  placeholder,
} from "@codemirror/view"
import { defaultKeymap, historyKeymap, history } from "@codemirror/commands"
import { javascript } from "@codemirror/lang-javascript"
import { oneDark } from "@codemirror/theme-one-dark"

const language = new Compartment()
const tabSize = new Compartment()

function createEditor(parent: HTMLElement, initialDoc = "", placeholderText = "") {
  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      history(),
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      drawSelection(),
      ...(placeholderText ? [placeholder(placeholderText)] : []),
      language.of(javascript({ typescript: true })),
      tabSize.of(EditorState.tabSize.of(2)),
      oneDark,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          console.log("doc changed:", update.state.doc.toString())
        }
      }),
    ],
  })

  return new EditorView({ state, parent })
}

// Usage
const editor = createEditor(document.getElementById("editor")!, "// Start coding\n", "Type here…")

// Read content
const getContent = () => editor.state.doc.toString()

// Set content
const setContent = (text: string) => {
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: text },
  })
}

// Switch language at runtime
// import { python } from "@codemirror/lang-python"
// editor.dispatch({ effects: language.reconfigure(python()) })

// Destroy when done
// editor.destroy()

export { editor, getContent, setContent }

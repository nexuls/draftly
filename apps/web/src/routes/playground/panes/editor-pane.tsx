import type { Extension } from "@codemirror/state";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { RefObject } from "react";
import type { PlaygroundMode } from "../types";
import { PageSheet } from "./page-sheet";

type EditorPaneProps = {
  /** The markdown source. */
  value: string;
  onChange: (value: string) => void;
  /** The Draftly extension bundle. */
  extensions: Extension[];
  /** The app's CodeMirror theme for the current layer. */
  theme: Extension;
  mode: PlaygroundMode;
  /** Gives the route access to the live `EditorView`. */
  editorRef: RefObject<ReactCodeMirrorRef | null>;
  /** Handle on the scroll container, so the split view can link it to the preview. */
  scrollRef?: RefObject<HTMLDivElement | null>;
};

/**
 * The editor, on the page.
 *
 * `"source"` mode turns on the gutter furniture that makes plain markdown navigable —
 * line numbers, folding, selection matching — and `"write"` mode turns all of it off,
 * because the point of the decorated surface is that it does not look like a code editor.
 *
 * The `key` is tied to the mode so CodeMirror remounts on a switch. `disableViewPlugin`
 * and the `basicSetup` flags are both extension-shape changes, and remounting is cheaper
 * to reason about than reconfiguring.
 *
 * @param props - Document text, extensions, theme, the current mode, and the refs
 * @returns The editor element
 */
export function EditorPane({ value, onChange, extensions, theme, mode, editorRef, scrollRef }: EditorPaneProps) {
  const sourceMode = mode === "source";

  return (
    <PageSheet scrollRef={scrollRef}>
      <CodeMirror
        key={`draftly-editor-${mode}`}
        ref={editorRef}
        id="draftly-editor"
        value={value}
        onChange={onChange}
        theme={theme}
        extensions={extensions}
        height="100%"
        width="100%"
        className="h-full w-full"
        autoFocus={false}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={!sourceMode}
        basicSetup={{
          lineNumbers: sourceMode,
          foldGutter: sourceMode,
          highlightActiveLine: sourceMode,
          highlightActiveLineGutter: sourceMode,
          highlightSelectionMatches: sourceMode,
          drawSelection: false,
        }}
      />
    </PageSheet>
  );
}

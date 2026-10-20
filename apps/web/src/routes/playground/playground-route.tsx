import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { DraftlyNode } from "draftly/src";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { codemirrorTheme, draftlyTheme } from "@/lib/codemirror-theme";
import { useTheme } from "@/components/theme-provider";
import { CreateDocumentDialog } from "./document-dialogs";
import { DocumentList } from "./document-list";
import { Inspector } from "./inspector/inspector";
import { EditorPane } from "./panes/editor-pane";
import { ExportPane } from "./panes/export-pane";
import { PreviewPane } from "./panes/preview-pane";
import { SplitPane } from "./panes/split-pane";
import { defaultPlaygroundConfig, selectActivePlugins } from "./plugins";
import { SidePanel } from "./side-panel";
import { StatusRail } from "./status-rail";
import { TopRail } from "./top-rail";
import type { PlaygroundConfig, PlaygroundMode } from "./types";
import { useDocuments } from "./use-documents";
import { useEditorExtensions } from "./use-editor-extensions";
import { useLinkedScroll } from "./use-linked-scroll";
import { usePreview } from "./use-preview";

/** Width in pixels at which all three columns fit side by side. Matches Tailwind's `lg`. */
const THREE_COLUMN_WIDTH = 1024;

/** One line of plain-language orientation per surface, shown in the status rail. */
const MODE_NOTES: Record<PlaygroundMode, string> = {
  write: "Move the caret into a heading or a link to see its markdown come back.",
  read: "Static HTML from preview(), styled by generateCSS().",
  split: "The same document twice: the source being decorated, and the HTML it serves.",
  source: "The decoration layer is off. This is the text the document has always been.",
  export: "Exactly what a static build would emit.",
};

/**
 * Count words, lines and characters in a document.
 *
 * Splits on whitespace runs rather than a single space: splitting on `" "` counts
 * newline-separated words as one, counts consecutive spaces as empty words, and reports 1
 * for an empty document.
 *
 * @param text - The markdown source
 * @returns The three counts
 */
function countText(text: string) {
  if (text === "") return { words: 0, lines: 0, characters: 0 };
  const trimmed = text.trim();
  return {
    words: trimmed === "" ? 0 : trimmed.split(/\s+/).length,
    lines: text.split("\n").length,
    characters: text.length,
  };
}

/**
 * The playground.
 *
 * Composition only: the document list, the surface on screen, and the inspector. Every
 * piece of behaviour lives in a hook or a child — persistence in `useDocuments`, the
 * debounced render in `usePreview`, extension composition in `useEditorExtensions`.
 *
 * @returns The playground element
 */
export function PlaygroundRoute() {
  const { resolvedTheme } = useTheme();
  const cmTheme = codemirrorTheme(resolvedTheme);
  const theme = draftlyTheme(resolvedTheme);

  const documents = useDocuments();
  const [mode, setMode] = useState<PlaygroundMode>("write");
  const [config, setConfig] = useState<PlaygroundConfig>(defaultPlaygroundConfig);
  const [nodes, setNodes] = useState<DraftlyNode[]>([]);
  const [nodesVisible, setNodesVisible] = useState(false);

  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  // Both panels start open where there is room for three columns, and closed where opening
  // one would cover the page.
  useEffect(() => {
    const roomy = window.matchMedia(`(min-width: ${THREE_COLUMN_WIDTH}px)`).matches;
    setDocumentsOpen(roomy);
    setInspectorOpen(roomy);
  }, []);

  const activePlugins = useMemo(() => selectActivePlugins(config.plugins), [config.plugins]);

  const onNodesChange = useCallback((next: DraftlyNode[]) => setNodes(next), []);

  const extensions = useEditorExtensions({
    mode,
    theme,
    plugins: activePlugins,
    editorConfig: config.editor,
    nodesVisible,
    onNodesChange,
  });

  const markdown = documents.current?.content ?? "";
  const rendered = usePreview({
    markdown,
    enabled: documents.current !== undefined && (mode === "read" || mode === "split" || mode === "export"),
    plugins: activePlugins,
    theme,
    syntaxTheme: cmTheme,
    includeBase: config.preview.includeBase,
    sanitize: config.preview.sanitize,
  });

  const counts = useMemo(() => countText(markdown), [markdown]);

  const handleNodesVisibleChange = useCallback((visible: boolean) => {
    setNodesVisible(visible);
    if (!visible) setNodes([]);
  }, []);

  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);

  // Only the split surface has two columns to keep together.
  useLinkedScroll({
    editorScrollRef,
    previewScrollRef,
    editorRef,
    markdown,
    enabled: mode === "split",
  });

  // Opening the syntax tree reconfigures the editor's extensions rather than remounting
  // it, so the view plugin's constructor -- the only place that reports nodes unprompted
  // -- never runs again. Its `update()` rebuilds the tree only for a document, selection
  // or viewport change, so re-dispatching the selection that is already there fills the
  // panel immediately instead of leaving it blank until the next keystroke. The frame of
  // delay lets CodeMirror finish reconfiguring first.
  useEffect(() => {
    if (!nodesVisible) return;

    const frame = requestAnimationFrame(() => {
      const view = editorRef.current?.view;
      if (view) view.dispatch({ selection: view.state.selection.main });
    });

    return () => cancelAnimationFrame(frame);
  }, [nodesVisible]);

  const closePanels = useCallback(() => {
    setDocumentsOpen(false);
    setInspectorOpen(false);
  }, []);

  if (!documents.ready) {
    return (
      <div className="grid min-h-svh place-items-center">
        <p className="text-muted-foreground font-mono text-xs">Opening your documents…</p>
      </div>
    );
  }

  const currentDocument = documents.current;

  /**
   * Pick the surface for the current mode.
   *
   * A function rather than a ternary chain because `"split"` makes five outcomes, and
   * rather than a child component because it would otherwise take a dozen props that it
   * only forwards. The editor and preview elements are built once and reused, so the split
   * layout composes exactly the panes the single-surface modes render.
   *
   * @returns The element for the centre pane
   */
  function renderSurface() {
    if (currentDocument === undefined) return <NoDocument onCreate={documents.create} />;
    if (mode === "export") return <ExportPane html={rendered.html} css={rendered.css} theme={cmTheme} />;

    const editorPane = (
      <EditorPane
        value={currentDocument.content}
        onChange={(value) => documents.edit(currentDocument.id, value)}
        extensions={extensions}
        theme={cmTheme}
        mode={mode}
        editorRef={editorRef}
        scrollRef={editorScrollRef}
      />
    );
    const previewPane = (
      <PreviewPane
        html={rendered.html}
        css={rendered.css}
        pending={rendered.elapsedMs === null}
        scrollRef={previewScrollRef}
      />
    );

    if (mode === "read") return previewPane;
    if (mode === "split") return <SplitPane editor={editorPane} preview={previewPane} />;
    return editorPane;
  }

  return (
    <div className="bg-desk flex h-svh flex-col overflow-hidden">
      <TopRail
        title={currentDocument?.title}
        onRename={(title) => currentDocument && documents.rename(currentDocument.id, title)}
        mode={mode}
        onModeChange={setMode}
        saveStatus={documents.saveStatus}
        documentsOpen={documentsOpen}
        onToggleDocuments={() => setDocumentsOpen((open) => !open)}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((open) => !open)}
      />

      <div className="relative flex min-h-0 flex-1">
        {/* Below `lg` the panels float over the page, so tapping away closes them. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={closePanels}
          className={`bg-foreground/20 absolute inset-0 z-20 transition-opacity duration-200 lg:hidden ${
            documentsOpen || inspectorOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />

        <SidePanel side="left" open={documentsOpen} width="w-60">
          <DocumentList
            documents={documents.documents}
            currentIndex={documents.currentIndex}
            onSelect={documents.select}
            onCreate={documents.create}
            onRemove={documents.remove}
          />
        </SidePanel>

        <main className="min-w-0 flex-1 overflow-hidden">{renderSurface()}</main>

        <SidePanel side="right" open={inspectorOpen} width="w-80">
          <Inspector
            config={config}
            onConfigChange={setConfig}
            nodes={nodes}
            onNodesVisibleChange={handleNodesVisibleChange}
          />
        </SidePanel>
      </div>

      <StatusRail counts={counts} renderMs={rendered.elapsedMs} note={MODE_NOTES[mode]} />
    </div>
  );
}

/**
 * Empty state for when every document has been deleted.
 *
 * @param props.onCreate - Called with the title of the new document
 * @returns The empty-state element
 */
function NoDocument({ onCreate }: { onCreate: (title: string) => void }) {
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="measure text-center">
        <p className="text-foreground text-xl">Nothing open.</p>
        <p className="text-muted-foreground mt-2 text-base">
          Create a document and it stays in this browser. Deleting the last one brought you here.
        </p>
        <CreateDocumentDialog onCreate={onCreate} trigger={<Button className="mt-6">New document</Button>} />
      </div>
    </div>
  );
}

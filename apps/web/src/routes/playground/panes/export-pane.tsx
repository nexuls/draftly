import { css as cssLanguage } from "@codemirror/lang-css";
import { html as htmlLanguage } from "@codemirror/lang-html";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sourceFaceTheme } from "@/lib/codemirror-theme";
import { PREVIEW_WRAPPER_CLASS } from "../use-preview";

const HTML_EXTENSIONS: Extension[] = [htmlLanguage(), EditorView.lineWrapping, sourceFaceTheme];
const CSS_EXTENSIONS: Extension[] = [cssLanguage(), EditorView.lineWrapping, sourceFaceTheme];

/** Which document the export pane is showing. */
type ExportTab = "html" | "css";

const TAB_LABELS: Record<ExportTab, string> = { html: "preview.html", css: "draftly.css" };

/**
 * The generated HTML and CSS, as a consumer would ship them.
 *
 * Two tabs rather than a split: both documents are long, and reading either one in half a
 * pane is worse than switching between them.
 *
 * The tab state is lifted out of Radix because the copy action lives in the same rail and
 * has to copy whichever document is showing.
 *
 * @param props.html - Output of `preview()`
 * @param props.css - Output of `generateCSS()`
 * @param props.theme - The app's CodeMirror theme for the current layer
 * @returns The export element
 */
export function ExportPane({ html, css, theme }: { html: string; css: string; theme: Extension }) {
  const [tab, setTab] = useState<ExportTab>("html");

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as ExportTab)}
      className="flex h-full w-full flex-col gap-0 overflow-hidden"
    >
      <div className="border-rule flex h-9 shrink-0 items-center gap-3 border-b pr-2 pl-3">
        <TabsList className="h-auto gap-px bg-transparent p-0">
          {(Object.keys(TAB_LABELS) as ExportTab[]).map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className="data-[state=active]:bg-foreground data-[state=active]:text-background text-muted-foreground h-6 rounded-[3px] px-2 font-mono text-2xs data-[state=active]:shadow-none"
            >
              {TAB_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>

        <p className="text-muted-foreground truncate font-mono text-2xs max-lg:hidden">
          both scoped to .{PREVIEW_WRAPPER_CLASS}
        </p>

        <CopyButton
          text={tab === "html" ? html : css}
          label={TAB_LABELS[tab]}
          className="ml-auto border-transparent bg-transparent"
        />
      </div>

      <TabsContent value="html" className="min-h-0 flex-1 overflow-hidden">
        <ReadOnlySource value={html} extensions={HTML_EXTENSIONS} theme={theme} />
      </TabsContent>
      <TabsContent value="css" className="min-h-0 flex-1 overflow-hidden">
        <ReadOnlySource value={css} extensions={CSS_EXTENSIONS} theme={theme} />
      </TabsContent>
    </Tabs>
  );
}

/**
 * A read-only CodeMirror filling its container.
 *
 * @param props.value - The text to show
 * @param props.extensions - Language, wrapping and face extensions
 * @param props.theme - The app's CodeMirror theme
 * @returns The source view element
 */
function ReadOnlySource({ value, extensions, theme }: { value: string; extensions: Extension[]; theme: Extension }) {
  return (
    <div className="h-full w-full overflow-auto px-1">
      <CodeMirror
        value={value}
        theme={theme}
        extensions={extensions}
        readOnly
        height="100%"
        width="100%"
        className="h-full w-full"
        autoFocus={false}
        basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: false, drawSelection: false }}
      />
    </div>
  );
}

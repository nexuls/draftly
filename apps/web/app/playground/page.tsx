"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Loader2 } from "lucide-react";
import { v4 as uuid } from "uuid";

import Footer from "./footer";
import Header from "./header";
import Devbar from "./devbar";
import Sidebar from "./sidebar";
import type { Content } from "./types";
import CreateContentDialog from "./create-content-dialog";

import whatIsDraftly from "../data/md/what-id-draftly";
import walkthrough from "../data/md/walkthrough";

import CodeMirror, { EditorView, type Extension, type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { allPlugins } from "draftly/src";
import { generateCSS, preview } from "draftly/src";
import { draftly, type DraftlyNode, type DraftlyPlugin, ThemeEnum } from "draftly/src";

// Plugin configuration - dynamic based on allPlugins
export type PluginConfig = Record<string, boolean>;

// Build default plugin config from allPlugins (all enabled by default)
const defaultPluginConfig: PluginConfig = Object.fromEntries(
  allPlugins.map((plugin) => [plugin.name.toLowerCase(), true])
);

// Configuration for devbar controls
export type PlaygroundConfig = {
  // Editor options
  editor: {
    baseStyles: boolean;
    defaultKeybindings: boolean;
    history: boolean;
    indentWithTab: boolean;
    highlightActiveLine: boolean;
    lineWrapping: boolean;
  };
  // Preview options
  preview: {
    includeBase: boolean;
    sanitize: boolean;
  };
  // Plugin toggles
  plugins: PluginConfig;
};

const defaultConfig: PlaygroundConfig = {
  editor: {
    baseStyles: true,
    defaultKeybindings: true,
    history: true,
    indentWithTab: true,
    highlightActiveLine: true,
    lineWrapping: true,
  },
  preview: {
    includeBase: true,
    sanitize: true,
  },
  plugins: defaultPluginConfig,
};

const STORAGE_KEY = "draftly-playground-contents";
const STORAGE_CURRENT_KEY = "draftly-playground-current";
const STORAGE_VERSION_KEY = "draftly-playground-version";
const DEBOUNCE_MS = 500;

// Bump this version whenever default content (whatIsDraftly / walkthrough) changes.
// The app will detect the mismatch and refresh the default entries in localStorage.
const VERSION = 1;

const DEFAULT_CONTENTS: Content[] = [
  {
    id: "0",
    title: "What is Draftly?",
    content: whatIsDraftly,
  },
  {
    id: "1",
    title: "Walkthrough",
    content: walkthrough,
  },
];

const DEFAULT_CONTENT_IDS = new Set(DEFAULT_CONTENTS.map((c) => c.id));

export type SaveStatus = "idle" | "saving" | "saved";

export default function Page() {
  const { resolvedTheme: theme } = useTheme();
  const cmTheme = theme?.includes("dark") ? githubDark : githubLight;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [devbarOpen, setDevbarOpen] = useState(false);

  // Open panels by default only on desktop (xl breakpoint = 1280px)
  useEffect(() => {
    const isDesktop = window.matchMedia("(min-width: 1280px)").matches;
    if (isDesktop) {
      setSidebarOpen(true);
      setDevbarOpen(true);
    }
  }, []);

  const [contents, setContents] = useState<Content[]>([]);
  const [currentContent, setCurrentContent] = useState<number>(-1);
  const [output, setOutput] = useState<{ html: string; css: string } | null>(null);
  const [outputTime, setOutputTime] = useState<number | null>(null);

  const [mode, setMode] = useState<"live" | "view" | "code" | "output">("live");
  const [showNodes, setShowNodes] = useState(false);
  const [nodes, setNodes] = useState<DraftlyNode[]>([]);
  const [config, setConfig] = useState<PlaygroundConfig>(defaultConfig);

  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savedIndicatorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load from localStorage on mount, with version-based cache invalidation
  useEffect(() => {
    const storedContents = localStorage.getItem(STORAGE_KEY);
    const storedCurrent = localStorage.getItem(STORAGE_CURRENT_KEY);
    const storedVersion = localStorage.getItem(STORAGE_VERSION_KEY);
    const isOutdated = storedVersion !== String(VERSION);

    if (storedContents && !isOutdated) {
      // Version matches – use stored contents as-is
      try {
        const parsed = JSON.parse(storedContents) as Content[];
        setContents(parsed);
      } catch {
        console.error("Failed to parse stored contents");
      }
    } else if (storedContents && isOutdated) {
      // Version mismatch – refresh default entries but keep user-created ones
      try {
        const parsed = JSON.parse(storedContents) as Content[];
        const userContents = parsed.filter((c) => !DEFAULT_CONTENT_IDS.has(c.id));
        const merged = [...DEFAULT_CONTENTS, ...userContents];
        setContents(merged);
        setCurrentContent(0);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        localStorage.setItem(STORAGE_CURRENT_KEY, "0");
        localStorage.setItem(STORAGE_VERSION_KEY, String(VERSION));
      } catch {
        console.error("Failed to parse stored contents during version update");
      }
    } else {
      // First visit – seed with defaults
      setContents(DEFAULT_CONTENTS);
      setCurrentContent(0);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CONTENTS));
      localStorage.setItem(STORAGE_CURRENT_KEY, "0");
      localStorage.setItem(STORAGE_VERSION_KEY, String(VERSION));
    }

    if (storedCurrent && !isOutdated) {
      const parsedCurrent = Number.parseInt(storedCurrent, 10);
      if (!Number.isNaN(parsedCurrent)) {
        setCurrentContent(parsedCurrent);
      }
    }

    setIsLoading(false);
  }, []);

  // Debounced save to localStorage
  const saveToStorage = useCallback((data: Content[], current: number) => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (savedIndicatorTimeoutRef.current) {
      clearTimeout(savedIndicatorTimeoutRef.current);
    }

    setSaveStatus("saving");

    saveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      localStorage.setItem(STORAGE_CURRENT_KEY, current.toString());
      setSaveStatus("saved");

      // Reset to idle after showing "saved" for a bit
      savedIndicatorTimeoutRef.current = setTimeout(() => {
        setSaveStatus("idle");
      }, 2000);
    }, DEBOUNCE_MS);
  }, []);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedIndicatorTimeoutRef.current) clearTimeout(savedIndicatorTimeoutRef.current);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute only when the selected content's text changes, not on every `contents` identity change
  const counts = useMemo(() => {
    const text = currentContent === -1 ? "" : (contents[currentContent]?.content ?? "");
    if (text === "") return { words: 0, lines: 0, char: 0 };

    // Split on any whitespace run, not a single space: splitting on " " counted
    // newline-separated words as one, counted consecutive spaces as empty words, and
    // returned 1 for an empty document.
    const trimmed = text.trim();
    return {
      words: trimmed === "" ? 0 : trimmed.split(/\s+/).length,
      lines: text.split("\n").length,
      char: text.length,
    };
  }, [currentContent, contents[currentContent]?.content]);

  function handleContentChange(id: string, content: string) {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (savedIndicatorTimeoutRef.current) {
      clearTimeout(savedIndicatorTimeoutRef.current);
    }

    setSaveStatus("saving");

    // Debounce both state update and localStorage save
    saveTimeoutRef.current = setTimeout(() => {
      setContents((c) => {
        const updated = c.map((currentContent) =>
          currentContent.id === id ? { ...currentContent, content } : currentContent
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        localStorage.setItem(STORAGE_CURRENT_KEY, currentContent.toString());
        return updated;
      });

      setSaveStatus("saved");

      // Reset to idle after showing "saved" for a bit
      savedIndicatorTimeoutRef.current = setTimeout(() => {
        setSaveStatus("idle");
      }, 2000);
    }, DEBOUNCE_MS);
  }

  function addNewContent(title: string) {
    const newContent: Content = {
      id: uuid(),
      title,
      content: `# ${title}\n\n## Hello World`,
    };
    const newContents = [...contents, newContent];
    const newIndex = contents.length;
    setContents(newContents);
    setCurrentContent(newIndex);
    saveToStorage(newContents, newIndex);
  }

  function deleteContent(id: string) {
    const index = contents.findIndex((c) => c.id === id);
    if (index === -1) return;

    const newContents = contents.filter((c) => c.id !== id);
    setContents(newContents);

    // Adjust currentContent if needed
    let newCurrent = currentContent;
    if (newContents.length === 0) {
      newCurrent = -1;
    } else if (currentContent >= index) {
      newCurrent = Math.max(0, currentContent - 1);
    }
    setCurrentContent(newCurrent);
    saveToStorage(newContents, newCurrent);
  }

  function renameContent(id: string, newTitle: string) {
    setContents((c) => {
      const updated = c.map((content) => (content.id === id ? { ...content, title: newTitle } : content));
      saveToStorage(updated, currentContent);
      return updated;
    });
  }

  const editor = useRef<ReactCodeMirrorRef>(null);
  function handleSetCurrentContent(index: number) {
    setCurrentContent(index);
    saveToStorage(contents, index);
  }

  // Build active plugins list based on config
  const activePlugins = useMemo<DraftlyPlugin[]>(() => {
    return allPlugins.filter((plugin) => {
      const name = plugin.name.toLowerCase() as keyof PluginConfig;
      return config.plugins[name] ?? true;
    });
  }, [config.plugins]);

  const defaultExtensions = useMemo<Extension[]>(
    () =>
      draftly({
        theme:
          theme && theme !== "system" ? (theme.includes("dark") ? ThemeEnum.DARK : ThemeEnum.LIGHT) : ThemeEnum.AUTO,
        baseStyles: config.editor.baseStyles,
        plugins: activePlugins,
        markdown: [],
        extensions: [],
        keymap: [],
        disableViewPlugin: mode === "code",
        defaultKeybindings: config.editor.defaultKeybindings,
        history: config.editor.history,
        indentWithTab: config.editor.indentWithTab,
        highlightActiveLine: config.editor.highlightActiveLine,
        lineWrapping: config.editor.lineWrapping,
        onNodesChange: (nodes) => {
          if (showNodes) setNodes(nodes);
        },
      }),
    [theme, mode, showNodes, config.editor, activePlugins]
  );

  useEffect(() => {
    // Overlapping renders: `contents` and `activePlugins` both change often, and without
    // a guard whichever render *finishes* last wins rather than whichever *started* last
    // -- so the pane could settle on output for a superseded document. The flag also
    // prevents a setState after unmount.
    let cancelled = false;

    (async () => {
      if (currentContent === -1 || !["view", "output"].includes(mode)) return;
      const start = performance.now();

      const html = await preview(contents[currentContent]?.content || "", {
        theme:
          theme && theme !== "system" ? (theme.includes("dark") ? ThemeEnum.DARK : ThemeEnum.LIGHT) : ThemeEnum.AUTO,
        plugins: activePlugins,
        markdown: [],
        syntaxTheme: cmTheme,
        sanitize: config.preview.sanitize,
        wrapperTag: "div",
        wrapperClass: "draftly-preview h-full w-full max-w-[48rem] mx-auto overflow-auto",
      });

      const css = generateCSS({
        theme:
          theme && theme !== "system" ? (theme.includes("dark") ? ThemeEnum.DARK : ThemeEnum.LIGHT) : ThemeEnum.AUTO,
        plugins: activePlugins,
        wrapperClass: "draftly-preview",
        includeBase: config.preview.includeBase,
        syntaxTheme: cmTheme,
      });

      if (cancelled) return;

      // Both inside the guard, so the reported time always belongs to the output on
      // screen rather than to a run that was superseded.
      setOutputTime(performance.now() - start);
      setOutput({ html, css });
    })();

    return () => {
      cancelled = true;
    };
  }, [currentContent, contents, theme, mode, activePlugins, config.preview, cmTheme]);

  if (isLoading) {
    return (
      <div className="min-h-svh h-svh flex flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground font-mono">Loading...</span>
      </div>
    );
  }

  return (
    <div className="min-h-svh h-svh flex flex-col">
      {/* Header */}
      <Header
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        devbarOpen={devbarOpen}
        setDevbarOpen={setDevbarOpen}
        saveStatus={saveStatus}
        mode={mode}
        setMode={setMode}
      />

      {/* Main */}
      <main className="flex-1 w-full flex flex-row overflow-hidden relative">
        {/* Mobile Backdrop */}
        <div
          className={`fixed inset-0 bg-black/50 z-30 xl:hidden transition-opacity duration-300 ${
            sidebarOpen || devbarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          onClick={() => {
            setSidebarOpen(false);
            setDevbarOpen(false);
          }}
        />

        {/* Sidebar */}
        <div
          className={cn(
            "h-full bg-background overflow-hidden transition-all duration-300 ease-in-out",
            "fixed xl:relative top-12 xl:top-0 bottom-10 xl:bottom-0 left-0 z-40 xl:z-auto",
            {
              "w-64": sidebarOpen,
              "w-0 xl:w-0": !sidebarOpen,
            }
          )}
        >
          <Sidebar
            contents={contents}
            currentContent={currentContent}
            setCurrentContent={handleSetCurrentContent}
            addNewContent={addNewContent}
            deleteContent={deleteContent}
            renameContent={renameContent}
          />
        </div>

        {/* Editor */}
        <div
          className={cn(
            "flex-1 h-full mx-2 border rounded-lg overflow-hidden flex items-center justify-center dark:bg-[#0d1117]",
            {
              "ml-0 max-xl:ml-2": sidebarOpen,
            }
          )}
        >
          {currentContent !== -1 ? (
            mode === "view" ? (
              <div className="h-full w-full overflow-auto">
                <style dangerouslySetInnerHTML={{ __html: output?.css || "" }} />
                <div dangerouslySetInnerHTML={{ __html: output?.html || "" }} />
              </div>
            ) : mode === "output" ? (
              <div className="h-full w-full">
                <div className="h-full w-full grid grid-rows-2">
                  <div className="h-full w-full flex flex-col border-b-2">
                    <CodeMirror
                      key={`draftly-output-${mode}`}
                      id={"draftly-output"}
                      autoFocus={false}
                      className={"h-full w-full"}
                      height="100%"
                      width="100%"
                      value={output?.html || ""}
                      theme={cmTheme}
                      extensions={[html(), css(), EditorView.lineWrapping]}
                      readOnly
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                    />
                  </div>
                  <div className="h-full w-full flex flex-col border-t-2">
                    <CodeMirror
                      key={`draftly-output-${mode}`}
                      id={"draftly-output"}
                      autoFocus={false}
                      className={"h-full w-full"}
                      height="100%"
                      width="100%"
                      value={output?.css || ""}
                      theme={cmTheme}
                      extensions={[css(), EditorView.lineWrapping]}
                      readOnly
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <CodeMirror
                key={`draftly-editor-${mode}`}
                id={"draftly-editor"}
                ref={editor}
                autoFocus={false}
                className={"h-full w-full"}
                height="100%"
                width="100%"
                value={contents[currentContent]?.content}
                onChange={(value) => handleContentChange(contents[currentContent]!.id, value)}
                theme={cmTheme}
                extensions={[...defaultExtensions]}
                basicSetup={{
                  lineNumbers: mode === "code",
                  foldGutter: mode === "code",
                  highlightActiveLine: mode === "code",
                  highlightActiveLineGutter: mode === "code",
                  highlightSelectionMatches: mode === "code",
                  drawSelection: false,
                }}
              />
            )
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <span className="text-muted-foreground font-mono whitespace-nowrap">No Content Selected</span>
              <CreateContentDialog
                onCreateContent={addNewContent}
                trigger={<Button className="mt-4">Create New</Button>}
              />
            </div>
          )}
        </div>

        {/* Developer Panel */}
        <div
          className={cn(
            "h-full pr-2 bg-background overflow-hidden transition-all duration-300 ease-in-out",
            "fixed xl:relative top-12 xl:top-0 bottom-10 xl:bottom-0 right-0 z-40 xl:z-auto border-l xl:border-l-0",
            {
              "w-96": devbarOpen,
              "w-0 xl:w-0 pr-0": !devbarOpen,
            }
          )}
        >
          <Devbar
            nodes={nodes}
            setShowNodes={setShowNodes}
            config={config}
            setConfig={setConfig}
            outputTime={outputTime}
          />
        </div>
      </main>

      {/* Footer */}
      <Footer counts={counts} />
    </div>
  );
}

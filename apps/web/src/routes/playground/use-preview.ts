import type { Extension } from "@codemirror/state";
import { type DraftlyPlugin, generateCSS, preview, type ThemeEnum } from "draftly/src";
import { useEffect, useState } from "react";

/**
 * How long to wait after the last change before re-rendering.
 *
 * `preview()` is async and re-parses the whole document, so it must not run per
 * keystroke. If a preview change feels laggy, suspect this before suspecting the renderer.
 */
const PREVIEW_DEBOUNCE_MS = 400;

/**
 * The wrapper class for generated preview output.
 *
 * **The same string has to reach `preview()` and `generateCSS()`** or the output is
 * completely unstyled — `generateCSS()` scopes every rule under it. Declared once here so
 * the two calls cannot drift.
 */
export const PREVIEW_WRAPPER_CLASS = "draftly-preview";

type UsePreviewOptions = {
  /** The markdown to render. */
  markdown: string;
  /** Skip rendering entirely — the reader is not looking at a surface that needs it. */
  enabled: boolean;
  plugins: DraftlyPlugin[];
  theme: ThemeEnum;
  /** The CodeMirror theme whose highlight rules become the preview's code colours. */
  syntaxTheme: Extension;
  includeBase: boolean;
  sanitize: boolean;
};

type PreviewResult = {
  html: string;
  css: string;
  /** Wall-clock time of the render that produced `html` and `css`, in milliseconds. */
  elapsedMs: number | null;
};

const EMPTY: PreviewResult = { html: "", css: "", elapsedMs: null };

/**
 * Render markdown to static HTML and CSS, debounced, with stale results discarded.
 *
 * Two renders overlap easily here: the document and the plugin set both change often.
 * Without the cancellation flag whichever render *finishes* last wins rather than whichever
 * *started* last, so the pane could settle on output for a superseded document. The flag
 * also prevents a state update after unmount, and keeps the reported time attached to the
 * output actually on screen.
 *
 * @param options - What to render and how
 * @returns The latest completed render
 */
export function usePreview(options: UsePreviewOptions): PreviewResult {
  const { markdown, enabled, plugins, theme, syntaxTheme, includeBase, sanitize } = options;
  const [result, setResult] = useState<PreviewResult>(EMPTY);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const timer = setTimeout(() => {
      void (async () => {
        const start = performance.now();

        const html = await preview(markdown, {
          theme,
          plugins,
          markdown: [],
          syntaxTheme,
          sanitize,
          wrapperTag: "div",
          wrapperClass: PREVIEW_WRAPPER_CLASS,
        });

        const css = generateCSS({
          theme,
          plugins,
          wrapperClass: PREVIEW_WRAPPER_CLASS,
          includeBase,
          syntaxTheme,
        });

        if (cancelled) return;
        setResult({ html, css, elapsedMs: performance.now() - start });
      })();
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [markdown, enabled, plugins, theme, syntaxTheme, includeBase, sanitize]);

  return result;
}

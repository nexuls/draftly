import type { Extension } from "@codemirror/state";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { createEssentialPlugins, draftly, type DraftlyPlugin } from "draftly/src";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { codemirrorTheme, draftlyTheme } from "@/lib/codemirror-theme";

/**
 * The hero editor's own plugin instances.
 *
 * The light set, deliberately: this editor is on the entry chunk, and
 * `createEssentialPlugins()` pulls neither Mermaid nor KaTeX. The playground, which does
 * want all of them, is a separate chunk with a separate set — plugin instances hold
 * per-view state, so the two editors must not share one.
 */
const demoPlugins: DraftlyPlugin[] = createEssentialPlugins();

const DEMO_SOURCE = `## The markdown never left

Draftly renders **bold text** and [links](https://draftly.dev)
in place, then pulls the decoration back when your caret
arrives — so the source is always one keystroke away.

- Lists keep their markers in the margin
- Code stays \`monospaced\` and literal

> There is no second document model. This is the file.
`;

/**
 * Substrings the scripted caret walks into, in order.
 *
 * Written as text rather than offsets so editing `DEMO_SOURCE` cannot silently point the
 * walk at the wrong construct. A substring that no longer appears is skipped.
 */
const WALK_TARGETS = ["bold text", "links](", "## The", "`monospaced`", "> There"] as const;

/** How long the caret rests on each construct. Long enough to read what changed. */
const WALK_INTERVAL_MS = 2400;

/** A beat before the walk starts, so the decorated state is seen first. */
const WALK_DELAY_MS = 1200;

/**
 * The hero: a real Draftly editor that demonstrates retraction on its own.
 *
 * The one piece of unprompted motion on the page. A caret steps through four constructs
 * and their markdown reappears under it, which is the entire product in a sentence that
 * cannot be written as convincingly as it can be shown. It stops for good the moment the
 * reader touches the editor, and never starts when `prefers-reduced-motion` is set.
 *
 * @returns The demo element
 */
export function LiveDemo() {
  const { resolvedTheme } = useTheme();
  const editor = useRef<ReactCodeMirrorRef>(null);
  const [walking, setWalking] = useState(true);

  const extensions = useMemo<Extension[]>(
    () =>
      draftly({
        theme: draftlyTheme(resolvedTheme),
        plugins: demoPlugins,
        markdown: [],
        extensions: [],
        keymap: [],
      }),
    [resolvedTheme]
  );

  useEffect(() => {
    if (!walking) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let step = 0;
    let interval: ReturnType<typeof setInterval> | undefined;

    const advance = () => {
      const view = editor.current?.view;
      if (!view) return;

      const text = view.state.doc.toString();
      const target = WALK_TARGETS[step % WALK_TARGETS.length];
      step += 1;

      const at = target === undefined ? -1 : text.indexOf(target);
      if (at === -1) return;

      // Land inside the construct, not on its boundary: a decoration retracts when the
      // selection overlaps it, and the boundary is ambiguous.
      view.dispatch({ selection: { anchor: at + 2 }, scrollIntoView: false });
    };

    const start = setTimeout(() => {
      advance();
      interval = setInterval(advance, WALK_INTERVAL_MS);
    }, WALK_DELAY_MS);

    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [walking]);

  return (
    <div
      className="bg-card border-rule overflow-hidden rounded-lg border shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-24px_rgba(15,23,42,0.22)]"
      // Any interaction means the reader is driving now.
      onPointerDown={() => setWalking(false)}
      onKeyDownCapture={() => setWalking(false)}
    >
      <div className="border-rule text-muted-foreground flex items-center gap-2 border-b px-3 py-1.5 font-mono text-2xs">
        <span aria-hidden="true" className="bg-pencil-blue size-1.5 rounded-full" />
        <span>live editor, go ahead and type</span>
      </div>
      <div className="px-4 py-5 sm:px-6 sm:py-7">
        <CodeMirror
          ref={editor}
          value={DEMO_SOURCE}
          theme={codemirrorTheme(resolvedTheme)}
          extensions={extensions}
          width="100%"
          autoFocus={false}
          spellCheck={false}
          basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false, drawSelection: false }}
        />
      </div>
    </div>
  );
}

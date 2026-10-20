import { cn } from "@/lib/utils";

/**
 * Counts for the document currently open.
 */
export type DocumentCounts = {
  words: number;
  lines: number;
  characters: number;
};

/**
 * The bottom rail: measurements of the document, and of the last render.
 *
 * Everything here is a number that changes as you type, so it is all set in the mono face
 * with tabular figures — the rail must not reflow on every keystroke.
 *
 * @param props.counts - Words, lines and characters
 * @param props.renderMs - Time of the last `preview()` run, or null when nothing has run
 * @param props.note - A short description of the surface on screen
 * @returns The rail element
 */
export function StatusRail({
  counts,
  renderMs,
  note,
}: {
  counts: DocumentCounts;
  renderMs: number | null;
  note: string;
}) {
  return (
    <footer className="border-rule bg-background text-muted-foreground flex h-8 shrink-0 items-center gap-3 border-t px-3 font-mono text-2xs">
      <span className="truncate max-sm:hidden">{note}</span>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {renderMs !== null && (
          <>
            <Measure label="rendered" value={`${renderMs.toFixed(1)}ms`} />
            <Rule />
          </>
        )}
        <Measure label="words" value={counts.words.toLocaleString()} />
        <Rule />
        <Measure label="lines" value={counts.lines.toLocaleString()} />
        <Rule />
        <Measure label="characters" value={counts.characters.toLocaleString()} />
      </div>
    </footer>
  );
}

/**
 * One labelled figure. The value leads, because the value is what changes.
 *
 * @param props.label - What is being counted
 * @param props.value - The pre-formatted figure
 * @returns The measure element
 */
function Measure({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <span className={cn("flex items-baseline gap-1", className)}>
      <span className="text-foreground">{value}</span>
      <span>{label}</span>
    </span>
  );
}

/** A hairline between figures — quieter than a bullet, and it never gets read aloud. */
function Rule() {
  return <span aria-hidden="true" className="bg-rule h-3 w-px" />;
}

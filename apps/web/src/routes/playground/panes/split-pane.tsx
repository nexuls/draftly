import { cn } from "@/lib/utils";

type SplitPaneProps = {
  /** The editor surface. Rendered in the leading column. */
  editor: React.ReactNode;
  /** The rendered preview. Rendered in the trailing column. */
  preview: React.ReactNode;
};

/**
 * The editor and the preview, on screen together.
 *
 * Takes both surfaces as nodes rather than reproducing their props, so it owns the layout
 * and nothing else — it cannot drift from `EditorPane` or `PreviewPane` because it does
 * not know what either one is.
 *
 * Each column scrolls on its own: both panes wrap themselves in a `PageSheet`, which
 * carries the scroll container, so the two sides move independently. They are deliberately
 * *not* synchronised — `preview()` output carries no mapping back to source lines, so a
 * shared scroll position could only be guessed at.
 *
 * Below `md` the columns stack, because two sheets at the 72ch measure do not fit side by
 * side on a phone.
 *
 * @param props.editor - The editor element
 * @param props.preview - The preview element
 * @returns The split layout
 */
export function SplitPane({ editor, preview }: SplitPaneProps) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col md:flex-row">
      <SplitColumn label="Editor" hint="decorated, live">
        {editor}
      </SplitColumn>

      <SplitColumn label="Preview" hint="preview() output" className="border-rule border-t md:border-t-0 md:border-l">
        {preview}
      </SplitColumn>
    </div>
  );
}

/**
 * One half of the split, captioned.
 *
 * The caption is what makes the comparison legible: with two prose columns side by side in
 * the same typeface, nothing else on screen says which one is the source being decorated
 * and which one is the static output.
 *
 * @param props.label - Which surface this column is
 * @param props.hint - A few words on what produced it
 * @param props.children - The pane
 * @param props.className - Extra classes, used for the divider
 * @returns The column element
 */
function SplitColumn({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      <header className="border-rule text-muted-foreground flex h-7 shrink-0 items-center gap-2 border-b px-3 font-mono text-2xs">
        <span className="text-foreground">{label}</span>
        <span aria-hidden="true" className="bg-rule h-3 w-px" />
        <span className="truncate">{hint}</span>
      </header>

      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

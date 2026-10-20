import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The document title, editable in place.
 *
 * An input with no visible chrome until it is focused: the title reads as a heading, and
 * the affordance appears when the pointer or keyboard arrives. Committing on blur and on
 * Enter, reverting on Escape — the conventions people already expect from a filename.
 *
 * @param props.title - The current title
 * @param props.onRename - Called with a trimmed, non-empty new title
 * @param props.className - Extra classes for the input
 * @returns The title element
 */
export function DocumentTitle({
  title,
  onRename,
  className,
}: {
  title: string;
  onRename: (title: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(title);
  const input = useRef<HTMLInputElement>(null);

  // Selecting another document replaces the title under us; the draft has to follow.
  useEffect(() => setDraft(title), [title]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === title) {
      setDraft(title);
      return;
    }
    onRename(trimmed);
  }

  return (
    <input
      ref={input}
      value={draft}
      aria-label="Document title"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          commit();
          input.current?.blur();
        }
        if (event.key === "Escape") {
          setDraft(title);
          input.current?.blur();
        }
      }}
      className={cn(
        "text-foreground min-w-0 truncate rounded-sm bg-transparent px-1.5 py-0.5 text-base",
        "hover:bg-accent/60 focus:bg-accent/60 outline-none transition-colors",
        className
      )}
    />
  );
}

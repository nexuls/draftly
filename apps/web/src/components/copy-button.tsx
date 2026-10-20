import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** How long the acknowledgement stays on the button. */
const COPIED_NOTICE_MS = 1600;

/**
 * Copy text to the clipboard, with the result shown on the button.
 *
 * The verb stays the same through the interaction — "Copy CSS" becomes "Copied" — so the
 * acknowledgement reads as the result of the action rather than as a separate message.
 *
 * @param props.text - What goes on the clipboard
 * @param props.label - Appended to "Copy"; omit for an icon-only button
 * @param props.className - Extra classes for the button
 * @returns The button element
 */
export function CopyButton({ text, label, className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_NOTICE_MS);
    } catch {
      // A denied clipboard permission is the reader's choice, and the text is on screen
      // and selectable either way.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label ? `Copy ${label}` : "Copy"}
      className={cn(
        "border-rule bg-card/90 text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-2xs backdrop-blur transition-colors",
        className
      )}
    >
      {copied ? (
        <>
          <Check aria-hidden="true" className="text-pencil-blue size-3" strokeWidth={2} />
          Copied
        </>
      ) : (
        <>
          <Copy aria-hidden="true" className="size-3" strokeWidth={1.75} />
          {label ? `Copy ${label}` : "Copy"}
        </>
      )}
    </button>
  );
}

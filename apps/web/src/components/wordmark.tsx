import { cn } from "@/lib/utils";

/**
 * The Draftly wordmark: the name in italic lowercase, followed by a blue caret.
 *
 * The caret is the product in one glyph — it is the thing that makes the markdown source
 * reappear — so it is the only coloured mark in the identity. It blinks only where motion
 * is wanted; callers opt in.
 *
 * @param props.className - Extra classes, normally a text size
 * @param props.blink - Animate the caret. Off by default so the chrome stays still
 * @returns The wordmark element
 */
export function Wordmark({ className, blink = false }: { className?: string; blink?: boolean }) {
  return (
    <span className={cn("inline-flex items-baseline gap-[0.09em] font-sans italic", className)}>
      <span className="tracking-[-0.015em]">draftly</span>
      <span
        aria-hidden="true"
        className={cn(
          "bg-pencil-blue inline-block h-[0.82em] w-[0.07em] translate-y-[0.04em] rounded-full",
          blink && "motion-safe:animate-pulse"
        )}
      />
    </span>
  );
}

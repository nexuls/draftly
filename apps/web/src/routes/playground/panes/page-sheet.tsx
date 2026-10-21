import type { RefObject } from "react";
import { cn } from "@/lib/utils";

/**
 * The page: the one raised surface in the playground.
 *
 * Everything else in the app is divided by hairlines, so the sheet carrying the prose is
 * the only thing with a background of its own and the only thing that casts a shadow.
 * That is what makes it read as the document rather than as another panel.
 *
 * The measure is capped in `ch` so it tracks the font, not the viewport: the column stays
 * at a readable width however wide the window gets.
 *
 * The scroll container is the element exposed through `scrollRef`: the split view links
 * the two columns by it, and the sheet inside never scrolls on its own.
 *
 * The elevation is a container query, not a viewport one. A column of the split view is
 * half the window wide, so a sheet that floats with a margin at 1200px of viewport has no
 * room for one at 1200px of viewport in two columns. Below `@2xl` the sheet goes flush --
 * no outer padding, no border, no shadow -- and reads as the pane itself rather than as a
 * page sitting on a desk; the inner padding stays so the prose keeps off the edge.
 *
 * @param props.children - The editor or the rendered preview
 * @param props.className - Extra classes for the sheet
 * @param props.scrollRef - Handle on the scroll container, for linking two sheets together
 * @returns The sheet element
 */
export function PageSheet({
  children,
  className,
  scrollRef,
}: {
  children: React.ReactNode;
  className?: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="@container h-full w-full">
      <div ref={scrollRef} className="flex h-full w-full justify-center overflow-y-auto @2xl:px-6 @2xl:py-8">
        <div
          className={cn(
            "bg-card border-rule h-fit min-h-full w-full max-w-[72ch] px-5 py-8 @2xl:rounded-lg @2xl:border @2xl:px-10 @2xl:py-12 @2xl:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]",
            className
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";

/**
 * The page: the one raised surface in the playground.
 *
 * Everything else in the app is divided by hairlines, so the sheet carrying the prose is
 * the only thing with a background of its own and the only thing that casts a shadow.
 * That is what makes it read as the document rather than as another panel.
 *
 * The measure is capped in `ch` so it tracks the font, not the viewport — a serif column
 * stays readable at about seventy characters however wide the window gets.
 *
 * @param props.children - The editor or the rendered preview
 * @param props.className - Extra classes for the sheet
 * @returns The sheet element
 */
export function PageSheet({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="flex h-full w-full justify-center overflow-y-auto px-3 py-4 sm:px-6 sm:py-8">
      <div
        className={cn(
          "bg-card border-rule h-fit min-h-full w-full max-w-[72ch] rounded-lg border px-5 py-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] sm:px-10 sm:py-12",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

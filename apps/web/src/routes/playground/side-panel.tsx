import { cn } from "@/lib/utils";

/**
 * A collapsible side panel.
 *
 * Two behaviours in one component because they are the same panel: from `lg` up it is part
 * of the layout and collapses by animating its width to zero; below `lg` there is no room
 * for three columns, so it floats over the page and the caller renders a backdrop.
 *
 * The panel carries no accessible name of its own — its content does. `DocumentList` is a
 * `nav` and `Inspector` is an `aside`, both named, so labelling this wrapper too would
 * announce the same region twice.
 *
 * @param props.side - Which edge the panel is attached to
 * @param props.open - Whether it is showing
 * @param props.width - Tailwind width class used when open, e.g. `"w-60"`
 * @param props.children - The panel's content
 * @returns The panel element
 */
export function SidePanel({
  side,
  open,
  width,
  children,
}: {
  side: "left" | "right";
  open: boolean;
  width: string;
  children: React.ReactNode;
}) {
  return (
    <div
      // `inert` rather than `aria-hidden`: a collapsed panel is zero pixels wide but its
      // buttons are still in the tab order, so hiding it from assistive technology alone
      // would leave a focus trap in empty space.
      inert={!open}
      className={cn(
        "bg-background border-rule z-30 shrink-0 overflow-hidden transition-[width,transform] duration-200 ease-out",
        "max-lg:absolute max-lg:inset-y-0 lg:relative",
        side === "left" ? "max-lg:left-0 lg:border-r" : "max-lg:right-0 lg:border-l",
        open ? width : "w-0 border-transparent",
        // Below `lg` the panel is an overlay, so it also has to slide out of the way — a
        // zero width alone would leave its shadow and border on screen.
        !open && (side === "left" ? "max-lg:-translate-x-full" : "max-lg:translate-x-full"),
        open && "max-lg:border-rule max-lg:shadow-xl"
      )}
    >
      <div className={cn("h-full", width)}>{children}</div>
    </div>
  );
}

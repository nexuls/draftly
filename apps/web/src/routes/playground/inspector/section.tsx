import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * One collapsible group in the inspector.
 *
 * @param props.title - The group's name, in sentence case
 * @param props.meta - A short figure shown on the right of the header, e.g. "14 of 14 on"
 * @param props.open - Whether the group is expanded
 * @param props.onOpenChange - Called when the reader toggles it
 * @param props.grow - Let the content take the remaining column height instead of its own
 * @param props.children - The group's controls
 * @returns The section element
 */
export function InspectorSection({
  title,
  meta,
  open,
  onOpenChange,
  grow = false,
  children,
}: {
  title: string;
  meta?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className={cn("border-rule border-b", grow && open && "flex min-h-0 flex-1 flex-col")}
    >
      <CollapsibleTrigger
        className={cn(
          "group hover:bg-accent/50 flex w-full shrink-0 items-center gap-2 px-3 py-2 text-left transition-colors"
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className="text-muted-foreground size-3.5 shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-90"
          strokeWidth={1.75}
        />
        <span className="text-foreground flex-1 text-sm">{title}</span>
        {meta && <span className="text-muted-foreground font-mono text-2xs">{meta}</span>}
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(grow && "flex min-h-0 flex-1 flex-col overflow-hidden")}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

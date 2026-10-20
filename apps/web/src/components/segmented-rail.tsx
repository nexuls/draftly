import type { LucideIcon } from "lucide-react";
import { useId } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * One choice in a {@link SegmentedRail}.
 */
export type Segment<T extends string> = {
  value: T;
  /** Shown beside the icon when `showLabels` is on, and always as the accessible name. */
  label: string;
  icon: LucideIcon;
  /** Extra explanation for the tooltip. The label alone is used when omitted. */
  hint?: string;
};

type SegmentedRailProps<T extends string> = {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
  /** Render the text label next to each icon. Icons only when false. */
  showLabels?: boolean;
  className?: string;
};

/**
 * A row of mutually exclusive choices, all of them visible.
 *
 * Used instead of a dropdown wherever the options fit: a trigger has to be opened before
 * it says anything, and these rails sit in chrome where the current state *is* the useful
 * information.
 *
 * Built on real radio inputs, visually hidden and styled through `peer-checked`. A row of
 * buttons with `role="radio"` would look identical, but native radios come with group
 * arrow-key navigation and a single tab stop for the whole rail, which is the behaviour
 * people expect from a segmented control.
 *
 * @param props - Segments, the selected value, and the change handler
 * @returns The rail element
 *
 * @example
 * ```tsx
 * <SegmentedRail label="Surface" segments={MODES} value={mode} onChange={setMode} showLabels />
 * ```
 */
export function SegmentedRail<T extends string>({
  segments,
  value,
  onChange,
  label,
  showLabels = false,
  className,
}: SegmentedRailProps<T>) {
  // Radios only form one group if they share a name, and two rails can be on screen at
  // once — the playground has three.
  const groupName = useId();

  return (
    <fieldset className={cn("border-border inline-flex items-center gap-px rounded-md border p-px", className)}>
      <legend className="sr-only">{label}</legend>

      {segments.map((segment) => {
        const active = segment.value === value;
        const Icon = segment.icon;

        return (
          <Tooltip key={segment.value}>
            <TooltipTrigger asChild>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name={groupName}
                  value={segment.value}
                  // The visible text is hidden below `sm` and absent entirely when
                  // `showLabels` is off, so the name cannot come from the label's content.
                  aria-label={segment.label}
                  checked={active}
                  onChange={() => onChange(segment.value)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "text-muted-foreground inline-flex h-6 items-center gap-1.5 rounded-[3px] px-1.5 text-xs transition-colors",
                    "peer-checked:bg-foreground peer-checked:text-background",
                    "peer-focus-visible:outline-ring peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                    !active && "hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
                  {showLabels && <span className="hidden sm:inline">{segment.label}</span>}
                </span>
              </label>
            </TooltipTrigger>
            <TooltipContent>{segment.hint ?? segment.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </fieldset>
  );
}

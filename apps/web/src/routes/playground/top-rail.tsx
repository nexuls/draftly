import { Check, FileCode2, PanelLeft, PanelRight, PenLine, SlidersHorizontal, Type } from "lucide-react";
import { Link } from "react-router";
import { type Segment, SegmentedRail } from "@/components/segmented-rail";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";
import { DocumentTitle } from "./document-title";
import type { PlaygroundMode, SaveStatus } from "./types";

/**
 * The four surfaces, named for what the reader is doing rather than for the library call
 * behind each one.
 */
const MODES: readonly Segment<PlaygroundMode>[] = [
  { value: "write", label: "Write", icon: PenLine, hint: "The editor, with decorations live" },
  { value: "read", label: "Read", icon: Type, hint: "The rendered preview" },
  { value: "source", label: "Source", icon: FileCode2, hint: "Plain markdown, decorations off" },
  { value: "export", label: "Export", icon: SlidersHorizontal, hint: "The generated HTML and CSS" },
];

type TopRailProps = {
  title: string | undefined;
  onRename: (title: string) => void;
  mode: PlaygroundMode;
  onModeChange: (mode: PlaygroundMode) => void;
  saveStatus: SaveStatus;
  documentsOpen: boolean;
  onToggleDocuments: () => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
};

/**
 * The playground's top rail: identity on the left, surfaces and controls on the right.
 *
 * A hairline rule rather than a bordered bar — the chrome divides the screen without
 * enclosing anything.
 *
 * @param props - Title, mode, save state, and the two panel toggles
 * @returns The rail element
 */
export function TopRail({
  title,
  onRename,
  mode,
  onModeChange,
  saveStatus,
  documentsOpen,
  onToggleDocuments,
  inspectorOpen,
  onToggleInspector,
}: TopRailProps) {
  return (
    <header className="border-rule bg-background flex h-11 shrink-0 items-center gap-2 border-b px-2">
      <PanelToggle
        open={documentsOpen}
        onClick={onToggleDocuments}
        icon={PanelLeft}
        label={documentsOpen ? "Hide documents" : "Show documents"}
      />

      <Link to="/" className="rounded-sm px-1 py-0.5" aria-label="Draftly home">
        <Wordmark className="text-lg" />
      </Link>

      {title !== undefined && (
        <>
          <span aria-hidden="true" className="bg-rule mx-1 h-4 w-px" />
          <DocumentTitle title={title} onRename={onRename} className="max-w-48 md:max-w-xs" />
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        <SaveIndicator status={saveStatus} />
        <SegmentedRail label="Surface" segments={MODES} value={mode} onChange={onModeChange} showLabels />
        <ThemeSwitcher className="max-sm:hidden" />
        <PanelToggle
          open={inspectorOpen}
          onClick={onToggleInspector}
          icon={PanelRight}
          label={inspectorOpen ? "Hide inspector" : "Show inspector"}
        />
      </div>
    </header>
  );
}

/**
 * A ghost icon button for one of the side panels.
 *
 * @param props.open - Whether the panel is currently showing, which tints the icon
 * @param props.icon - The panel's icon
 * @param props.label - Accessible name and tooltip
 * @param props.onClick - Toggle handler
 * @returns The button element
 */
function PanelToggle({
  open,
  icon: Icon,
  label,
  onClick,
}: {
  open: boolean;
  icon: typeof PanelLeft;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={open}
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-md transition-colors",
            open ? "text-foreground hover:bg-accent" : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The save state, shown only while it is changing.
 *
 * Steady state is silent: a permanent "Saved" badge is noise, and its absence is what
 * makes the brief "Saving…" legible.
 *
 * @param props.status - The current save state
 * @returns The indicator, or nothing when idle
 */
function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;

  return (
    <span
      className="text-muted-foreground flex shrink-0 items-center gap-1 font-mono text-2xs"
      aria-live="polite"
      aria-atomic="true"
    >
      {status === "saving" ? (
        <>
          <span aria-hidden="true" className="bg-muted-foreground size-1.5 rounded-full motion-safe:animate-pulse" />
          <span className="max-sm:hidden">Saving</span>
        </>
      ) : (
        <>
          <Check aria-hidden="true" className="text-pencil-blue size-3" strokeWidth={2} />
          <span className="max-sm:hidden">Saved</span>
        </>
      )}
    </span>
  );
}

import { Button } from "@workspace/ui/components/button";
import {
  Check,
  ChevronDown,
  FileCodeCornerIcon,
  FilePenLineIcon,
  FileTextIcon,
  Loader2,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ScanTextIcon,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { SaveStatus } from "./page";
import { ThemeSwitcher } from "@/components/providers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";

const modes = [
  { value: "live", label: "Live", icon: FilePenLineIcon },
  { value: "view", label: "View", icon: FileTextIcon },
  { value: "code", label: "Code", icon: ScanTextIcon },
  { value: "output", label: "Output", icon: FileCodeCornerIcon },
] as const;

type Props = {
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  devbarOpen: boolean;
  setDevbarOpen: Dispatch<SetStateAction<boolean>>;
  saveStatus: SaveStatus;
  mode: "live" | "view" | "code" | "output";
  setMode: Dispatch<SetStateAction<"live" | "view" | "code" | "output">>;
};

export default function Header({
  sidebarOpen,
  setSidebarOpen,
  devbarOpen,
  setDevbarOpen,
  saveStatus,
  mode,
  setMode,
}: Props) {
  return (
    <header className="h-12 w-full flex items-center justify-between py-1 px-4 overflow-y-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-8 p-1" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <PanelLeftCloseIcon className="size-5" /> : <PanelLeftOpenIcon className="size-5" />}
        </Button>
        <h2 className="text-xl font-mono">draftly</h2>
      </div>
      <div className="flex items-center gap-2">
        {saveStatus !== "idle" && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {saveStatus === "saving" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span className="hidden sm:inline">Saving...</span>
              </>
            ) : (
              <>
                <Check className="size-3.5 text-green-500" />
                <span className="hidden sm:inline">Saved</span>
              </>
            )}
          </div>
        )}
        <ThemeSwitcher />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {(() => {
                const Icon = modes.find((option) => option.value === mode)?.icon;
                if (!Icon) return null;
                return <Icon className="size-4" />;
              })()}
              <span className="hidden sm:inline">{modes.find((option) => option.value === mode)?.label}</span>
              <ChevronDown className="size-4 ml-auto" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Select Mode</DropdownMenuLabel>
            {modes.map((option) => (
              <DropdownMenuItem key={option.value} onClick={() => setMode(option.value)}>
                <option.icon className="size-4" />
                <span>{option.label}</span>
                {mode === option.value && <Check className="size-4 ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="sm" onClick={() => setDevbarOpen(!devbarOpen)}>
          {devbarOpen ? <PanelLeftCloseIcon className="size-4" /> : <PanelLeftOpenIcon className="size-4" />}
          <span className="hidden sm:inline">{devbarOpen ? "Hide Devbar" : "Show Devbar"}</span>
        </Button>
      </div>
    </header>
  );
}

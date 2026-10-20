import { Monitor, Moon, Sun } from "lucide-react";
import { type Segment, SegmentedRail } from "@/components/segmented-rail";
import { type ThemePreference, useTheme } from "./theme-provider";

const SEGMENTS: readonly Segment<ThemePreference>[] = [
  { value: "default-light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor, hint: "Match the system theme" },
  { value: "default-dark", label: "Dark", icon: Moon },
];

/**
 * Theme control: all three states visible, the current one filled.
 *
 * @param props.className - Extra classes for the rail
 * @returns The switcher element
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <SegmentedRail label="Colour theme" segments={SEGMENTS} value={theme} onChange={setTheme} className={className} />
  );
}

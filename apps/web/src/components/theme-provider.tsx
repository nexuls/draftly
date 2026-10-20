import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * The theme the reader asked for. `"system"` defers to `prefers-color-scheme`.
 */
export type ThemePreference = "system" | "default-light" | "default-dark";

/**
 * The theme actually on screen — `"system"` resolved against the media query.
 *
 * The class names match the layer names Draftly's `createTheme()` emits, so the same
 * string is both the `<html>` class and the switch that selects the editor's theme layer.
 */
export type ResolvedTheme = "default-light" | "default-dark";

/**
 * localStorage key. Shared with the pre-paint script in `index.html` — changing it here
 * without changing it there reintroduces the first-paint flash.
 */
const STORAGE_KEY = "draftly-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

type ThemeContextValue = {
  /** What the reader chose, including `"system"`. */
  theme: ThemePreference;
  /** What is rendered right now. */
  resolvedTheme: ResolvedTheme;
  /** Change the preference and persist it. */
  setTheme: (theme: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Read the stored preference, tolerating a blocked or stale localStorage.
 *
 * @returns The persisted preference, or `"system"` when there is nothing usable
 */
function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "system" || stored === "default-light" || stored === "default-dark") {
      return stored;
    }
  } catch {
    // Private-mode browsers throw on access. Falling back is the whole handler.
  }
  return "system";
}

/**
 * Apply a theme to the document element.
 *
 * Written imperatively rather than through React state on `<html>` because the pre-paint
 * script in `index.html` has already set these, and re-rendering the root to the same
 * values would flash.
 *
 * @param resolved - The theme layer to apply
 * @returns Nothing
 */
function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.remove("default-light", "default-dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved === "default-dark" ? "dark" : "light";
}

/**
 * Provide the theme preference and keep `<html>` in sync with it.
 *
 * Replaces `next-themes`: the only behaviour this app needs is a three-way preference, a
 * `matchMedia` subscription for `"system"`, and a class on the document element.
 *
 * @param props.children - The tree that may read the theme
 * @returns The provider element
 *
 * @example
 * ```tsx
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readStoredPreference);
  const [systemIsDark, setSystemIsDark] = useState(
    () => typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches
  );

  // Only matters while the preference is "system", but subscribing unconditionally keeps
  // the hook order stable and the listener is free.
  useEffect(() => {
    const query = matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemIsDark(event.matches);
    query.addEventListener("change", onChange);
    setSystemIsDark(query.matches);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: ResolvedTheme = theme === "system" ? (systemIsDark ? "default-dark" : "default-light") : theme;

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A preference that cannot be persisted still applies for this session.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Read the current theme.
 *
 * @returns The preference, the resolved theme, and a setter
 * @throws If called outside a {@link ThemeProvider}
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside a ThemeProvider.");
  return context;
}

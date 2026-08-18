/**
 * Development-only diagnostics.
 *
 * Draftly's failure modes are unusually quiet — a plugin can be silently absent from
 * preview, and decoration errors are swallowed on purpose. These helpers make those
 * cases say something during development while staying out of production bundles.
 *
 * @packageDocumentation
 */

/**
 * Whether development diagnostics should run.
 *
 * Reads `process.env.NODE_ENV` defensively: the library ships to browsers where
 * `process` may not exist at all, and to bundlers that replace this expression with a
 * literal so the guarded branch is dropped entirely.
 *
 * @returns `true` outside a production build
 */
export function isDevMode(): boolean {
  try {
    return typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
  } catch {
    // A bundler may define `process` as a getter that throws in the browser.
    return false;
  }
}

/**
 * Emit a development-only warning, prefixed so it is attributable.
 *
 * @param message - What went wrong, in one line
 * @param details - Optional extra values to log alongside it
 */
export function devWarn(message: string, ...details: unknown[]): void {
  if (!isDevMode()) return;
  console.warn(`[draftly] ${message}`, ...details);
}

/**
 * Keys already reported by {@link reportOnce}, for the lifetime of the module.
 */
const reportedOnce = new Set<string>();

/**
 * Run `report` the first time a given key is seen, and never again.
 *
 * Decorations rebuild on every cursor movement, so a persistent plugin bug would
 * otherwise print on every keystroke and bury the first occurrence — which is the one
 * with the useful stack.
 *
 * @param key - Identity of the condition being reported
 * @param report - Called only on the first occurrence
 */
export function reportOnce(key: string, report: () => void): void {
  if (reportedOnce.has(key)) return;
  reportedOnce.add(key);
  report();
}

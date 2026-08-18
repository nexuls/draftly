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

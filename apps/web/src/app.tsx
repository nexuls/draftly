import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LandingRoute } from "@/routes/landing/landing-route";
import { NotFoundRoute } from "@/routes/not-found-route";

/**
 * The playground is split out of the initial bundle.
 *
 * It builds the full plugin set, which pulls Mermaid and KaTeX — several megabytes that
 * the landing page has no use for. The landing page's own live editor uses the light
 * plugin set, so nothing heavy is reachable from the entry chunk.
 */
const PlaygroundRoute = lazy(async () => {
  const module = await import("@/routes/playground/playground-route");
  return { default: module.PlaygroundRoute };
});

/**
 * A quiet placeholder for the playground chunk.
 *
 * Deliberately not a spinner: the chunk resolves in a few hundred milliseconds on a warm
 * cache, and a spinner that flashes reads worse than a line of text.
 */
function RouteFallback() {
  return (
    <div className="grid min-h-svh place-items-center">
      <p className="text-muted-foreground font-mono text-xs">Loading the editor…</p>
    </div>
  );
}

/**
 * Application root: providers, then routes.
 *
 * @returns The app element
 */
export function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={400} skipDelayDuration={200}>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<LandingRoute />} />
              <Route path="/playground" element={<PlaygroundRoute />} />
              <Route path="*" element={<NotFoundRoute />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  );
}

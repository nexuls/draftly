import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { BothSurfaces } from "./both-surfaces";
import { Install } from "./install";
import { LiveDemo } from "./live-demo";
import { PluginIndex } from "./plugin-index";
import { Section } from "./section";

const REPOSITORY_URL = "https://github.com/neuronexul/draftly";
const PACKAGE_URL = "https://www.npmjs.com/package/draftly";

/**
 * The front page.
 *
 * The hero is the editor itself rather than a description of it: retraction is the whole
 * idea, it takes one caret movement to show, and no sentence does it as well. Everything
 * below is reference material — the plugin contract, the index of plugins, and how to
 * install it.
 *
 * @returns The landing page element
 */
export function LandingRoute() {
  return (
    <div className="bg-background min-h-svh">
      <header className="border-rule border-b">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-5 sm:px-8">
          <Wordmark className="text-lg" />
          <nav className="text-muted-foreground ml-auto flex items-center gap-5 text-sm">
            <a href="#plugins" className="hover:text-foreground transition-colors max-sm:hidden">
              Plugins
            </a>
            <a href="#install" className="hover:text-foreground transition-colors max-sm:hidden">
              Install
            </a>
            <a href={REPOSITORY_URL} className="hover:text-foreground inline-flex items-center gap-1 transition-colors">
              Source
              <ArrowUpRight aria-hidden="true" className="size-3" strokeWidth={1.75} />
            </a>
            <ThemeSwitcher />
          </nav>
        </div>
      </header>

      <Section className="pt-14 sm:pt-20">
        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h1 className="text-foreground text-4xl sm:text-4xl">Markdown that stays markdown.</h1>
            <p className="text-muted-foreground mt-6 text-lg">
              A CodeMirror 6 editor that decorates your source instead of replacing it. Move the caret into a heading
              and the hashes come back.
            </p>
            <p className="text-muted-foreground mt-4 text-base">
              There is no second document model to keep in sync, because there is no second document. What is on screen
              is the file.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/playground">Open the playground</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <a href={PACKAGE_URL}>draftly on npm</a>
              </Button>
            </div>
          </div>

          <LiveDemo />
        </div>
      </Section>

      <div className="border-rule border-t">
        <BothSurfaces />
      </div>

      <div className="border-rule border-t">
        <PluginIndex />
      </div>

      <div className="border-rule border-t">
        <Install />
      </div>

      <footer className="border-rule border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-8 text-sm sm:px-8">
          <Wordmark className="text-base" />
          <span>MIT licensed. Built on CodeMirror 6.</span>
          <div className="ml-auto flex items-center gap-5">
            <a href={REPOSITORY_URL} className="hover:text-foreground transition-colors">
              GitHub
            </a>
            <a href={PACKAGE_URL} className="hover:text-foreground transition-colors">
              npm
            </a>
            <Link to="/playground" className="hover:text-foreground transition-colors">
              Playground
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

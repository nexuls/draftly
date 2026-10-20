import type { RefObject } from "react";
import { PageSheet } from "./page-sheet";

/**
 * The rendered preview, on the same page as the editor.
 *
 * Both the HTML and the stylesheet come straight out of `preview()` and `generateCSS()`
 * with no post-processing, which is the point: what is on screen here is exactly what a
 * consumer would get from a static build.
 *
 * The `<style>` element is scoped by `generateCSS()` itself — every rule is written under
 * the wrapper class — so injecting it here cannot restyle the surrounding app.
 *
 * @param props.html - Output of `preview()`
 * @param props.css - Output of `generateCSS()`
 * @param props.pending - True before the first render has completed
 * @param props.scrollRef - Handle on the scroll container, for the split view's linked scroll
 * @returns The preview element
 */
export function PreviewPane({
  html,
  css,
  pending,
  scrollRef,
}: {
  html: string;
  css: string;
  pending: boolean;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  if (pending) {
    return (
      <PageSheet scrollRef={scrollRef}>
        <p className="text-muted-foreground font-mono text-xs">Rendering…</p>
      </PageSheet>
    );
  }

  return (
    <PageSheet scrollRef={scrollRef}>
      {/* Injecting generated markup is the entire job of this pane. */}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </PageSheet>
  );
}

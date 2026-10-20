import { cn } from "@/lib/utils";

/**
 * A page section with a consistent measure and vertical rhythm.
 *
 * @param props.id - Anchor id, where the section is linked to
 * @param props.className - Extra classes for the section element
 * @param props.children - The section's content
 * @returns The section element
 */
export function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={cn("mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-24", className)}>
      {children}
    </section>
  );
}

/**
 * A section heading, marked with a short blue rule above it.
 *
 * The rule is the proofreader's mark that this is a heading — the same device the editor
 * uses to show a construct is being decorated. It is the page's one structural ornament,
 * so it appears on every section heading and nowhere else.
 *
 * @param props.children - The heading text
 * @param props.className - Extra classes for the heading
 * @returns The heading element
 */
export function SectionHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-8", className)}>
      <span aria-hidden="true" className="bg-pencil-blue mb-5 block h-1 w-12 rounded-full" />
      <h2 className="text-foreground text-2xl sm:text-3xl font-bold">{children}</h2>
    </div>
  );
}

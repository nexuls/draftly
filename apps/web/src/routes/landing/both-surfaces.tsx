import { Section, SectionHeading } from "./section";

/**
 * The four things a plugin supplies, and what each one controls.
 */
const CONTRACT: ReadonlyArray<{ member: string; surface: string; description: string }> = [
  {
    member: "buildDecorations()",
    surface: "editor",
    description: "What the construct looks like while you are writing, and when it retracts.",
  },
  {
    member: "renderToHTML()",
    surface: "static",
    description: "What the same construct becomes in a build with no editor in it.",
  },
  {
    member: "keymap",
    surface: "editor",
    description: "How you type it: the shortcut, the Enter behaviour, the list continuation.",
  },
  {
    member: "theme",
    surface: "both",
    description: "How it is styled. The same rules are compiled into the editor and into the stylesheet.",
  },
];

/**
 * The architectural claim, stated once and backed by the member list.
 *
 * @returns The section element
 */
export function BothSurfaces() {
  return (
    <Section id="plugins-own-features">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
        <div>
          <SectionHeading>One plugin, both surfaces</SectionHeading>
          <p className="text-muted-foreground text-base">
            A markdown feature is one class. It brings its own parser extension, its decorations, its shortcuts, its
            styles, and its static renderer.
          </p>
          <p className="text-muted-foreground mt-4 text-base">
            The static renderer reads its class names off the decoration specs rather than retyping them, which is the
            mechanism that keeps the editor and a static build looking the same. Parity is structural here, not a thing
            anyone remembers to check.
          </p>
        </div>

        <dl className="border-rule border-t">
          {CONTRACT.map(({ member, surface, description }) => (
            <div key={member} className="border-rule border-b py-5">
              <div className="flex items-baseline gap-3">
                <dt className="text-foreground font-mono text-sm">{member}</dt>
                <span className="text-muted-foreground ml-auto shrink-0 font-mono text-2xs">{surface}</span>
              </div>
              <dd className="text-muted-foreground mt-1.5 text-base">{description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}

import { CopyButton } from "@/components/copy-button";
import { Section, SectionHeading } from "./section";

const INSTALL_COMMAND = `bun add draftly

bun add @codemirror/state \\
        @codemirror/view \\
        @codemirror/language \\
        @codemirror/commands \\
        @codemirror/lang-markdown \\
        @codemirror/language-data`;

const USAGE = `import { draftly } from "draftly";
import { createEssentialPlugins } from "draftly/plugins";

const extensions = draftly({
  plugins: createEssentialPlugins(),
});`;

/**
 * Install and first use.
 *
 * The peer dependencies get their own line rather than a footnote: CodeMirror has to stay
 * external, and a consumer who misses that ends up with two copies of
 * `@codemirror/state` in one bundle, which breaks facet identity in ways that are hard to
 * read back from the symptom.
 *
 * @returns The section element
 */
export function Install() {
  return (
    <Section id="install">
      <SectionHeading>Install</SectionHeading>

      <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <CodeBlock label="terminal" code={INSTALL_COMMAND} />
          <p className="text-muted-foreground mt-4 text-base">
            CodeMirror stays a peer dependency. Two copies of{" "}
            <code className="font-mono text-sm">@codemirror/state</code> in one bundle break facet identity, so the
            library never brings its own.
          </p>
        </div>

        <div>
          <CodeBlock label="editor.ts" code={USAGE} />
          <p className="text-muted-foreground mt-4 text-base">
            Build the plugin set once per editor. The instances hold per-view state, so two editors sharing one set
            overwrite each other's configuration.
          </p>
        </div>
      </div>
    </Section>
  );
}

/**
 * A static code sample, labelled and copyable.
 *
 * The copy action sits in a rail above the code rather than floating over it: a long
 * install command runs straight under a floating button, and the one thing a reader wants
 * from this block is to read the whole command.
 *
 * Not syntax-highlighted — these samples are a few lines long, and highlighting them would
 * mean shipping a second language parser to the landing page for decoration alone.
 *
 * @param props.code - The sample text
 * @param props.label - Names the block, shown in its rail
 * @returns The code block element
 */
function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="bg-card border-rule overflow-hidden rounded-lg border">
      <div className="border-rule flex h-8 items-center justify-between gap-2 border-b pr-1 pl-3">
        <span className="text-muted-foreground font-mono text-2xs">{label}</span>
        <CopyButton text={code} className="border-transparent bg-transparent" />
      </div>
      <pre className="text-foreground overflow-x-auto px-4 py-4 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

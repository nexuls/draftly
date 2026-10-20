import { createEssentialPlugins } from "draftly/src";
import { Section, SectionHeading } from "./section";

/**
 * The light plugin set, read for its own metadata.
 *
 * Built here rather than written out as a list so this table cannot go stale: a plugin
 * added to `createEssentialPlugins()` appears on the page, with the node names it actually
 * declares. Nothing in this module drives an editor, so the instances are inert.
 */
const essentialPlugins = createEssentialPlugins();

/**
 * The three plugins that pull a heavy third-party dependency and therefore ship behind
 * their own import specifier.
 *
 * Hard-coded because the point of the section is the import path, and importing them to
 * read their names would put the dependencies back on this page — which is the whole thing
 * the split exists to avoid.
 */
const OPT_IN_PLUGINS: ReadonlyArray<{ name: string; specifier: string; cost: string }> = [
  { name: "Mermaid", specifier: "draftly/plugins/mermaid", cost: "mermaid, 5.3 MB" },
  { name: "Math", specifier: "draftly/plugins/math", cost: "katex, optional peer" },
  { name: "Emoji", specifier: "draftly/plugins/emoji", cost: "node-emoji, 312 KB" },
];

/**
 * The index of built-in plugins, with the syntax-tree nodes each one owns.
 *
 * Set as a real index rather than a grid of cards: it is reference material, and the node
 * names are the part a plugin author is looking for.
 *
 * @returns The section element
 */
export function PluginIndex() {
  return (
    <Section id="plugins">
      <SectionHeading>Index of plugins</SectionHeading>

      <p className="text-muted-foreground measure mb-10 text-base">
        Each one owns its markdown construct on both surfaces. The nodes listed are what it claims from the syntax tree,
        which is also how the static renderer decides who handles what.
      </p>

      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Built-in Draftly plugins and the syntax-tree nodes they own</caption>
        <thead>
          <tr className="border-rule border-b">
            <th scope="col" className="text-muted-foreground pb-2 pr-4 font-mono text-2xs font-normal">
              plugin
            </th>
            <th scope="col" className="text-muted-foreground pb-2 pr-4 font-mono text-2xs font-normal">
              version
            </th>
            <th scope="col" className="text-muted-foreground pb-2 font-mono text-2xs font-normal">
              nodes
            </th>
          </tr>
        </thead>
        <tbody>
          {essentialPlugins.map((plugin) => (
            <tr key={plugin.name} className="border-rule border-b align-baseline last:border-b-0">
              <th scope="row" className="text-foreground py-2.5 pr-4 text-sm font-normal whitespace-nowrap">
                {plugin.name}
              </th>
              <td className="text-muted-foreground py-2.5 pr-4 font-mono text-2xs whitespace-nowrap">
                {plugin.version}
              </td>
              <td className="text-muted-foreground py-2.5 font-mono text-2xs">
                {plugin.requiredNodes.length > 0 ? plugin.requiredNodes.join("  ") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="text-foreground mt-14 mb-3 text-lg">Three more, behind their own import</h3>
      <p className="text-muted-foreground measure mb-6 text-base">
        A bundler cannot drop a third-party package it cannot prove pure, so a plugin with a heavy dependency gets its
        own entry point instead of a line in the barrel. Importing one small plugin from{" "}
        <code className="font-mono text-sm">draftly/plugins</code> used to cost 8 MB; it now costs 2.5 MB, and these
        three are opt-in.
      </p>

      <dl className="border-rule border-t">
        {OPT_IN_PLUGINS.map((plugin) => (
          <div key={plugin.name} className="border-rule flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b py-3">
            <dt className="text-foreground w-24 shrink-0 text-sm">{plugin.name}</dt>
            <dd className="text-pencil-blue font-mono text-2xs">{plugin.specifier}</dd>
            <dd className="text-muted-foreground ml-auto font-mono text-2xs">{plugin.cost}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

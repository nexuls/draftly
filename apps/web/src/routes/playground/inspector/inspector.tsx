import type { DraftlyNode } from "draftly/src";
import { useState } from "react";
import { playgroundPlugins } from "../plugins";
import type { PlaygroundConfig } from "../types";
import { ConfigSwitch } from "./config-switch";
import { NodeTree } from "./node-tree";
import { InspectorSection } from "./section";

/**
 * Copy for each editor flag. Kept beside the controls rather than in the config type so
 * the type stays a type.
 */
const EDITOR_OPTIONS: ReadonlyArray<{
  key: keyof PlaygroundConfig["editor"];
  label: string;
  description: string;
}> = [
  { key: "baseStyles", label: "Base styles", description: "Draftly's own typography and spacing." },
  { key: "defaultKeybindings", label: "Default keybindings", description: "Bold, italic, link and list shortcuts." },
  { key: "history", label: "History", description: "Undo and redo." },
  { key: "indentWithTab", label: "Indent with Tab", description: "Tab indents instead of moving focus." },
  { key: "highlightActiveLine", label: "Highlight the active line", description: "Tint the line holding the caret." },
  { key: "lineWrapping", label: "Wrap long lines", description: "Off means a horizontal scrollbar." },
];

const PREVIEW_OPTIONS: ReadonlyArray<{
  key: keyof PlaygroundConfig["preview"];
  label: string;
  description: string;
}> = [
  {
    key: "includeBase",
    label: "Include base CSS",
    description: "Emit the shared preview styles, not just plugin rules.",
  },
  { key: "sanitize", label: "Sanitize HTML", description: "Run embedded HTML through DOMPurify before output." },
];

type InspectorProps = {
  config: PlaygroundConfig;
  onConfigChange: (config: PlaygroundConfig) => void;
  nodes: DraftlyNode[];
  /**
   * Called when the node tree is shown or hidden. Building the tree costs a full document
   * walk on every update, so the route only collects it while the section is open.
   */
  onNodesVisibleChange: (visible: boolean) => void;
};

/**
 * The inspector: every `DraftlyConfig` and `PreviewConfig` flag worth changing live, the
 * plugin set, and the parsed syntax tree.
 *
 * @param props - Config, the parsed nodes, and the node-visibility callback
 * @returns The inspector element
 */
export function Inspector({ config, onConfigChange, nodes, onNodesVisibleChange }: InspectorProps) {
  const [open, setOpen] = useState({ editor: true, preview: true, plugins: false, nodes: false });

  const enabledCount = playgroundPlugins.filter((plugin) => config.plugins[plugin.name.toLowerCase()] ?? true).length;

  function setAllPlugins(enabled: boolean) {
    onConfigChange({
      ...config,
      plugins: Object.fromEntries(playgroundPlugins.map((plugin) => [plugin.name.toLowerCase(), enabled])),
    });
  }

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden" aria-label="Inspector">
      <div className="border-rule flex h-9 shrink-0 items-center border-b px-3">
        <h2 className="text-muted-foreground font-mono text-2xs tracking-wide">inspector</h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <InspectorSection
          title="Editor"
          open={open.editor}
          onOpenChange={(next) => setOpen((state) => ({ ...state, editor: next }))}
        >
          <div className="px-3 pb-3">
            {EDITOR_OPTIONS.map(({ key, label, description }) => (
              <ConfigSwitch
                key={key}
                id={`editor-${key}`}
                label={label}
                description={description}
                checked={config.editor[key]}
                onCheckedChange={(checked) =>
                  onConfigChange({ ...config, editor: { ...config.editor, [key]: checked } })
                }
              />
            ))}
          </div>
        </InspectorSection>

        <InspectorSection
          title="Preview"
          open={open.preview}
          onOpenChange={(next) => setOpen((state) => ({ ...state, preview: next }))}
        >
          <div className="px-3 pb-3">
            {PREVIEW_OPTIONS.map(({ key, label, description }) => (
              <ConfigSwitch
                key={key}
                id={`preview-${key}`}
                label={label}
                description={description}
                checked={config.preview[key]}
                onCheckedChange={(checked) =>
                  onConfigChange({ ...config, preview: { ...config.preview, [key]: checked } })
                }
              />
            ))}
          </div>
        </InspectorSection>

        <InspectorSection
          title="Plugins"
          meta={`${enabledCount}/${playgroundPlugins.length}`}
          open={open.plugins}
          onOpenChange={(next) => setOpen((state) => ({ ...state, plugins: next }))}
        >
          <div className="px-3 pb-3">
            <p className="text-muted-foreground mb-2 text-xs">
              Turning one off is the quickest way to see what it was doing. The list is built from the plugin set, so a
              newly registered plugin appears here on its own.
            </p>
            <div className="mb-2 flex gap-3">
              <button
                type="button"
                onClick={() => setAllPlugins(true)}
                className="text-pencil-blue text-xs underline underline-offset-3"
              >
                Turn all on
              </button>
              <button
                type="button"
                onClick={() => setAllPlugins(false)}
                className="text-pencil-blue text-xs underline underline-offset-3"
              >
                Turn all off
              </button>
            </div>
            {playgroundPlugins.map((plugin) => {
              const key = plugin.name.toLowerCase();
              return (
                <ConfigSwitch
                  key={key}
                  id={`plugin-${key}`}
                  label={plugin.name}
                  description={`v${plugin.version}`}
                  checked={config.plugins[key] ?? true}
                  onCheckedChange={(checked) =>
                    onConfigChange({ ...config, plugins: { ...config.plugins, [key]: checked } })
                  }
                />
              );
            })}
          </div>
        </InspectorSection>

        <InspectorSection
          title="Syntax tree"
          meta={open.nodes ? undefined : "off"}
          grow
          open={open.nodes}
          onOpenChange={(next) => {
            setOpen((state) => ({ ...state, nodes: next }));
            onNodesVisibleChange(next);
          }}
        >
          <div className="min-h-0 flex-1 overflow-auto">
            <NodeTree nodes={nodes} />
          </div>
        </InspectorSection>
      </div>
    </aside>
  );
}

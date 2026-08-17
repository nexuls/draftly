import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@workspace/ui/components/accordion";
import { Switch } from "@workspace/ui/components/switch";
import { Label } from "@workspace/ui/components/label";
import { allPlugins, type DraftlyNode } from "draftly/src";
import React from "react";
import type { PlaygroundConfig } from "./page";

type Props = {
  setShowNodes: (show: boolean) => void;
  nodes: DraftlyNode[];
  config: PlaygroundConfig;
  setConfig: React.Dispatch<React.SetStateAction<PlaygroundConfig>>;
  outputTime?: number | null;
};

export default function Devbar({ setShowNodes, nodes, config, setConfig, outputTime }: Props) {
  // Helper to toggle editor config
  const toggleEditorOption = (key: keyof PlaygroundConfig["editor"]) => {
    setConfig((prev) => ({
      ...prev,
      editor: { ...prev.editor, [key]: !prev.editor[key] },
    }));
  };

  // Helper to toggle preview config
  const togglePreviewOption = (key: keyof PlaygroundConfig["preview"]) => {
    setConfig((prev) => ({
      ...prev,
      preview: { ...prev.preview, [key]: !prev.preview[key] },
    }));
  };

  // Helper to toggle plugin
  const togglePlugin = (key: keyof PlaygroundConfig["plugins"]) => {
    setConfig((prev) => ({
      ...prev,
      plugins: { ...prev.plugins, [key]: !prev.plugins[key] },
    }));
  };

  // Track which accordions are open
  const [openValues, setOpenValues] = React.useState<string[]>(["editor", "preview"]);
  const isNodesOpen = openValues.includes("nodes");

  const handleValueChange = (values: string[]) => {
    // If nodes is being opened, collapse everything else
    if (values.includes("nodes") && !openValues.includes("nodes")) {
      setOpenValues(["nodes"]);
      setShowNodes(true);
    } else if (!values.includes("nodes") && openValues.includes("nodes")) {
      // Nodes is being closed, restore other sections
      setOpenValues(values.length > 0 ? values : ["editor", "preview"]);
      setShowNodes(false);
    } else {
      setOpenValues(values.filter((v) => v !== "nodes"));
      setShowNodes(values.includes("nodes"));
    }
  };

  return (
    <div className="h-full w-full flex flex-col border rounded-lg">
      <div className="text-muted-foreground font-mono text-center whitespace-nowrap h-10 p-2 border-b shrink-0">
        Developer Panel
      </div>

      {outputTime !== null && (
        <div className="text-xs text-muted-foreground p-2 border-b">Output generated in {outputTime?.toFixed(2)}ms</div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
        <Accordion
          type="multiple"
          value={openValues}
          className={`w-full ${isNodesOpen ? "h-full flex flex-col" : ""}`}
          onValueChange={handleValueChange}
        >
          {/* Editor Options */}
          <AccordionItem value="editor">
            <AccordionTrigger className="p-2 border-b rounded-none hover:no-underline cursor-pointer hover:bg-accent hover:text-accent-foreground">
              Editor Options
            </AccordionTrigger>
            <AccordionContent className="p-3 space-y-3">
              <ConfigSwitch
                id="baseStyles"
                label="Base Styles"
                description="Include default editor styles"
                checked={config.editor.baseStyles}
                onCheckedChange={() => toggleEditorOption("baseStyles")}
              />
              <ConfigSwitch
                id="defaultKeybindings"
                label="Default Keybindings"
                description="Enable standard keyboard shortcuts"
                checked={config.editor.defaultKeybindings}
                onCheckedChange={() => toggleEditorOption("defaultKeybindings")}
              />
              <ConfigSwitch
                id="history"
                label="History"
                description="Enable undo/redo support"
                checked={config.editor.history}
                onCheckedChange={() => toggleEditorOption("history")}
              />
              <ConfigSwitch
                id="indentWithTab"
                label="Indent with Tab"
                description="Use Tab key for indentation"
                checked={config.editor.indentWithTab}
                onCheckedChange={() => toggleEditorOption("indentWithTab")}
              />
              <ConfigSwitch
                id="highlightActiveLine"
                label="Highlight Active Line"
                description="Highlight the current line"
                checked={config.editor.highlightActiveLine}
                onCheckedChange={() => toggleEditorOption("highlightActiveLine")}
              />
              <ConfigSwitch
                id="lineWrapping"
                label="Line Wrapping"
                description="Wrap long lines"
                checked={config.editor.lineWrapping}
                onCheckedChange={() => toggleEditorOption("lineWrapping")}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Preview Options */}
          <AccordionItem value="preview">
            <AccordionTrigger className="p-2 border-b rounded-none hover:no-underline cursor-pointer hover:bg-accent hover:text-accent-foreground">
              Preview Options
            </AccordionTrigger>
            <AccordionContent className="p-3 space-y-3">
              <ConfigSwitch
                id="includeBase"
                label="Include Base CSS"
                description="Include base preview styles"
                checked={config.preview.includeBase}
                onCheckedChange={() => togglePreviewOption("includeBase")}
              />
              <ConfigSwitch
                id="sanitize"
                label="Sanitize HTML"
                description="Sanitize HTML output for security"
                checked={config.preview.sanitize}
                onCheckedChange={() => togglePreviewOption("sanitize")}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Plugin Toggles */}
          <AccordionItem value="plugins">
            <AccordionTrigger className="p-2 border-b rounded-none hover:no-underline cursor-pointer hover:bg-accent hover:text-accent-foreground">
              Plugins
            </AccordionTrigger>
            <AccordionContent className="p-3 space-y-3">
              {allPlugins.map((plugin) => {
                const key = plugin.name.toLowerCase();
                return (
                  <ConfigSwitch
                    key={key}
                    id={key}
                    label={plugin.name}
                    description={`Enable ${plugin.name} plugin`}
                    checked={config.plugins[key] ?? true}
                    onCheckedChange={() => togglePlugin(key)}
                  />
                );
              })}
            </AccordionContent>
          </AccordionItem>

          {/* Nodes Viewer */}
          <AccordionItem value="nodes" className={"flex-1 flex flex-col min-h-0"}>
            <AccordionTrigger className="p-2 border-b rounded-none hover:no-underline cursor-pointer hover:bg-accent hover:text-accent-foreground shrink-0">
              <div>
                Nodes <span className="text-muted-foreground text-xs">(Hide for performance)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className={"flex-1 h-full overflow-auto p-0"}>
              <NodeViewer nodes={nodes} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}

// Reusable switch component with label and description
function ConfigSwitch({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {label}
        </Label>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function NodeViewer({ nodes, depth = 0 }: { nodes: DraftlyNode[]; depth?: number }) {
  return (
    <div className="font-mono text-xs">
      {nodes.map((node, idx) => (
        <div key={`${node.name}-${node.from}-${idx}`}>
          <div
            className={`flex items-center gap-2 py-0.5 px-1 rounded ${node.isSelected ? "bg-primary/20 text-primary" : "hover:bg-muted"}`}
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
          >
            <span className="font-semibold">{node.name}</span>
            <span className="text-muted-foreground">
              [{node.from}:{node.to}]
            </span>
          </div>
          {node.children.length > 0 && <NodeViewer nodes={node.children} depth={depth + 1} />}
        </div>
      ))}
    </div>
  );
}

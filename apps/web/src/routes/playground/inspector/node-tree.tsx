import type { DraftlyNode } from "draftly/src";
import { cn } from "@/lib/utils";

/** Indent per tree level, in pixels. */
const INDENT = 11;

/**
 * The Lezer syntax tree for the open document.
 *
 * This is the one place a plugin author can check what the parser actually produced, which
 * is almost always the answer when a decoration does not appear. Nodes under the caret are
 * marked in blue pencil, so moving the caret shows which node owns the construct.
 *
 * @param props.nodes - The tree as reported by `onNodesChange`
 * @param props.depth - Current nesting level; callers leave it at the default
 * @returns The tree element
 */
export function NodeTree({ nodes, depth = 0 }: { nodes: DraftlyNode[]; depth?: number }) {
  if (depth === 0 && nodes.length === 0) {
    return (
      <p className="text-muted-foreground px-3 py-4 text-xs italic">
        Nothing parsed yet. Type something in the editor.
      </p>
    );
  }

  return (
    <ul className={cn("font-mono text-2xs", depth === 0 && "px-1 py-1")}>
      {nodes.map((node) => (
        <li key={`${node.name}-${node.from}-${node.to}`}>
          <div
            className={cn(
              "flex items-baseline gap-2 rounded-sm py-px pr-1",
              node.isSelected ? "text-pencil-blue bg-pencil-blue/8" : "text-muted-foreground"
            )}
            style={{ paddingLeft: `${depth * INDENT + 6}px` }}
          >
            <span className={cn("truncate", node.isSelected ? "font-medium" : "text-foreground/80")}>{node.name}</span>
            <span className="ml-auto shrink-0 tabular-nums opacity-70">
              {node.from}:{node.to}
            </span>
          </div>
          {node.children.length > 0 && <NodeTree nodes={node.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

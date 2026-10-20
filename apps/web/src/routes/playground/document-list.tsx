import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CreateDocumentDialog, DeleteDocumentDialog } from "./document-dialogs";
import type { PlaygroundDocument } from "./types";

type DocumentListProps = {
  documents: PlaygroundDocument[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onCreate: (title: string) => void;
  onRemove: (id: string) => void;
};

/**
 * The document list, set as a table of contents.
 *
 * The selected document is marked by a rule in the margin rather than a filled row: a
 * block of accent colour competes with the page next to it, and a mark in the margin is
 * how a reader would flag the page they are on anyway.
 *
 * @param props - The documents, the selection, and the mutators
 * @returns The list element
 */
export function DocumentList({ documents, currentIndex, onSelect, onCreate, onRemove }: DocumentListProps) {
  const [pendingDelete, setPendingDelete] = useState<PlaygroundDocument | null>(null);

  return (
    <nav className="flex h-full w-full flex-col" aria-label="Documents">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 pr-1 pl-3">
        <h2 className="text-muted-foreground font-mono text-2xs tracking-wide">documents</h2>
        <CreateDocumentDialog
          onCreate={onCreate}
          trigger={
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="New document"
                  className="text-muted-foreground hover:bg-accent hover:text-foreground grid size-6 place-items-center rounded-md transition-colors"
                >
                  <Plus className="size-3.5" strokeWidth={1.75} />
                </button>
              </TooltipTrigger>
              <TooltipContent>New document</TooltipContent>
            </Tooltip>
          }
        />
      </div>

      {documents.length === 0 ? (
        <p className="text-muted-foreground px-3 py-6 text-sm italic">No documents yet. Create one to start writing.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto pb-2">
          {documents.map((document, index) => {
            const active = index === currentIndex;

            return (
              <li key={document.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 py-1.5 pr-8 pl-3 text-left text-sm transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full transition-colors",
                      active ? "bg-pencil-blue" : "bg-transparent"
                    )}
                  />
                  <span className="truncate">{document.title}</span>
                </button>

                <button
                  type="button"
                  aria-label={`Delete ${document.title}`}
                  onClick={() => setPendingDelete(document)}
                  className={cn(
                    "text-muted-foreground hover:text-destructive absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md transition",
                    "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  )}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        The top rail has no room for the theme control on a narrow screen, so it lives
        down here instead of being unavailable.
      */}
      <div className="border-rule mt-auto flex shrink-0 items-center justify-between gap-2 border-t px-3 py-2 sm:hidden">
        <span className="text-muted-foreground font-mono text-2xs">theme</span>
        <ThemeSwitcher />
      </div>

      <DeleteDocumentDialog
        title={pendingDelete?.title ?? null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onRemove(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </nav>
  );
}

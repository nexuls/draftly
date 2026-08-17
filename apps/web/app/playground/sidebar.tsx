"use client";

import type React from "react";
import { useState } from "react";
import type { Content } from "./types";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Plus, FileText, Pencil, Trash2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import CreateContentDialog from "./create-content-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";

type Props = {
  contents: Content[];
  currentContent: number;
  setCurrentContent: (content: number) => void;
  addNewContent: (title: string) => void;
  deleteContent: (id: string) => void;
  renameContent: (id: string, newTitle: string) => void;
};

export default function Sidebar({
  contents,
  currentContent,
  setCurrentContent,
  addNewContent,
  deleteContent,
  renameContent,
}: Props) {
  const [editingContent, setEditingContent] = useState<Content | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingContent, setDeletingContent] = useState<Content | null>(null);

  function handleStartEdit(content: Content, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingContent(content);
    setEditTitle(content.title);
  }

  function handleSaveEdit() {
    if (editingContent && editTitle.trim()) {
      renameContent(editingContent.id, editTitle.trim());
      setEditingContent(null);
      setEditTitle("");
    }
  }

  function handleStartDelete(content: Content, e: React.MouseEvent) {
    e.stopPropagation();
    setDeletingContent(content);
  }

  function handleConfirmDelete() {
    if (deletingContent) {
      deleteContent(deletingContent.id);
      setDeletingContent(null);
    }
  }

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <h2 className="text-sm font-semibold">Contents</h2>
        <CreateContentDialog
          onCreateContent={addNewContent}
          trigger={
            <Button size="icon" variant="ghost">
              <Plus className="h-4 w-4" />
            </Button>
          }
        />
      </div>

      {/* Content List */}
      <div className="flex-1 overflow-y-auto">
        {contents.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">No contents yet</div>
        ) : (
          <ul className="py-2">
            {contents.map((content, index) => (
              <li key={content.id} className="group">
                <div
                  onClick={() => setCurrentContent(index)}
                  className={cn(
                    "w-full px-3 py-2 flex items-center gap-2 text-left text-sm transition-colors hover:bg-accent hover:transition-none cursor-pointer",
                    currentContent === index && "bg-accent"
                  )}
                  aria-selected={currentContent === index}
                  role="option"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{content.title}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={(e) => handleStartEdit(content, e)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={(e) => handleStartDelete(content, e)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingContent} onOpenChange={(open) => !open && setEditingContent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Content</DialogTitle>
            <DialogDescription>Enter a new title for this content.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Content title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingContent(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={!editTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingContent} onOpenChange={(open) => !open && setDeletingContent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Content</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingContent?.title}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

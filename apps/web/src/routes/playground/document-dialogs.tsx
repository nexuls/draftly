import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Ask for a title, then create the document.
 *
 * @param props.onCreate - Called with the trimmed title
 * @param props.trigger - The element that opens the dialog
 * @returns The dialog element
 */
export function CreateDocumentDialog({
  onCreate,
  trigger,
}: {
  onCreate: (title: string) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  function create() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setTitle("");
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTitle("");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>It is saved in this browser only. Nothing leaves the page.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="new-document-title">Title</Label>
          <Input
            id="new-document-title"
            placeholder="Release notes"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") create();
            }}
            // The dialog exists solely to collect this value.
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!title.trim()}>
            Create document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Confirm deleting a document.
 *
 * Open state is driven by the document passed in, so the parent needs one piece of state
 * rather than a boolean plus a target.
 *
 * @param props.title - Title of the document pending deletion, or null when closed
 * @param props.onCancel - Called when the dialog is dismissed
 * @param props.onConfirm - Called when deletion is confirmed
 * @returns The dialog element
 */
export function DeleteDocumentDialog({
  title,
  onCancel,
  onConfirm,
}: {
  title: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={title !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes it from this browser. There is no copy anywhere else.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete document
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

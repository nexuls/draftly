"use client";

import type React from "react";
import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";

type Props = {
  onCreateContent: (title: string) => void;
  trigger: React.ReactNode;
};

export default function CreateContentDialog({ onCreateContent, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  function handleCreate() {
    if (title.trim()) {
      onCreateContent(title.trim());
      setTitle("");
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Content</DialogTitle>
          <DialogDescription>Enter a title for your new content.</DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Content title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!title.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

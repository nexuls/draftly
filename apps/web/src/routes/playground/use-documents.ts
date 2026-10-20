import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import walkthrough from "@/content/walkthrough";
import whatIsDraftly from "@/content/what-is-draftly";
import type { PlaygroundDocument, SaveStatus } from "./types";

const STORAGE_KEY = "draftly-playground-contents";
const STORAGE_CURRENT_KEY = "draftly-playground-current";
const STORAGE_VERSION_KEY = "draftly-playground-version";

/**
 * Seed-content version.
 *
 * **Bump this whenever `src/content/walkthrough.ts` or `src/content/what-is-draftly.ts`
 * changes.** Returning readers have the old text in `localStorage`, and the version
 * mismatch is the only thing that refreshes it. Forgetting means the new demo content is
 * invisible to everyone who has visited before, including you.
 */
const VERSION = 3;

/** How long after the last keystroke the document is written to storage. */
const SAVE_DEBOUNCE_MS = 500;

/** How long the "Saved" acknowledgement stays on screen. */
const SAVED_NOTICE_MS = 2000;

const SEEDED_DOCUMENTS: readonly PlaygroundDocument[] = [
  { id: "0", title: "What is Draftly?", content: whatIsDraftly },
  { id: "1", title: "Walkthrough", content: walkthrough },
];

const SEEDED_IDS = new Set(SEEDED_DOCUMENTS.map((document) => document.id));

/**
 * Parse the stored document list, tolerating anything that is not a usable array.
 *
 * @param raw - The raw `localStorage` value, or `null`
 * @returns The parsed documents, or `null` when there is nothing usable
 */
function parseStored(raw: string | null): PlaygroundDocument[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PlaygroundDocument[]) : null;
  } catch {
    return null;
  }
}

type UseDocumentsResult = {
  documents: PlaygroundDocument[];
  /** Index into `documents`, or `-1` when nothing is selected. */
  currentIndex: number;
  current: PlaygroundDocument | undefined;
  /** False until the first read from `localStorage` has finished. */
  ready: boolean;
  saveStatus: SaveStatus;
  select: (index: number) => void;
  create: (title: string) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  /** Replace a document's markdown. Applied immediately, persisted on a debounce. */
  edit: (id: string, content: string) => void;
};

/**
 * Own the playground's document list, its selection, and their persistence.
 *
 * Split out of the route so the route stays composition only. Everything here is storage
 * mechanics: the version-based seed refresh, the write debounce, and the save indicator.
 *
 * State transitions are computed from a ref rather than inside a `setState` updater,
 * because each one also has to schedule a write and move the selection — side effects that
 * React is free to run twice from inside an updater.
 *
 * @returns The documents, the selection, and the mutators
 */
export function useDocuments(): UseDocumentsResult {
  const [documents, setDocuments] = useState<PlaygroundDocument[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // The authoritative copy for the mutators. React state drives rendering; this drives
  // the next transition, so a mutator never has to read stale props.
  const documentsRef = useRef<PlaygroundDocument[]>([]);
  const currentIndexRef = useRef(-1);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Commit a transition: update the refs, the state, and the debounced write.
   *
   * @param next - The new document list
   * @param index - The new selection
   * @returns Nothing
   */
  const commit = useCallback((next: PlaygroundDocument[], index: number) => {
    documentsRef.current = next;
    currentIndexRef.current = index;
    setDocuments(next);
    setCurrentIndex(index);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);

    setSaveStatus("saving");
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      localStorage.setItem(STORAGE_CURRENT_KEY, String(index));
      setSaveStatus("saved");
      noticeTimer.current = setTimeout(() => setSaveStatus("idle"), SAVED_NOTICE_MS);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    const stored = parseStored(localStorage.getItem(STORAGE_KEY));
    const storedCurrent = localStorage.getItem(STORAGE_CURRENT_KEY);
    const outdated = localStorage.getItem(STORAGE_VERSION_KEY) !== String(VERSION);

    if (stored && !outdated) {
      const parsedCurrent = Number.parseInt(storedCurrent ?? "", 10);
      const index = Number.isNaN(parsedCurrent) || parsedCurrent >= stored.length ? 0 : parsedCurrent;
      documentsRef.current = stored;
      currentIndexRef.current = stored.length === 0 ? -1 : index;
      setDocuments(stored);
      setCurrentIndex(currentIndexRef.current);
    } else {
      // Either a first visit or a seed-content bump. In both cases the seeded documents
      // are replaced wholesale and anything the reader wrote is kept.
      const authored = stored?.filter((document) => !SEEDED_IDS.has(document.id)) ?? [];
      const merged = [...SEEDED_DOCUMENTS, ...authored];
      documentsRef.current = merged;
      currentIndexRef.current = 0;
      setDocuments(merged);
      setCurrentIndex(0);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      localStorage.setItem(STORAGE_CURRENT_KEY, "0");
      localStorage.setItem(STORAGE_VERSION_KEY, String(VERSION));
    }

    setReady(true);
  }, []);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    []
  );

  const select = useCallback(
    (index: number) => {
      commit(documentsRef.current, index);
    },
    [commit]
  );

  const create = useCallback(
    (title: string) => {
      const created: PlaygroundDocument = {
        id: uuid(),
        title,
        content: `# ${title}\n\nStart writing. The markdown stays where you typed it.\n`,
      };
      const next = [...documentsRef.current, created];
      commit(next, next.length - 1);
    },
    [commit]
  );

  const rename = useCallback(
    (id: string, title: string) => {
      const next = documentsRef.current.map((document) => (document.id === id ? { ...document, title } : document));
      commit(next, currentIndexRef.current);
    },
    [commit]
  );

  const remove = useCallback(
    (id: string) => {
      const index = documentsRef.current.findIndex((document) => document.id === id);
      if (index === -1) return;

      const next = documentsRef.current.filter((document) => document.id !== id);
      const selected = currentIndexRef.current;
      // Removing a document at or before the selection shifts the selection left;
      // removing the last one leaves nothing selected.
      const nextIndex = next.length === 0 ? -1 : selected >= index ? Math.max(0, selected - 1) : selected;
      commit(next, nextIndex);
    },
    [commit]
  );

  const edit = useCallback(
    (id: string, content: string) => {
      const next = documentsRef.current.map((document) => (document.id === id ? { ...document, content } : document));
      commit(next, currentIndexRef.current);
    },
    [commit]
  );

  const current = currentIndex === -1 ? undefined : documents[currentIndex];

  return useMemo(
    () => ({ documents, currentIndex, current, ready, saveStatus, select, create, rename, remove, edit }),
    [documents, currentIndex, current, ready, saveStatus, select, create, rename, remove, edit]
  );
}

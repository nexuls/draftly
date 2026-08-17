# Table Plugin (deep dive)

> Last verified: 2026-08-18 · commit `eae4434`
> Source: `packages/draftly/src/plugins/table-plugin.ts` (1759 LOC) · plugin version `2.0.0`

The most complex plugin in the codebase and the most recently reworked
(`226f388` → `4eb5c6d` → `e5dc598`). It gets its own document because it is the only
plugin that maintains state, dispatches its own transactions, and recursively invokes the
preview renderer.

**Read this before touching it.** Several of its mechanisms look like accidents and are not.

---

## Why it is hard

A GFM table is _plain text that must stay visually aligned_. That creates obligations no
other plugin has:

1. **Alignment is content.** Padding cells to equal width is a document edit, not a
   decoration — so the plugin must write to the document as the user types.
2. **Cells are not lines.** Navigation (Tab, arrows, Enter) must move between cells, not
   between lines, which means intercepting a lot of default keymap behaviour.
3. **Structural edits are text surgery.** "Add a column" means rewriting every line.
4. **Cell content is markdown.** A cell may contain `**bold**` or a link, so preview must
   recursively run a full markdown render _inside_ each cell.
5. **Newlines are illegal inside cells.** Line breaks must round-trip as `<br />`.

---

## Layer structure

The file is organised bottom-up. Respect these boundaries when editing.

```
┌─ Widgets ──────────────────────────────────────────────┐
│  TableBreakWidget      renders <br /> inside a cell     │
│  TableControlsWidget   hover buttons: add row / column  │
├─ Pure text utilities ──────────────────────────────────┤
│  isEscaped, getPipePositions, splitTableLine            │
│  isTableRowLine, parseAlignment, parseDelimiterAlignments│
│  canonicalizeBreakTags, escapeUnescapedPipes            │
│  normalizeCellContent, renderWidth, padCell, delimiterCell│
├─ Table model ──────────────────────────────────────────┤
│  parseTableMarkdown → ParsedTable                       │
│  normalizeParsedTable, formatTableMarkdown              │
│  buildEmptyRow, buildTableFromInfo                      │
├─ Document reading ─────────────────────────────────────┤
│  readTableInfo(state, from, to) → TableInfo             │
│  getTableInfoAtPosition, findCellAtPosition             │
│  clampCellPosition, collectBreakRanges, getVisibleBounds│
├─ Decoration ───────────────────────────────────────────┤
│  buildDecorations → decorateTable → decorateLine        │
│  computeBlockWrappers, computeAtomicRanges              │
├─ Mutation (dispatches transactions) ───────────────────┤
│  normalizeTables, ensureTablePadding, ensureTableSelection│
│  replaceTable, insertRow/Column, removeRow/Column       │
├─ Interaction ──────────────────────────────────────────┤
│  handleTab, handleArrowHorizontal/Vertical, handleEnter │
│  insertBreakTag, handleBreakDeletion, handleDomKeydown  │
└─ Preview ──────────────────────────────────────────────┘
   renderToHTML → nested PreviewRenderer per cell
```

The pure-utility and model layers have **no CodeMirror dependency**. Keep it that way:
that is what makes the parsing logic testable in isolation.

---

## Data model

**`ParsedTable`** — the pure markdown-level model, used for _producing_ tables:

```ts
interface ParsedTable {
  headers: string[];
  alignments: Alignment[]; // "left" | "center" | "right"
  rows: string[][];
}
```

**`TableCellInfo`** — a document-anchored cell. Note the two spans: `from`/`to` covers the
full cell including padding, `contentFrom`/`contentTo` covers only the trimmed content.

```ts
interface TableCellInfo {
  rowKind: "header" | "body";
  rowIndex: number;
  columnIndex: number;
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  lineFrom: number;
  lineNumber: number;
  rawText: string;
}
```

**`TableInfo`** — a document-anchored table, used for _navigating_ existing markdown:

```ts
interface TableInfo {
  from: number;
  to: number;
  startLineNumber: number;
  delimiterLineNumber: number;
  endLineNumber: number;
  columnCount: number;
  alignments: Alignment[];
  cellsByRow: TableCellInfo[][];
  headerCells: TableCellInfo[];
  bodyCells: TableCellInfo[][];
}
```

`buildTableFromInfo()` converts a `TableInfo` back into a `ParsedTable`. The two cell
spans exist because padding whitespace belongs to the cell for decoration purposes but
not for cursor placement.

---

## The three deferred repairs

The plugin's defining mechanism. CodeMirror forbids dispatching a transaction from inside
`update()` or `buildDecorations()`, but the plugin must edit the document in response to
edits. Resolution: **detect during update, dispatch after**.

```
onViewUpdate(update)
   ├─ scheduleNormalization(view)   → normalizeTables()      reformat malformed markdown
   ├─ schedulePadding(view)         → ensureTablePadding()   re-pad cells to equal width
   └─ scheduleSelectionRepair(view) → ensureTableSelection() pull cursor out of hidden syntax
```

Each `schedule*` stores the view on a `pending*View` field and defers the real work; each
worker clears its field first thing. The `pending*View` guards are **re-entrancy locks**,
not caching — removing them causes infinite dispatch loops, because each repair
transaction triggers another `onViewUpdate`.

Two `Annotation`s tag the plugin's own transactions:

```ts
const normalizeAnnotation = Annotation.define<boolean>();
const repairSelectionAnnotation = Annotation.define<boolean>();
```

They let the plugin recognise its own edits and skip re-processing them. **Any new
self-dispatch must carry an annotation and be checked for on the way back in.**

---

## Decoration strategy

Four mechanisms, layered:

1. **`BlockWrapper`** (`tableBlockWrapper`) wraps the whole table's lines in a
   `div.cm-draftly-table-wrapper`, provided via `computeBlockWrappers()`. This is what
   allows CSS table layout across what CodeMirror considers independent lines.
2. **Line decorations** style each row line (header / body / delimiter).
3. **Cell mark decorations** carry alignment and header/last-cell state. Selected via
   `getCellDecoration(isHeader, alignment, isLastCell)` from a precomputed
   `cellDecorations` map — 2 × 3 × 2 combinations built once at module scope.
4. **Replace decorations** hide the `|` pipes (`pipeReplace`) and the entire delimiter
   row (`delimiterReplace`).

`computeAtomicRanges()` marks hidden syntax atomic so arrow keys jump over it rather than
landing inside invisible text. This works together with `ensureTableSelection()`, which
catches the cases atomic ranges miss (clicks, programmatic selection).

---

## Keyboard model

| Key               | Behaviour                                                    |
| ----------------- | ------------------------------------------------------------ |
| `Tab` / `S-Tab`   | Next / previous cell; wraps rows; appends a row past the end |
| `←` / `→`         | Move within cell, then jump to the adjacent cell             |
| `↑` / `↓`         | Move to the same column in the adjacent row                  |
| `Enter`           | New row below; splits or exits depending on cell state       |
| `S-Enter`         | Insert `<br />` in the current cell                          |
| `Backspace`/`Del` | `handleBreakDeletion` removes a `<br />` atomically          |

Delivered through **two** paths, deliberately:

- `getKeymap()` — the normal CodeMirror route.
- `handleDomKeydown` via `EditorView.domEventHandlers` — for keys that
  `Prec`-competing extensions would otherwise claim first.

If a key works in one context and not another, check whether it is registered on both paths.

---

## Text handling rules

- **Pipes** — `isEscaped()` / `getPipePositions()` respect backslash escapes throughout;
  `escapeUnescapedPipes()` escapes user-typed `|` inside cell content.
- **Breaks** — `canonicalizeBreakTags()` normalises every `<br>`, `<br/>`, `<BR />` form
  to the single canonical `<br />` (`BREAK_TAG`).
- **Width** — `renderWidth()` computes display width for padding. **It is not
  grapheme-aware**, so CJK characters and emoji misalign the raw markdown. Cosmetic only
  (the decorated view still looks right), tracked as an open task.
- **Delimiter** — `DELIMITER_CELL_PATTERN = /^:?-{3,}:?$/` enforces a 3-dash minimum,
  stricter than GFM's 1-dash. Deliberate, for readable source.
- **Trailing content** — `splitTableAndTrailingMarkdown()` separates a table from
  non-table lines that follow it, so a paragraph right after a table is not swallowed
  (fixed in `2a1e0d8`).

---

## Preview rendering

`renderToHTML()` does not use the `children` argument at all. Instead it re-parses the
table markdown itself and, for each cell, spins up a **nested `PreviewRenderer`**:

```ts
function createPreviewRenderer(markdown: string, config?: DraftlyConfig): PreviewRenderer;
function stripSingleParagraph(html: string): string; // unwrap <p> from single-paragraph cells
```

This is why `TablePlugin` imports from `../preview/renderer` — the only plugin that
depends on the preview module, and the only reason `renderToHTML` had to become async
across the whole pipeline.

`stripSingleParagraph()` exists because a cell containing `**bold**` parses as a
`Paragraph`, which would emit `<td><p><strong>…</strong></p></td>`. Cells with multiple
blocks keep their wrappers.

---

## Editing this plugin safely

1. **Identify the layer** from the diagram above and stay inside it. Text utilities must
   not learn about `EditorView`.
2. **Prefer a pure function.** Most of the file is already pure; new logic usually can be.
3. **Never dispatch from `buildDecorations`.** Use the `schedule*` mechanism.
4. **Annotate every self-dispatch** and check for the annotation on re-entry.
5. **Test the awkward cases:** empty cells, escaped pipes, `<br />` at cell boundaries,
   single-column tables, a table as the last line of the document, a paragraph directly
   after a table, and multi-cursor selections.
6. **Verify both surfaces.** Editor decoration and preview HTML are separate code paths
   here (unlike simpler plugins), so a change to one does not carry to the other.

### Standing recommendation

At 1759 LOC the file is well past the ~500 LOC ceiling every other plugin respects, and
its internal layers are already clean enough to split mechanically:

```
plugins/table/
├── index.ts            # TablePlugin class
├── widgets.ts          # TableBreakWidget, TableControlsWidget
├── text-utils.ts       # pure string helpers
├── model.ts            # ParsedTable, parse/format/normalize
├── document.ts         # TableInfo readers
├── decorations.ts      # decoration maps + builders
├── commands.ts         # mutations + key handlers
├── preview.ts          # renderToHTML + nested renderer
└── theme.ts            # createTheme block
```

Tracked in [../tasks/ongoing/](../tasks/ongoing/) — **confirm with the developer before
starting**, since the plugin was reworked recently and a large move would obscure that
history.

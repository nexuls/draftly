import { Annotation, type EditorState, type Extension, Prec, type Range, RangeSet } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { BlockWrapper, Decoration, EditorView, type KeyBinding, WidgetType, keymap } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { type MarkdownConfig, Table } from "@lezer/markdown";
import { createTheme } from "../editor";
import type { DraftlyConfig } from "../editor/draftly";
import { type DecorationContext, DecorationPlugin, type PluginContext } from "../editor/plugin";
import { ThemeEnum } from "../editor/utils";
import { PreviewRenderer } from "../preview/renderer";
import { displayWidth } from "../lib/display-width";

type Alignment = "left" | "center" | "right";
type TableRowKind = "header" | "body";

interface ParsedTable {
  headers: string[];
  alignments: Alignment[];
  rows: string[][];
}

interface PreviewContextLike {
  sliceDoc(from: number, to: number): string;
  sanitize(html: string): string;
}

interface TableCellInfo {
  rowKind: TableRowKind;
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

const BREAK_TAG = "<br />";
const BREAK_TAG_REGEX = /<br\s*\/?>/gi;
const DELIMITER_CELL_PATTERN = /^:?-{3,}:?$/;
const TABLE_SUB_NODE_NAMES = new Set(["TableHeader", "TableDelimiter", "TableRow", "TableCell"]);
const TABLE_TEMPLATE: ParsedTable = {
  headers: ["Header 1", "Header 2", "Header 3"],
  alignments: ["left", "left", "left"],
  rows: [["", "", ""]],
};

const normalizeAnnotation = Annotation.define<boolean>();
const repairSelectionAnnotation = Annotation.define<boolean>();
const pipeReplace = Decoration.replace({});
const delimiterReplace = Decoration.replace({});

const tableBlockWrapper = BlockWrapper.create({
  tagName: "div",
  attributes: { class: "cm-draftly-table-wrapper" },
});

class TableBreakWidget extends WidgetType {
  /** Reuses the same widget instance for identical break markers. */
  override eq(): boolean {
    return true;
  }

  /** Renders an inline `<br />` placeholder inside a table cell. */
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-draftly-table-break";
    span.setAttribute("aria-label", "line break");
    span.appendChild(document.createElement("br"));
    return span;
  }

  /** Allows the editor to observe events on the rendered break widget. */
  override ignoreEvent(): boolean {
    return false;
  }
}

class TableControlsWidget extends WidgetType {
  constructor(
    private readonly onAddRow: (view: EditorView) => void,
    private readonly onAddColumn: (view: EditorView) => void
  ) {
    super();
  }

  /** Forces the control widget to be recreated so handlers stay current. */
  override eq(): boolean {
    return false;
  }

  /** Renders the hover controls used to append rows and columns. */
  toDOM(view: EditorView): HTMLElement {
    const anchor = document.createElement("span");
    anchor.className = "cm-draftly-table-controls-anchor";
    anchor.setAttribute("aria-hidden", "true");

    const rightButton = this.createButton("Add column", "cm-draftly-table-control cm-draftly-table-control-column");
    rightButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onAddColumn(view);
    });

    const bottomButton = this.createButton("Add row", "cm-draftly-table-control cm-draftly-table-control-row");
    bottomButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onAddRow(view);
    });

    anchor.append(rightButton, bottomButton);
    return anchor;
  }

  /** Lets button events bubble through the widget. */
  override ignoreEvent(): boolean {
    return false;
  }

  /** Builds a single control button with the provided label and class. */
  private createButton(label: string, className: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("tabindex", "-1");
    button.setAttribute("aria-label", label);
    button.textContent = "+";
    return button;
  }
}

/** Returns whether the character at the given index is backslash-escaped. */
function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
    slashCount++;
  }
  return slashCount % 2 === 1;
}

/** Collects the positions of every unescaped pipe character in a line. */
function getPipePositions(lineText: string): number[] {
  const positions: number[] = [];
  for (let index = 0; index < lineText.length; index++) {
    if (lineText[index] === "|" && !isEscaped(lineText, index)) {
      positions.push(index);
    }
  }
  return positions;
}

/** Splits a markdown table row into raw cell strings. */
function splitTableLine(lineText: string): string[] {
  const cells: string[] = [];
  const trimmed = lineText.trim();

  if (!trimmed.includes("|")) {
    return [trimmed];
  }

  let current = "";
  for (let index = 0; index < trimmed.length; index++) {
    const char = trimmed[index]!;
    if (char === "|" && !isEscaped(trimmed, index)) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);

  if (trimmed.startsWith("|")) {
    cells.shift();
  }
  if (trimmed.endsWith("|")) {
    cells.pop();
  }

  return cells;
}

/** Checks whether the given line can participate in a table block. */
function isTableRowLine(lineText: string): boolean {
  return getPipePositions(lineText.trim()).length > 0;
}

/** Parses a delimiter cell token into a table alignment value. */
function parseAlignment(cell: string): Alignment {
  const trimmed = cell.trim();
  const left = trimmed.startsWith(":");
  const right = trimmed.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return "left";
}

/** Parses the delimiter line and returns per-column alignments. */
function parseDelimiterAlignments(lineText: string): Alignment[] | null {
  const cells = splitTableLine(lineText).map((cell) => cell.trim());
  if (cells.length === 0 || !cells.every((cell) => DELIMITER_CELL_PATTERN.test(cell))) {
    return null;
  }
  return cells.map(parseAlignment);
}

/** Splits a table node slice into its table lines and any trailing markdown. */
function splitTableAndTrailingMarkdown(markdown: string): { tableMarkdown: string; trailingMarkdown: string } {
  const lines = markdown.split("\n");
  if (lines.length < 2) {
    return { tableMarkdown: markdown, trailingMarkdown: "" };
  }

  const headerLine = lines[0] || "";
  const delimiterLine = lines[1] || "";
  if (!isTableRowLine(headerLine) || !parseDelimiterAlignments(delimiterLine)) {
    return { tableMarkdown: markdown, trailingMarkdown: "" };
  }

  let endIndex = 1;
  for (let index = 2; index < lines.length; index++) {
    if (!isTableRowLine(lines[index] || "")) {
      break;
    }
    endIndex = index;
  }

  return {
    tableMarkdown: lines.slice(0, endIndex + 1).join("\n"),
    trailingMarkdown: lines.slice(endIndex + 1).join("\n"),
  };
}

/** Normalizes every supported `<br>` form to the canonical `<br />` token. */
function canonicalizeBreakTags(text: string): string {
  return text.replace(BREAK_TAG_REGEX, BREAK_TAG);
}

/** Escapes literal pipe characters so cell content stays GFM-compatible. */
function escapeUnescapedPipes(text: string): string {
  let result = "";
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (char === "|" && !isEscaped(text, index)) {
      result += "\\|";
      continue;
    }
    result += char;
  }
  return result;
}

/** Trims and normalizes cell content before it is written back to markdown. */
function normalizeCellContent(text: string): string {
  const normalizedBreaks = canonicalizeBreakTags(text.trim());
  if (!normalizedBreaks) {
    return "";
  }

  const parts = normalizedBreaks.split(BREAK_TAG_REGEX).map((part) => escapeUnescapedPipes(part.trim()));
  if (parts.length === 1) {
    return parts[0] || "";
  }

  return parts.join(` ${BREAK_TAG} `).trim();
}

/**
 * Measures the visible width of a cell for markdown alignment output.
 *
 * Measured in monospace **columns**, not code units. `String.length` misaligns the raw
 * markdown for CJK (two columns, one unit), emoji (two columns, two units), combining
 * marks (zero columns, one unit) and ZWJ sequences. Pure ASCII is unaffected, so existing
 * documents see no padding churn.
 */
function renderWidth(text: string): number {
  return displayWidth(canonicalizeBreakTags(text).replace(BREAK_TAG, " ").replace(/\\\|/g, "|"));
}

/** Pads a cell according to its alignment for normalized markdown output. */
function padCell(text: string, width: number, alignment: Alignment): string {
  const safeWidth = Math.max(width, renderWidth(text));
  const difference = safeWidth - renderWidth(text);
  if (difference <= 0) {
    return text;
  }

  if (alignment === "right") {
    return " ".repeat(difference) + text;
  }

  if (alignment === "center") {
    const left = Math.floor(difference / 2);
    const right = difference - left;
    return " ".repeat(left) + text + " ".repeat(right);
  }

  return text + " ".repeat(difference);
}

/** Builds the markdown delimiter token for a column. */
function delimiterCell(width: number, alignment: Alignment): string {
  const hyphenCount = Math.max(width, 3);
  if (alignment === "center") {
    return ":" + "-".repeat(Math.max(1, hyphenCount - 2)) + ":";
  }
  if (alignment === "right") {
    return "-".repeat(Math.max(2, hyphenCount - 1)) + ":";
  }
  return "-".repeat(hyphenCount);
}

/** Parses a markdown table block into header, alignment, and body rows. */
function parseTableMarkdown(markdown: string): ParsedTable | null {
  const { tableMarkdown } = splitTableAndTrailingMarkdown(markdown);
  const lines = tableMarkdown.split("\n");
  if (lines.length < 2) {
    return null;
  }

  const headers = splitTableLine(lines[0] || "").map((cell) => cell.trim());
  const alignments = parseDelimiterAlignments(lines[1] || "");
  if (!alignments) {
    return null;
  }

  const rows = lines
    .slice(2)
    .filter((line) => isTableRowLine(line))
    .map((line) => splitTableLine(line).map((cell) => cell.trim()));

  return { headers, alignments, rows };
}

/** Expands all rows so the parsed table has a consistent column count. */
function normalizeParsedTable(parsed: ParsedTable): ParsedTable {
  const columnCount = Math.max(
    parsed.headers.length,
    parsed.alignments.length,
    ...parsed.rows.map((row) => row.length),
    1
  );

  const headers = Array.from({ length: columnCount }, (_, index) => normalizeCellContent(parsed.headers[index] || ""));
  const alignments = Array.from({ length: columnCount }, (_, index) => parsed.alignments[index] || "left");
  const rows = parsed.rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => normalizeCellContent(row[index] || ""))
  );

  return { headers, alignments, rows };
}

/** Formats a parsed table back into normalized GFM markdown. */
function formatTableMarkdown(parsed: ParsedTable): string {
  const normalized = normalizeParsedTable(parsed);
  const widths = normalized.headers.map((header, index) =>
    Math.max(renderWidth(header), ...normalized.rows.map((row) => renderWidth(row[index] || "")), 3)
  );

  const formatRow = (cells: string[]) =>
    `| ${cells.map((cell, index) => padCell(cell, widths[index] || 3, normalized.alignments[index] || "left")).join(" | ")} |`;

  const headerLine = formatRow(normalized.headers);
  const delimiterLine = `| ${normalized.alignments
    .map((alignment, index) => delimiterCell(widths[index] || 3, alignment))
    .join(" | ")} |`;
  const bodyLines = normalized.rows.map((row) => formatRow(row));

  return [headerLine, delimiterLine, ...bodyLines].join("\n");
}

/** Creates a blank row with the requested number of columns. */
function buildEmptyRow(columnCount: number): string[] {
  return Array.from({ length: columnCount }, () => "");
}

/** Creates a preview renderer that skips paragraph wrapping inside cells. */
function createPreviewRenderer(markdown: string, config?: DraftlyConfig): PreviewRenderer {
  const plugins = (config?.plugins || []).filter((plugin) => plugin.name !== "paragraph");
  return new PreviewRenderer(markdown, plugins, config?.markdown || [], config?.theme || ThemeEnum.AUTO, true);
}

/** Removes a single top-level paragraph wrapper from preview HTML. */
function stripSingleParagraph(html: string): string {
  const trimmed = html.trim();
  const match = trimmed.match(/^<p\b[^>]*>([\s\S]*)<\/p>$/i);
  return match?.[1] || trimmed;
}

/** Renders one table cell through the preview pipeline. */
async function renderCellToHtml(text: string, config?: DraftlyConfig): Promise<string> {
  if (!text.trim()) {
    return "&nbsp;";
  }

  return stripSingleParagraph(await createPreviewRenderer(text, config).render());
}

/** Renders a parsed table into semantic preview HTML. */
async function renderTableToHtml(parsed: ParsedTable, config?: DraftlyConfig): Promise<string> {
  const normalized = normalizeParsedTable(parsed);
  let html = '<div class="cm-draftly-table-widget"><table class="cm-draftly-table cm-draftly-table-preview">';
  html += '<thead><tr class="cm-draftly-table-row cm-draftly-table-header-row">';

  for (let index = 0; index < normalized.headers.length; index++) {
    const alignment = normalized.alignments[index] || "left";
    const content = await renderCellToHtml(normalized.headers[index] || "", config);
    html += `<th class="cm-draftly-table-cell cm-draftly-table-th${
      alignment === "center"
        ? " cm-draftly-table-cell-center"
        : alignment === "right"
          ? " cm-draftly-table-cell-right"
          : ""
    }${index === normalized.headers.length - 1 ? " cm-draftly-table-cell-last" : ""}">${content}</th>`;
  }

  html += "</tr></thead><tbody>";

  for (let rowIndex = 0; rowIndex < normalized.rows.length; rowIndex++) {
    const row = normalized.rows[rowIndex] || [];
    html += `<tr class="cm-draftly-table-row cm-draftly-table-body-row${
      rowIndex % 2 === 1 ? " cm-draftly-table-row-even" : ""
    }${rowIndex === normalized.rows.length - 1 ? " cm-draftly-table-row-last" : ""}">`;

    for (let index = 0; index < normalized.headers.length; index++) {
      const alignment = normalized.alignments[index] || "left";
      const content = await renderCellToHtml(row[index] || "", config);
      html += `<td class="cm-draftly-table-cell${
        alignment === "center"
          ? " cm-draftly-table-cell-center"
          : alignment === "right"
            ? " cm-draftly-table-cell-right"
            : ""
      }${index === normalized.headers.length - 1 ? " cm-draftly-table-cell-last" : ""}">${content}</td>`;
    }

    html += "</tr>";
  }

  html += "</tbody></table></div>";
  return html;
}

/** Finds the visible content bounds inside a raw table cell span. */
function getVisibleBounds(rawCellText: string): { startOffset: number; endOffset: number } {
  const leading = rawCellText.length - rawCellText.trimStart().length;
  const trailing = rawCellText.length - rawCellText.trimEnd().length;
  const trimmedLength = rawCellText.trim().length;

  if (trimmedLength === 0) {
    const placeholderOffset = Math.min(Math.floor(rawCellText.length / 2), Math.max(rawCellText.length - 1, 0));
    return {
      startOffset: placeholderOffset,
      endOffset: Math.min(placeholderOffset + 1, rawCellText.length),
    };
  }

  return {
    startOffset: leading,
    endOffset: rawCellText.length - trailing,
  };
}

/** Returns whether every cell in a body row is empty. */
function isBodyRowEmpty(row: TableCellInfo[]): boolean {
  return row.every((cell) => normalizeCellContent(cell.rawText) === "");
}

/** Converts the live editor table model into a serializable table structure. */
function buildTableFromInfo(tableInfo: TableInfo): ParsedTable {
  return {
    headers: tableInfo.headerCells.map((cell) => normalizeCellContent(cell.rawText)),
    alignments: [...tableInfo.alignments],
    rows: tableInfo.bodyCells.map((row) => row.map((cell) => normalizeCellContent(cell.rawText))),
  };
}

/** Maps a logical row index to its physical line index in formatted markdown. */
function getRowLineIndex(rowIndex: number): number {
  return rowIndex === 0 ? 0 : rowIndex + 1;
}

/** Resolves the caret anchor for a cell inside normalized table markdown. */
function getCellAnchorInFormattedTable(
  formattedTable: string,
  rowIndex: number,
  columnIndex: number,
  offset = 0
): number {
  const lines = formattedTable.split("\n");
  const lineIndex = getRowLineIndex(rowIndex);
  const lineText = lines[lineIndex] || "";
  const pipes = getPipePositions(lineText);

  if (pipes.length < columnIndex + 2) {
    return formattedTable.length;
  }

  const rawFrom = pipes[columnIndex]! + 1;
  const rawTo = pipes[columnIndex + 1]!;
  const visible = getVisibleBounds(lineText.slice(rawFrom, rawTo));
  const lineOffset = lines.slice(0, lineIndex).reduce((sum, line) => sum + line.length + 1, 0);
  return (
    lineOffset +
    Math.min(rawFrom + visible.startOffset + offset, rawFrom + Math.max(visible.endOffset - 1, visible.startOffset))
  );
}

/** Wraps a table replacement with the required blank spacer lines. */
function createTableInsert(state: EditorState, from: number, to: number, tableMarkdown: string) {
  let insert = tableMarkdown;
  let prefixLength = 0;

  const startLine = state.doc.lineAt(from);
  if (startLine.number === 1 || state.doc.line(startLine.number - 1).text.trim() !== "") {
    insert = "\n" + insert;
    prefixLength = 1;
  }

  const endLine = state.doc.lineAt(Math.max(from, to));
  if (endLine.number === state.doc.lines || state.doc.line(endLine.number + 1).text.trim() !== "") {
    insert += "\n";
  }

  return { from, to, insert, prefixLength };
}

/** Builds a live table model from the current editor document. */
function readTableInfo(state: EditorState, nodeFrom: number, nodeTo: number): TableInfo | null {
  const startLine = state.doc.lineAt(nodeFrom);
  const endLine = state.doc.lineAt(nodeTo);
  const delimiterLineNumber = startLine.number + 1;
  if (delimiterLineNumber > endLine.number) {
    return null;
  }

  const delimiterLine = state.doc.line(delimiterLineNumber);
  const alignments = parseDelimiterAlignments(delimiterLine.text);
  if (!alignments) {
    return null;
  }

  let effectiveEndLineNumber = delimiterLineNumber;
  for (let lineNumber = delimiterLineNumber + 1; lineNumber <= endLine.number; lineNumber++) {
    const line = state.doc.line(lineNumber);
    if (!isTableRowLine(line.text)) {
      break;
    }
    effectiveEndLineNumber = lineNumber;
  }

  const cellsByRow: TableCellInfo[][] = [];
  for (let lineNumber = startLine.number; lineNumber <= effectiveEndLineNumber; lineNumber++) {
    if (lineNumber === delimiterLineNumber) {
      continue;
    }

    const line = state.doc.line(lineNumber);
    const pipes = getPipePositions(line.text);
    if (pipes.length < 2) {
      return null;
    }

    const isHeader = lineNumber === startLine.number;
    const rowIndex = isHeader ? 0 : cellsByRow.length;
    const cells: TableCellInfo[] = [];

    for (let columnIndex = 0; columnIndex < pipes.length - 1; columnIndex++) {
      const from = line.from + pipes[columnIndex]! + 1;
      const to = line.from + pipes[columnIndex + 1]!;
      const rawText = line.text.slice(pipes[columnIndex]! + 1, pipes[columnIndex + 1]);
      const visible = getVisibleBounds(rawText);

      cells.push({
        rowKind: isHeader ? "header" : "body",
        rowIndex,
        columnIndex,
        from,
        to,
        contentFrom: from + visible.startOffset,
        contentTo: from + visible.endOffset,
        lineFrom: line.from,
        lineNumber,
        rawText,
      });
    }

    cellsByRow.push(cells);
  }

  if (cellsByRow.length === 0) {
    return null;
  }

  return {
    from: startLine.from,
    to: state.doc.line(effectiveEndLineNumber).to,
    startLineNumber: startLine.number,
    delimiterLineNumber,
    endLineNumber: effectiveEndLineNumber,
    columnCount: cellsByRow[0]!.length,
    alignments: Array.from({ length: cellsByRow[0]!.length }, (_, index) => alignments[index] || "left"),
    cellsByRow,
    headerCells: cellsByRow[0]!,
    bodyCells: cellsByRow.slice(1),
  };
}

/** Finds the table model that contains the given document position. */
function getTableInfoAtPosition(state: EditorState, position: number): TableInfo | null {
  let resolved: TableInfo | null = null;

  syntaxTree(state).iterate({
    enter: (node) => {
      if (resolved || node.name !== "Table") {
        return;
      }

      const info = readTableInfo(state, node.from, node.to);
      if (info && position >= info.from && position <= info.to) {
        resolved = info;
      }
    },
  });

  return resolved;
}

/** Returns the table cell containing the given cursor position. */
function findCellAtPosition(tableInfo: TableInfo, position: number): TableCellInfo | null {
  for (const row of tableInfo.cellsByRow) {
    for (const cell of row) {
      if (position >= cell.from && position <= cell.to) {
        return cell;
      }
    }
  }

  for (const row of tableInfo.cellsByRow) {
    for (const cell of row) {
      if (position >= cell.from - 1 && position <= cell.to + 1) {
        return cell;
      }
    }
  }

  let nearestCell: TableCellInfo | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const row of tableInfo.cellsByRow) {
    for (const cell of row) {
      const distance = Math.min(Math.abs(position - cell.from), Math.abs(position - cell.to));
      if (distance < nearestDistance) {
        nearestCell = cell;
        nearestDistance = distance;
      }
    }
  }

  return nearestCell;
}

/** Clamps a document position into the editable content span of a cell. */
function clampCellPosition(cell: TableCellInfo, position: number): number {
  const cellEnd = Math.max(cell.contentFrom, cell.contentTo);
  return Math.max(cell.contentFrom, Math.min(position, cellEnd));
}

/** Collects all `<br />` token ranges from the current table. */
function collectBreakRanges(tableInfo: TableInfo): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];

  for (const row of tableInfo.cellsByRow) {
    for (const cell of row) {
      let match: RegExpExecArray | null;
      const regex = new RegExp(BREAK_TAG_REGEX);
      while ((match = regex.exec(cell.rawText)) !== null) {
        ranges.push({
          from: cell.from + match.index,
          to: cell.from + match.index + match[0].length,
        });
      }
    }
  }

  return ranges;
}

const lineDecorations = {
  header: Decoration.line({ class: "cm-draftly-table-row cm-draftly-table-header-row" }),
  delimiter: Decoration.line({ class: "cm-draftly-table-row cm-draftly-table-delimiter-row" }),
  body: Decoration.line({ class: "cm-draftly-table-row cm-draftly-table-body-row" }),
  even: Decoration.line({ class: "cm-draftly-table-row cm-draftly-table-body-row cm-draftly-table-row-even" }),
  last: Decoration.line({ class: "cm-draftly-table-row-last" }),
};

const cellDecorations = {
  "th-left": Decoration.mark({ class: "cm-draftly-table-cell cm-draftly-table-th" }),
  "th-center": Decoration.mark({ class: "cm-draftly-table-cell cm-draftly-table-th cm-draftly-table-cell-center" }),
  "th-right": Decoration.mark({ class: "cm-draftly-table-cell cm-draftly-table-th cm-draftly-table-cell-right" }),
  "th-left-last": Decoration.mark({ class: "cm-draftly-table-cell cm-draftly-table-th cm-draftly-table-cell-last" }),
  "th-center-last": Decoration.mark({
    class: "cm-draftly-table-cell cm-draftly-table-th cm-draftly-table-cell-center cm-draftly-table-cell-last",
  }),
  "th-right-last": Decoration.mark({
    class: "cm-draftly-table-cell cm-draftly-table-th cm-draftly-table-cell-right cm-draftly-table-cell-last",
  }),
  "td-left": Decoration.mark({ class: "cm-draftly-table-cell" }),
  "td-center": Decoration.mark({ class: "cm-draftly-table-cell cm-draftly-table-cell-center" }),
  "td-right": Decoration.mark({ class: "cm-draftly-table-cell cm-draftly-table-cell-right" }),
  "td-left-last": Decoration.mark({ class: "cm-draftly-table-cell cm-draftly-table-cell-last" }),
  "td-center-last": Decoration.mark({
    class: "cm-draftly-table-cell cm-draftly-table-cell-center cm-draftly-table-cell-last",
  }),
  "td-right-last": Decoration.mark({
    class: "cm-draftly-table-cell cm-draftly-table-cell-right cm-draftly-table-cell-last",
  }),
} as const;

type CellDecorationKey = keyof typeof cellDecorations;

function getCellDecoration(isHeader: boolean, alignment: Alignment, isLastCell: boolean): Decoration {
  const key = `${isHeader ? "th" : "td"}-${alignment}${isLastCell ? "-last" : ""}` as CellDecorationKey;
  return cellDecorations[key];
}

export class TablePlugin extends DecorationPlugin {
  readonly name = "table";
  readonly version = "2.0.0";
  override decorationPriority = 20;
  override readonly requiredNodes = ["Table", "TableHeader", "TableDelimiter", "TableRow", "TableCell"] as const;

  private draftlyConfig: DraftlyConfig | undefined;

  // Re-entrancy locks, not caches -- see artifacts/architecture/plugin-table.md. Each
  // holds the view a deferred repair is queued for, and each queued microtask bails if
  // the field no longer names its view. Removing them causes infinite dispatch loops.
  //
  // They are also the library's most concrete leak: a view destroyed while its microtask
  // is queued would be retained here for the lifetime of the page, since this plugin is
  // a module-level singleton. onViewDestroy is what closes that.
  private pendingNormalizationView: EditorView | null = null;
  private pendingPaddingView: EditorView | null = null;
  private pendingSelectionRepairView: EditorView | null = null;

  /**
   * Set of views CodeMirror has torn down.
   *
   * `EditorView` exposes no public "destroyed" flag, so a queued microtask cannot ask the
   * view whether it is still alive. Weak, so an entry disappears with the view rather
   * than becoming its own leak.
   */
  private readonly destroyedViews = new WeakSet<EditorView>();

  /** Stores the editor config for preview rendering and shared behavior. */
  override onRegister(context: PluginContext): void {
    super.onRegister(context);
    this.draftlyConfig = context.config;
  }

  /** Exposes the plugin theme used for editor and preview styling. */
  override get theme() {
    return theme;
  }

  /** Enables GFM table parsing for the editor and preview renderer. */
  override getMarkdownConfig(): MarkdownConfig {
    return Table;
  }

  /** Registers block wrappers and atomic ranges for the table UI. */
  override getExtensions(): Extension[] {
    return [
      Prec.highest(keymap.of(this.buildTableKeymap())),
      EditorView.blockWrappers.of((view) => this.computeBlockWrappers(view)),
      EditorView.atomicRanges.of((view) => this.computeAtomicRanges(view)),
      EditorView.domEventHandlers({
        keydown: (event, view) => this.handleDomKeydown(view, event),
      }),
    ];
  }

  /** Provides the table-specific keyboard shortcuts and navigation. */
  override getKeymap(): KeyBinding[] {
    return [];
  }

  /** Builds the high-priority key bindings used inside tables. */
  private buildTableKeymap(): KeyBinding[] {
    return [
      { key: "Mod-Shift-t", run: (view) => this.insertTable(view), preventDefault: true },
      { key: "Mod-Alt-ArrowDown", run: (view) => this.addRow(view), preventDefault: true },
      { key: "Mod-Alt-ArrowRight", run: (view) => this.addColumn(view), preventDefault: true },
      { key: "Mod-Alt-Backspace", run: (view) => this.removeRow(view), preventDefault: true },
      { key: "Mod-Alt-Delete", run: (view) => this.removeColumn(view), preventDefault: true },
      { key: "Tab", run: (view) => this.handleTab(view, false) },
      { key: "Shift-Tab", run: (view) => this.handleTab(view, true) },
      { key: "ArrowLeft", run: (view) => this.handleArrowHorizontal(view, false) },
      { key: "ArrowRight", run: (view) => this.handleArrowHorizontal(view, true) },
      { key: "ArrowUp", run: (view) => this.handleArrowVertical(view, false) },
      { key: "ArrowDown", run: (view) => this.handleArrowVertical(view, true) },
      { key: "Enter", run: (view) => this.handleEnter(view) },
      { key: "Shift-Enter", run: (view) => this.insertBreakTag(view), preventDefault: true },
      { key: "Backspace", run: (view) => this.handleBreakDeletion(view, false) },
      { key: "Delete", run: (view) => this.handleBreakDeletion(view, true) },
    ];
  }

  /** Schedules an initial normalization pass once the view is ready. */
  override onViewReady(view: EditorView): void {
    this.scheduleNormalization(view);
  }

  /** Re-schedules normalization after user-driven document changes. */
  /**
   * Releases everything scoped to a destroyed view.
   *
   * Clearing the pending fields drops the strong reference; recording the view as
   * destroyed makes any microtask that is already queued bail rather than dispatching
   * into a dead editor.
   */
  override onViewDestroy(view: EditorView): void {
    this.destroyedViews.add(view);

    if (this.pendingNormalizationView === view) this.pendingNormalizationView = null;
    if (this.pendingPaddingView === view) this.pendingPaddingView = null;
    if (this.pendingSelectionRepairView === view) this.pendingSelectionRepairView = null;
  }

  override onViewUpdate(update: import("@codemirror/view").ViewUpdate): void {
    if (update.docChanged && !update.transactions.some((transaction) => transaction.annotation(normalizeAnnotation))) {
      this.schedulePadding(update.view);
    }

    if (
      update.selectionSet &&
      !update.transactions.some((transaction) => transaction.annotation(repairSelectionAnnotation))
    ) {
      this.scheduleSelectionRepair(update.view);
    }
  }

  /** Intercepts table-specific DOM key handling before browser defaults run. */
  private handleDomKeydown(view: EditorView, event: KeyboardEvent): boolean {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.metaKey || event.ctrlKey) {
      return false;
    }

    let handled = false;

    if (event.key === "Tab") {
      handled = this.handleTab(view, event.shiftKey);
    } else if (event.key === "Enter" && event.shiftKey) {
      handled = this.insertBreakTag(view);
    } else if (event.key === "Enter") {
      handled = this.handleEnter(view);
    } else if (event.key === "ArrowLeft") {
      handled = this.handleArrowHorizontal(view, false);
    } else if (event.key === "ArrowRight") {
      handled = this.handleArrowHorizontal(view, true);
    } else if (event.key === "ArrowUp") {
      handled = this.handleArrowVertical(view, false);
    } else if (event.key === "ArrowDown") {
      handled = this.handleArrowVertical(view, true);
    } else if (event.key === "Backspace") {
      handled = this.handleBreakDeletion(view, false);
    } else if (event.key === "Delete") {
      handled = this.handleBreakDeletion(view, true);
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }

    return handled;
  }

  /**
   * Builds the visual table decorations for every parsed table block in the viewport.
   *
   * Scoped to `ctx.iterateVisible`, unlike `computeBlockWrappers` and
   * `computeAtomicRanges` below, which stay document-wide deliberately — they feed
   * CodeMirror facets rather than the decoration set, and a wrapper or atomic range that
   * disappears when a table scrolls out of view would break layout and cursor motion.
   * A `Table` node straddling the viewport edge is still entered in full, so a partly
   * visible table decorates correctly.
   */
  override buildDecorations(ctx: DecorationContext): void {
    const { view, decorations } = ctx;

    ctx.iterateVisible({
      enter: (node) => {
        if (node.name !== "Table") {
          return;
        }

        const tableInfo = readTableInfo(view.state, node.from, node.to);
        if (tableInfo) {
          this.decorateTable(view, decorations, tableInfo);
        }
      },
    });
  }

  /** Renders the full table node to semantic preview HTML. */
  override async renderToHTML(node: SyntaxNode, _children: string, ctx: PreviewContextLike): Promise<string | null> {
    if (node.name === "Table") {
      const content = ctx.sliceDoc(node.from, node.to);
      const { tableMarkdown, trailingMarkdown } = splitTableAndTrailingMarkdown(content);
      const parsed = parseTableMarkdown(tableMarkdown);
      if (!parsed) {
        return null;
      }

      const tableHtml = await renderTableToHtml(parsed, this.draftlyConfig);
      if (!trailingMarkdown.trim()) {
        return tableHtml;
      }

      return tableHtml + (await createPreviewRenderer(trailingMarkdown, this.draftlyConfig).render());
    }

    if (TABLE_SUB_NODE_NAMES.has(node.name)) {
      return "";
    }

    return null;
  }

  /** Computes the block wrapper ranges used to group table lines. */
  private computeBlockWrappers(view: EditorView): RangeSet<BlockWrapper> {
    const wrappers: Range<BlockWrapper>[] = [];

    syntaxTree(view.state).iterate({
      enter: (node) => {
        if (node.name !== "Table") {
          return;
        }

        const tableInfo = readTableInfo(view.state, node.from, node.to);
        if (tableInfo) {
          wrappers.push(tableBlockWrapper.range(tableInfo.from, tableInfo.to));
        }
      },
    });

    return BlockWrapper.set(wrappers, true);
  }

  /** Computes atomic ranges for delimiters and inline break tags. */
  private computeAtomicRanges(view: EditorView): RangeSet<Decoration> {
    const ranges: Range<Decoration>[] = [];

    syntaxTree(view.state).iterate({
      enter: (node) => {
        if (node.name !== "Table") {
          return;
        }

        const tableInfo = readTableInfo(view.state, node.from, node.to);
        if (!tableInfo) {
          return;
        }

        for (let lineNumber = tableInfo.startLineNumber; lineNumber <= tableInfo.endLineNumber; lineNumber++) {
          const line = view.state.doc.line(lineNumber);
          if (lineNumber === tableInfo.delimiterLineNumber) {
            ranges.push(delimiterReplace.range(line.from, line.to));
            continue;
          }

          const pipes = getPipePositions(line.text);
          for (const pipe of pipes) {
            ranges.push(pipeReplace.range(line.from + pipe, line.from + pipe + 1));
          }

          for (let columnIndex = 0; columnIndex < pipes.length - 1; columnIndex++) {
            const rawFrom = pipes[columnIndex]! + 1;
            const rawTo = pipes[columnIndex + 1]!;
            const rawText = line.text.slice(rawFrom, rawTo);
            const visible = getVisibleBounds(rawText);

            if (visible.startOffset > 0) {
              ranges.push(pipeReplace.range(line.from + rawFrom, line.from + rawFrom + visible.startOffset));
            }
            if (visible.endOffset < rawText.length) {
              ranges.push(pipeReplace.range(line.from + rawFrom + visible.endOffset, line.from + rawTo));
            }

            let match: RegExpExecArray | null;
            const regex = new RegExp(BREAK_TAG_REGEX);
            while ((match = regex.exec(rawText)) !== null) {
              ranges.push(
                Decoration.replace({ widget: new TableBreakWidget() }).range(
                  line.from + rawFrom + match.index,
                  line.from + rawFrom + match.index + match[0].length
                )
              );
            }
          }
        }
      },
    });

    return RangeSet.of(ranges, true);
  }

  /** Applies row, cell, and control decorations for a single table. */
  private decorateTable(view: EditorView, decorations: Range<Decoration>[], tableInfo: TableInfo): void {
    for (let lineNumber = tableInfo.startLineNumber; lineNumber <= tableInfo.endLineNumber; lineNumber++) {
      const line = view.state.doc.line(lineNumber);
      const isHeader = lineNumber === tableInfo.startLineNumber;
      const isDelimiter = lineNumber === tableInfo.delimiterLineNumber;
      const isLastBody = !isHeader && !isDelimiter && lineNumber === tableInfo.endLineNumber;
      const bodyIndex = isHeader || isDelimiter ? -1 : lineNumber - tableInfo.delimiterLineNumber - 1;

      if (isHeader) {
        decorations.push(lineDecorations.header.range(line.from));
      } else if (isDelimiter) {
        decorations.push(lineDecorations.delimiter.range(line.from));
      } else if (bodyIndex % 2 === 1) {
        decorations.push(lineDecorations.even.range(line.from));
      } else {
        decorations.push(lineDecorations.body.range(line.from));
      }

      if (isLastBody) {
        decorations.push(lineDecorations.last.range(line.from));
      }

      if (isDelimiter) {
        decorations.push(delimiterReplace.range(line.from, line.to));
        continue;
      }

      this.decorateLine(decorations, line.from, line.text, tableInfo.alignments, isHeader);
    }

    decorations.push(
      Decoration.widget({
        widget: new TableControlsWidget(
          (view) => {
            const liveTable = getTableInfoAtPosition(view.state, tableInfo.from);
            if (liveTable) {
              this.appendRow(view, liveTable, liveTable.columnCount - 1);
            }
          },
          (view) => {
            const liveTable = getTableInfoAtPosition(view.state, tableInfo.from);
            if (liveTable) {
              this.appendColumn(view, liveTable);
            }
          }
        ),
        side: 1,
      }).range(tableInfo.to)
    );
  }

  /** Applies the visual cell decorations for a single table row line. */
  private decorateLine(
    decorations: Range<Decoration>[],
    lineFrom: number,
    lineText: string,
    alignments: Alignment[],
    isHeader: boolean
  ): void {
    const pipes = getPipePositions(lineText);
    if (pipes.length < 2) {
      return;
    }

    for (const pipe of pipes) {
      decorations.push(pipeReplace.range(lineFrom + pipe, lineFrom + pipe + 1));
    }

    for (let columnIndex = 0; columnIndex < pipes.length - 1; columnIndex++) {
      const rawFrom = pipes[columnIndex]! + 1;
      const rawTo = pipes[columnIndex + 1]!;
      const rawText = lineText.slice(rawFrom, rawTo);
      const visible = getVisibleBounds(rawText);
      const absoluteFrom = lineFrom + rawFrom;
      const absoluteTo = lineFrom + rawTo;

      if (visible.startOffset > 0) {
        decorations.push(pipeReplace.range(absoluteFrom, absoluteFrom + visible.startOffset));
      }
      if (visible.endOffset < rawText.length) {
        decorations.push(pipeReplace.range(absoluteFrom + visible.endOffset, absoluteTo));
      }

      decorations.push(
        getCellDecoration(isHeader, alignments[columnIndex] || "left", columnIndex === pipes.length - 2).range(
          absoluteFrom,
          absoluteTo
        )
      );

      let match: RegExpExecArray | null;
      const regex = new RegExp(BREAK_TAG_REGEX);
      while ((match = regex.exec(rawText)) !== null) {
        decorations.push(
          Decoration.replace({ widget: new TableBreakWidget() }).range(
            absoluteFrom + match.index,
            absoluteFrom + match.index + match[0].length
          )
        );
      }
    }
  }

  /** Normalizes every parsed table block back into canonical markdown. */
  private normalizeTables(view: EditorView): void {
    const changes: Array<{ from: number; to: number; insert: string }> = [];

    syntaxTree(view.state).iterate({
      enter: (node) => {
        if (node.name !== "Table") {
          return;
        }

        const content = view.state.sliceDoc(node.from, node.to);
        const { tableMarkdown } = splitTableAndTrailingMarkdown(content);
        const parsed = parseTableMarkdown(tableMarkdown);
        if (!parsed) {
          return;
        }

        const formatted = formatTableMarkdown(parsed);
        const change = createTableInsert(view.state, node.from, node.from + tableMarkdown.length, formatted);
        if (
          change.insert !== tableMarkdown ||
          change.from !== node.from ||
          change.to !== node.from + tableMarkdown.length
        ) {
          changes.push({
            from: change.from,
            to: change.to,
            insert: change.insert,
          });
        }
      },
    });

    if (changes.length > 0) {
      view.dispatch({
        changes: changes.sort((left, right) => right.from - left.from),
        annotations: normalizeAnnotation.of(true),
      });
    }
  }

  /** Defers table normalization until the current update cycle is finished. */
  private scheduleNormalization(view: EditorView): void {
    if (this.pendingNormalizationView === view) {
      return;
    }

    this.pendingNormalizationView = view;
    queueMicrotask(() => {
      if (this.pendingNormalizationView !== view) {
        return;
      }

      this.pendingNormalizationView = null;

      // The view may have been torn down between scheduling and now; dispatching into
      // a destroyed editor throws.
      if (this.destroyedViews.has(view)) {
        return;
      }

      this.normalizeTables(view);
    });
  }

  /** Adds missing spacer lines above and below tables after edits. */
  private ensureTablePadding(view: EditorView): void {
    const changes: Array<{ from: number; to: number; insert: string }> = [];

    syntaxTree(view.state).iterate({
      enter: (node) => {
        if (node.name !== "Table") {
          return;
        }

        const tableInfo = readTableInfo(view.state, node.from, node.to);
        if (!tableInfo) {
          return;
        }

        const startLine = view.state.doc.lineAt(tableInfo.from);
        if (startLine.number === 1) {
          changes.push({ from: startLine.from, to: startLine.from, insert: "\n" });
        } else {
          const previousLine = view.state.doc.line(startLine.number - 1);
          if (previousLine.text.trim() !== "") {
            changes.push({ from: startLine.from, to: startLine.from, insert: "\n" });
          }
        }

        const endLine = view.state.doc.lineAt(tableInfo.to);
        if (endLine.number === view.state.doc.lines) {
          changes.push({ from: endLine.to, to: endLine.to, insert: "\n" });
        } else {
          const nextLine = view.state.doc.line(endLine.number + 1);
          if (nextLine.text.trim() !== "") {
            changes.push({ from: endLine.to, to: endLine.to, insert: "\n" });
          }
        }
      },
    });

    if (changes.length > 0) {
      view.dispatch({
        changes: changes.sort((left, right) => right.from - left.from),
        annotations: normalizeAnnotation.of(true),
      });
    }
  }

  /** Schedules a padding-only pass after the current update cycle finishes. */
  private schedulePadding(view: EditorView): void {
    if (this.pendingPaddingView === view) {
      return;
    }

    this.pendingPaddingView = view;
    queueMicrotask(() => {
      if (this.pendingPaddingView !== view) {
        return;
      }

      this.pendingPaddingView = null;

      // The view may have been torn down between scheduling and now; dispatching into
      // a destroyed editor throws.
      if (this.destroyedViews.has(view)) {
        return;
      }

      this.ensureTablePadding(view);
    });
  }

  /** Repairs carets that land in hidden table markup instead of editable cell content. */
  private ensureTableSelection(view: EditorView): void {
    const selection = view.state.selection.main;
    if (!selection.empty) {
      return;
    }

    const tableInfo = getTableInfoAtPosition(view.state, selection.head);
    if (!tableInfo) {
      return;
    }

    const cell = findCellAtPosition(tableInfo, selection.head);
    if (!cell) {
      return;
    }

    const anchor = clampCellPosition(cell, selection.head);
    if (anchor === selection.head) {
      return;
    }

    view.dispatch({
      selection: { anchor },
      annotations: repairSelectionAnnotation.of(true),
      scrollIntoView: true,
    });
  }

  /** Schedules table selection repair after the current update finishes. */
  private scheduleSelectionRepair(view: EditorView): void {
    if (this.pendingSelectionRepairView === view) {
      return;
    }

    this.pendingSelectionRepairView = view;
    queueMicrotask(() => {
      if (this.pendingSelectionRepairView !== view) {
        return;
      }

      this.pendingSelectionRepairView = null;

      // The view may have been torn down between scheduling and now; dispatching into
      // a destroyed editor throws.
      if (this.destroyedViews.has(view)) {
        return;
      }

      this.ensureTableSelection(view);
    });
  }

  /** Rewrites a table block and restores the caret to a target cell position. */
  private replaceTable(
    view: EditorView,
    tableInfo: TableInfo,
    parsed: ParsedTable,
    targetRowIndex: number,
    targetColumnIndex: number,
    offset = 0
  ): void {
    const formatted = formatTableMarkdown(parsed);
    const change = createTableInsert(view.state, tableInfo.from, tableInfo.to, formatted);
    const selection =
      change.from +
      change.prefixLength +
      getCellAnchorInFormattedTable(
        formatted,
        Math.max(0, targetRowIndex),
        Math.max(0, Math.min(targetColumnIndex, Math.max(parsed.headers.length - 1, 0))),
        Math.max(0, offset)
      );

    view.dispatch({
      changes: { from: change.from, to: change.to, insert: change.insert },
      selection: { anchor: selection },
    });
  }

  /** Inserts an empty body row below the given logical row index. */
  private insertRowBelow(view: EditorView, tableInfo: TableInfo, afterRowIndex: number, targetColumn: number): void {
    const parsed = normalizeParsedTable(buildTableFromInfo(tableInfo));
    const insertBodyIndex = Math.max(0, Math.min(afterRowIndex, parsed.rows.length));
    parsed.rows.splice(insertBodyIndex, 0, buildEmptyRow(tableInfo.columnCount));
    this.replaceTable(view, tableInfo, parsed, insertBodyIndex + 1, targetColumn);
  }

  /** Inserts a starter table near the current cursor line. */
  private insertTable(view: EditorView): boolean {
    const { state } = view;
    const cursor = state.selection.main.head;
    const line = state.doc.lineAt(cursor);
    const insertAt = line.text.trim() ? line.to : line.from;
    const formatted = formatTableMarkdown(TABLE_TEMPLATE);
    const change = createTableInsert(state, insertAt, insertAt, formatted);
    const selection = change.from + change.prefixLength + getCellAnchorInFormattedTable(formatted, 0, 0);

    view.dispatch({
      changes: { from: change.from, to: change.to, insert: change.insert },
      selection: { anchor: selection },
    });

    return true;
  }

  /** Adds a new empty body row to the active table. */
  private addRow(view: EditorView): boolean {
    const tableInfo = this.getTableAtCursor(view);
    if (!tableInfo) {
      return false;
    }

    const cell = this.getCurrentCell(view, tableInfo);
    this.appendRow(view, tableInfo, cell?.columnIndex || 0);
    return true;
  }

  /** Appends a row and keeps the caret in the requested column. */
  private appendRow(view: EditorView, tableInfo: TableInfo, targetColumn: number): void {
    this.insertRowBelow(view, tableInfo, tableInfo.bodyCells.length, targetColumn);
  }

  /** Inserts a new column after the current column. */
  private addColumn(view: EditorView): boolean {
    const tableInfo = this.getTableAtCursor(view);
    if (!tableInfo) {
      return false;
    }

    const cell = this.getCurrentCell(view, tableInfo);
    const insertAfter = cell?.columnIndex ?? tableInfo.columnCount - 1;
    const parsed = normalizeParsedTable(buildTableFromInfo(tableInfo));

    parsed.headers.splice(insertAfter + 1, 0, "");
    parsed.alignments.splice(insertAfter + 1, 0, "left");
    for (const row of parsed.rows) {
      row.splice(insertAfter + 1, 0, "");
    }

    this.replaceTable(view, tableInfo, parsed, cell?.rowIndex || 0, insertAfter + 1);

    return true;
  }

  /** Appends a new column at the far right of the table. */
  private appendColumn(view: EditorView, tableInfo: TableInfo): void {
    const parsed = normalizeParsedTable(buildTableFromInfo(tableInfo));
    parsed.headers.push("");
    parsed.alignments.push("left");
    for (const row of parsed.rows) {
      row.push("");
    }

    this.replaceTable(view, tableInfo, parsed, 0, parsed.headers.length - 1);
  }

  /** Removes the current body row or clears the last remaining row. */
  private removeRow(view: EditorView): boolean {
    const tableInfo = this.getTableAtCursor(view);
    if (!tableInfo) {
      return false;
    }

    const cell = this.getCurrentCell(view, tableInfo);
    if (!cell || cell.rowKind !== "body") {
      return false;
    }

    const parsed = normalizeParsedTable(buildTableFromInfo(tableInfo));
    const bodyIndex = cell.rowIndex - 1;
    if (bodyIndex < 0 || bodyIndex >= parsed.rows.length) {
      return false;
    }

    if (parsed.rows.length === 1) {
      parsed.rows[0] = buildEmptyRow(tableInfo.columnCount);
    } else {
      parsed.rows.splice(bodyIndex, 1);
    }

    const nextRowIndex = Math.max(1, Math.min(cell.rowIndex, parsed.rows.length));
    this.replaceTable(view, tableInfo, parsed, nextRowIndex, Math.min(cell.columnIndex, tableInfo.columnCount - 1));

    return true;
  }

  /** Removes the current column when the table has more than one column. */
  private removeColumn(view: EditorView): boolean {
    const tableInfo = this.getTableAtCursor(view);
    if (!tableInfo || tableInfo.columnCount <= 1) {
      return false;
    }

    const cell = this.getCurrentCell(view, tableInfo);
    const removeAt = cell?.columnIndex ?? tableInfo.columnCount - 1;
    const parsed = normalizeParsedTable(buildTableFromInfo(tableInfo));

    parsed.headers.splice(removeAt, 1);
    parsed.alignments.splice(removeAt, 1);
    for (const row of parsed.rows) {
      row.splice(removeAt, 1);
    }

    this.replaceTable(view, tableInfo, parsed, cell?.rowIndex || 0, Math.min(removeAt, parsed.headers.length - 1));

    return true;
  }

  /** Moves to the next or previous logical cell with Tab navigation. */
  private handleTab(view: EditorView, backwards: boolean): boolean {
    const tableInfo = this.getTableAtCursor(view);
    if (!tableInfo) {
      return false;
    }

    const cell = this.getCurrentCell(view, tableInfo);
    if (!cell) {
      return false;
    }

    const cells = tableInfo.cellsByRow.flat();
    const currentIndex = cells.findIndex((candidate) => candidate.from === cell.from && candidate.to === cell.to);
    if (currentIndex < 0) {
      return false;
    }

    const nextIndex = backwards ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0) {
      return true;
    }
    if (nextIndex >= cells.length) {
      this.appendRow(view, tableInfo, 0);
      return true;
    }

    this.moveSelectionToCell(view, cells[nextIndex]!);
    return true;
  }

  /** Moves horizontally between adjacent cells when the caret hits an edge. */
  private handleArrowHorizontal(view: EditorView, forward: boolean): boolean {
    const tableInfo = this.getTableAtCursor(view);
    if (!tableInfo) {
      return false;
    }

    const cell = this.getCurrentCell(view, tableInfo);
    if (!cell) {
      return false;
    }

    const cursor = view.state.selection.main.head;
    const rightEdge = Math.max(cell.contentFrom, cell.contentTo);
    if (forward && cursor < rightEdge) {
      return false;
    }
    if (!forward && cursor > cell.contentFrom) {
      return false;
    }

    const row = tableInfo.cellsByRow[cell.rowIndex] || [];
    const nextCell = row[cell.columnIndex + (forward ? 1 : -1)];
    if (!nextCell) {
      return false;
    }

    this.moveSelectionToCell(view, nextCell);
    return true;
  }

  /** Moves vertically between rows while keeping the current column. */
  private handleArrowVertical(view: EditorView, forward: boolean): boolean {
    const tableInfo = this.getTableAtCursor(view);
    if (!tableInfo) {
      return false;
    }

    const cell = this.getCurrentCell(view, tableInfo);
    if (!cell) {
      return false;
    }

    const nextRow = tableInfo.cellsByRow[cell.rowIndex + (forward ? 1 : -1)];
    if (!nextRow) {
      return false;
    }

    const nextCell = nextRow[cell.columnIndex];
    if (!nextCell) {
      return false;
    }

    this.moveSelectionToCell(view, nextCell);
    return true;
  }

  /** Advances downward on Enter and manages the trailing empty row behavior. */
  private handleEnter(view: EditorView): boolean {
    const tableInfo = this.getTableAtCursor(view);
    if (!tableInfo) {
      return false;
    }

    const cell = this.getCurrentCell(view, tableInfo);
    if (!cell) {
      return false;
    }

    if (cell.rowKind === "body") {
      const currentRow = tableInfo.bodyCells[cell.rowIndex - 1];
      if (currentRow && isBodyRowEmpty(currentRow)) {
        const parsed = normalizeParsedTable(buildTableFromInfo(tableInfo));
        parsed.rows.splice(cell.rowIndex - 1, 1);
        const formatted = formatTableMarkdown(parsed);
        const change = createTableInsert(view.state, tableInfo.from, tableInfo.to, formatted);
        const anchor = Math.min(change.from + change.insert.length, view.state.doc.length + change.insert.length);

        view.dispatch({
          changes: { from: change.from, to: change.to, insert: change.insert },
          selection: { anchor },
        });
        return true;
      }
    }

    if (cell.rowKind === "body" && cell.rowIndex === tableInfo.cellsByRow.length - 1) {
      const parsed = normalizeParsedTable(buildTableFromInfo(tableInfo));
      parsed.rows.push(buildEmptyRow(tableInfo.columnCount));
      this.replaceTable(view, tableInfo, parsed, parsed.rows.length, cell.columnIndex);
      return true;
    }

    this.insertRowBelow(view, tableInfo, cell.rowIndex, cell.columnIndex);
    return true;
  }

  /** Inserts a canonical `<br />` token inside the current table cell. */
  private insertBreakTag(view: EditorView): boolean {
    const tableInfo = this.getTableAtCursor(view);
    if (!tableInfo) {
      return false;
    }

    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: BREAK_TAG },
      selection: { anchor: selection.from + BREAK_TAG.length },
    });
    return true;
  }

  /** Deletes a whole `<br />` token when backspace or delete hits it. */
  private handleBreakDeletion(view: EditorView, forward: boolean): boolean {
    const tableInfo = this.getTableAtCursor(view);
    if (!tableInfo) {
      return false;
    }

    const selection = view.state.selection.main;
    const cursor = selection.head;

    for (const range of collectBreakRanges(tableInfo)) {
      const within = cursor > range.from && cursor < range.to;
      const matchesBackspace = !forward && cursor === range.to;
      const matchesDelete = forward && cursor === range.from;
      const overlapsSelection = !selection.empty && selection.from <= range.from && selection.to >= range.to;

      if (within || matchesBackspace || matchesDelete || overlapsSelection) {
        view.dispatch({
          changes: { from: range.from, to: range.to, insert: "" },
          selection: { anchor: range.from },
        });
        return true;
      }
    }

    return false;
  }

  /** Moves the current selection anchor into a target cell. */
  private moveSelectionToCell(view: EditorView, cell: TableCellInfo, offset = 0): void {
    const end = Math.max(cell.contentFrom, cell.contentTo);
    view.dispatch({
      selection: { anchor: Math.min(cell.contentFrom + offset, end) },
      scrollIntoView: true,
    });
  }

  /** Returns the table currently containing the editor cursor. */
  private getTableAtCursor(view: EditorView): TableInfo | null {
    return getTableInfoAtPosition(view.state, view.state.selection.main.head);
  }

  /** Returns the active cell under the current selection head. */
  private getCurrentCell(view: EditorView, tableInfo: TableInfo): TableCellInfo | null {
    return findCellAtPosition(tableInfo, view.state.selection.main.head);
  }
}

const theme = createTheme({
  default: {
    ".cm-draftly-table-wrapper, .cm-draftly-table-widget": {
      display: "table",
      width: "100%",
      borderCollapse: "separate",
      borderSpacing: "0",
      position: "relative",
      overflow: "visible",
      border: "1px solid var(--draftly-color-border)",
      borderRadius: "0.75rem",
      backgroundColor: "var(--draftly-color-surface)",

      "& .cm-draftly-table": {
        width: "100%",
        borderCollapse: "separate",
        borderSpacing: "0",
        tableLayout: "auto",
      },

      "& .cm-draftly-table-row": {
        display: "table-row !important",
      },

      "& .cm-draftly-table-header-row": {
        backgroundColor: "var(--draftly-surface-header)",
      },

      "& .cm-draftly-table-row-even": {
        backgroundColor: "var(--draftly-surface-stripe)",
      },

      "& .cm-draftly-table-delimiter-row": {
        display: "none !important",
      },

      "& .cm-draftly-table-cell": {
        display: "table-cell",
        minWidth: "4rem",
        minHeight: "2.5rem",
        height: "2.75rem",
        padding: "0.5rem 0.875rem",
        verticalAlign: "top",
        borderRight: "1px solid var(--draftly-color-border)",
        borderBottom: "1px solid var(--draftly-color-border)",
        whiteSpace: "normal",
        overflowWrap: "break-word",
        wordBreak: "normal",
        lineHeight: "1.6",
      },

      "& .cm-draftly-table-body-row": {
        minHeight: "2.75rem",
      },

      "& .cm-draftly-table-cell .cm-draftly-code-inline": {
        whiteSpace: "normal",
        overflowWrap: "anywhere",
      },

      "& .cm-draftly-table-th": {
        fontWeight: "600",
        borderBottomWidth: "2px",
      },

      "& .cm-draftly-table-cell-last": {
        borderRight: "none",
      },

      "& .cm-draftly-table-row-last .cm-draftly-table-cell": {
        borderBottom: "none",
      },

      "& .cm-draftly-table-cell-center": {
        textAlign: "center",
      },

      "& .cm-draftly-table-cell-right": {
        textAlign: "right",
      },

      "& .cm-draftly-table-break": {
        display: "inline",
      },

      "& .cm-draftly-table-controls-anchor": {
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
      },

      "& .cm-draftly-table-control": {
        position: "absolute",
        width: "1.75rem",
        height: "1.75rem",
        border: "1px solid var(--draftly-color-border)",
        borderRadius: "999px",
        backgroundColor: "var(--draftly-color-surface-raised)",
        color: "var(--draftly-color-text)",
        boxShadow: "var(--draftly-shadow-popover)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: "0",
        pointerEvents: "auto",
        transition: "opacity 120ms ease, transform 120ms ease, background-color 120ms ease",
      },

      "& .cm-draftly-table-control:hover": {
        backgroundColor: "var(--draftly-surface-hover)",
      },

      "& .cm-draftly-table-control-column": {
        top: "50%",
        right: "-0.95rem",
        transform: "translate(0.35rem, -50%)",
      },

      "& .cm-draftly-table-control-row": {
        left: "50%",
        bottom: "-0.95rem",
        transform: "translate(-50%, 0.35rem)",
      },

      "&:hover .cm-draftly-table-control, &:focus-within .cm-draftly-table-control": {
        opacity: "1",
      },

      "&:hover .cm-draftly-table-control-column, &:focus-within .cm-draftly-table-control-column": {
        transform: "translate(0, -50%)",
      },

      "&:hover .cm-draftly-table-control-row, &:focus-within .cm-draftly-table-control-row": {
        transform: "translate(-50%, 0)",
      },
    },
  },
});

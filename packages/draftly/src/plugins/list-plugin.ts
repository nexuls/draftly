import { Decoration, type EditorView, type KeyBinding, WidgetType } from "@codemirror/view";
import type { syntaxTree } from "@codemirror/language";
import { type DecorationContext, DecorationPlugin, type DescribedKeyBinding } from "../editor/plugin";
import { createTheme } from "../editor";
import type { Range } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

// ============================================================================
// CSS Classes
// ============================================================================

const classes = {
  // Unordered list classes
  lineUL: "cm-draftly-list-line-ul",
  markUL: "cm-draftly-list-mark-ul",

  // Ordered list classes
  lineOL: "cm-draftly-list-line-ol",
  markOL: "cm-draftly-list-mark-ol",

  // Task list classes
  taskLine: "cm-draftly-task-line",
  taskMarker: "cm-draftly-task-marker",

  // Common classes
  content: "cm-draftly-list-content",
  indent: "cm-draftly-list-indent",
  active: " cm-draftly-active",

  // Preview classes. Deliberately distinct from the `line*` classes above: those
  // describe an editor *line*, and their flex layout and `!important` padding are
  // meaningless -- and actively wrong -- on a real <ul>.
  previewList: "cm-draftly-list",
  previewUL: "cm-draftly-list-ul",
  previewOL: "cm-draftly-list-ol",
};

// ============================================================================
// Checkbox Widget
// ============================================================================

/**
 * Interactive checkbox widget for task list items.
 * Replaces `[ ]` or `[x]` markers with a clickable checkbox when not editing.
 */
export class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  override eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = `cm-draftly-task-checkbox ${this.checked ? "checked" : ""}`;

    // Announced as an image, not a checkbox. The widget replaces the raw `[ ]` marker, so
    // without a label the state is invisible to assistive technology -- but it is not a
    // real control either: making it focusable inside `contenteditable` fights the
    // editor's own focus and selection handling. `role="img"` describes the state
    // honestly without promising an interaction that is not there. The interaction lives
    // on Mod-Enter instead, which works regardless of focus semantics.
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", this.checked ? "Task complete" : "Task incomplete");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.checked;
    checkbox.tabIndex = -1;
    checkbox.setAttribute("aria-hidden", "true");

    checkbox.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.toggleCheckbox(view, wrap);
    });

    wrap.appendChild(checkbox);
    return wrap;
  }

  override ignoreEvent(): boolean {
    return false;
  }

  /** Toggle the checkbox state in the document */
  private toggleCheckbox(view: EditorView, wrap: HTMLElement): void {
    const pos = view.posAtDOM(wrap);
    const line = view.state.doc.lineAt(pos);
    const match = line.text.match(/^(\s*(?:[-*+]|\d+\.)\s*)\[([ xX])\]/);

    if (match) {
      const markerStart = line.from + match[1]!.length + 1;
      const newChar = this.checked ? " " : "x";
      view.dispatch({
        changes: { from: markerStart, to: markerStart + 1, insert: newChar },
      });
    }
  }
}

// ============================================================================
// List Plugin
// ============================================================================

/**
 * Decorates markdown lists with custom styling.
 *
 * Supports:
 * - **Unordered lists** — Replaces `*`, `-`, `+` markers with styled bullets
 * - **Ordered lists** — Styles numbered markers (`1.`, `2.`, etc.)
 * - **Task lists** — Renders `[ ]`/`[x]` as interactive checkboxes
 */
export class ListPlugin extends DecorationPlugin {
  readonly name = "list";
  readonly version = "1.0.0";
  override decorationPriority = 20;
  override readonly requiredNodes = [
    "BulletList",
    "OrderedList",
    "ListItem",
    "ListMark",
    "Task",
    "TaskMarker",
  ] as const;

  override get theme() {
    return theme;
  }

  /**
   * Keyboard shortcuts for list formatting
   */
  override getKeymap(): DescribedKeyBinding[] {
    return [
      {
        name: "Bullet list",
        description: "Toggle the selected lines as a bullet list",
        key: "Mod-Shift-8",
        run: (view) => this.toggleListOnLines(view, "- "),
        preventDefault: true,
      },
      {
        name: "Numbered list",
        description: "Toggle the selected lines as a numbered list",
        key: "Mod-Shift-7",
        run: (view) => this.toggleListOnLines(view, "1. "),
        preventDefault: true,
      },
      {
        name: "Task list",
        description: "Toggle the selected lines as a task list",
        key: "Mod-Shift-9",
        run: (view) => this.toggleListOnLines(view, "- [ ] "),
        preventDefault: true,
      },
      {
        // The only way to toggle a task without a mouse. The rendered checkbox is not
        // focusable -- see TaskCheckboxWidget.toDOM for why -- so this is not a
        // convenience shortcut, it is the keyboard interface.
        name: "Toggle task",
        description: "Check or uncheck the task on the current line",
        key: "Mod-Enter",
        run: (view) => this.toggleTaskOnLines(view),
        preventDefault: true,
      },
    ];
  }

  /**
   * Toggle the checked state of every task on the selected lines.
   *
   * Mirrors what clicking the checkbox does, for every line the selection touches.
   * Mixed selections are normalised to checked, matching how checkbox groups behave
   * elsewhere: if anything is unchecked, check everything; otherwise uncheck everything.
   *
   * @param view - The editor view
   * @returns `true` if any task was toggled, so the keymap can fall through otherwise
   */
  private toggleTaskOnLines(view: EditorView): boolean {
    const { state } = view;
    const { from, to } = state.selection.main;
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);

    const marks: { pos: number; checked: boolean }[] = [];
    for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
      const line = state.doc.line(lineNum);
      const match = line.text.match(/^(\s*(?:[-*+]|\d+\.)\s*)\[([ xX])\]/);
      if (match) {
        marks.push({ pos: line.from + match[1]!.length + 1, checked: match[2] !== " " });
      }
    }

    if (marks.length === 0) {
      return false;
    }

    const target = marks.some((mark) => !mark.checked) ? "x" : " ";
    view.dispatch({
      changes: marks.map((mark) => ({ from: mark.pos, to: mark.pos + 1, insert: target })),
    });
    return true;
  }

  /**
   * Toggle list marker on current line or selected lines
   */
  private toggleListOnLines(view: EditorView, marker: string): boolean {
    const { state } = view;
    const { from, to } = state.selection.main;

    // Get all lines in selection
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);

    const changes: { from: number; to: number; insert: string }[] = [];

    // Regex to match existing list markers
    const listMarkerRegex = /^(\s*)([-*+]|\d+\.)\s(\[[ xX]\]\s)?/;

    const isOrderedMarker = marker === "1. ";
    let orderNum = 1;

    for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
      const line = state.doc.line(lineNum);
      const match = line.text.match(listMarkerRegex);

      // Get the actual marker to insert (incremental for ordered lists)
      const actualMarker = isOrderedMarker ? `${orderNum}. ` : marker;

      if (match) {
        // Line already has a list marker - check if same type
        const existingMarker = match[0];
        const indent = match[1] || "";

        // Check if this is the same marker type (toggle off)
        const isUnordered = /^[-*+]$/.test(match[2]!);
        const isOrdered = /^\d+\.$/.test(match[2]!);
        const hasTask = !!match[3];

        const wantUnordered = marker === "- ";
        const wantOrdered = isOrderedMarker;
        const wantTask = marker === "- [ ] ";

        if (
          (wantUnordered && isUnordered && !hasTask) ||
          (wantOrdered && isOrdered && !hasTask) ||
          (wantTask && hasTask)
        ) {
          // Same type - remove the marker
          changes.push({
            from: line.from,
            to: line.from + existingMarker.length,
            insert: indent,
          });
        } else {
          // Different type - replace the marker
          changes.push({
            from: line.from,
            to: line.from + existingMarker.length,
            insert: indent + actualMarker,
          });
          orderNum++;
        }
      } else {
        // No list marker - add one at start of line (after any indent)
        const indentMatch = line.text.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1]! : "";
        changes.push({
          from: line.from + indent.length,
          to: line.from + indent.length,
          insert: actualMarker,
        });
        orderNum++;
      }
    }

    if (changes.length > 0) {
      view.dispatch({ changes });
    }

    return true;
  }

  buildDecorations(ctx: DecorationContext): void {
    const { view, decorations } = ctx;
    // Scoped to the viewport: an unbounded walk makes every update -- including a
    // plain cursor move -- cost O(document). See DecorationContext.iterateVisible.
    ctx.iterateVisible({
      enter: (node) => {
        const { from, to, name } = node;
        const line = view.state.doc.lineAt(from);
        const cursorInLine = ctx.cursorInRange(line.from, line.to);

        switch (name) {
          case "ListItem":
            this.decorateListItem(node, line, decorations);
            break;

          case "ListMark":
            // Narrower than cursorInLine on purpose: the mark reveals its raw
            // syntax only when the cursor is actually on it, matching the range
            // the decoration covers. Keying it to the whole line un-styled every
            // bullet the moment the caret entered its text.
            this.decorateListMark(node, line, decorations, ctx.cursorInRange(from, to + 1));
            break;

          case "TaskMarker":
            this.decorateTaskMarker(from, to, view, decorations, cursorInLine);
            break;
        }
      },
    });
  }

  /** Add line decoration for list items with nesting depth */
  private decorateListItem(
    node: Parameters<NonNullable<Parameters<ReturnType<typeof syntaxTree>["iterate"]>[0]["enter"]>>[0],
    line: { from: number },
    decorations: Range<Decoration>[]
  ): void {
    const parent = node.node.parent;
    const listType = parent?.name;

    // Calculate nesting depth
    let depth = 0;
    let ancestor = node.node.parent;
    while (ancestor) {
      if (ancestor.name === "ListItem") depth++;
      ancestor = ancestor.parent;
    }

    // Check for task marker child
    const hasTask = this.hasTaskChild(node);

    // Determine line class based on list type
    let lineClass: string;
    if (hasTask) lineClass = classes.taskLine;
    else if (listType === "OrderedList") lineClass = classes.lineOL;
    else lineClass = classes.lineUL;

    decorations.push(
      Decoration.line({
        class: lineClass,
        attributes: { style: `--depth: ${depth}` },
      }).range(line.from)
    );
  }

  /** Check if a ListItem node has a Task child */
  private hasTaskChild(
    node: Parameters<NonNullable<Parameters<ReturnType<typeof syntaxTree>["iterate"]>[0]["enter"]>>[0]
  ): boolean {
    const cursor = node.node.cursor();
    if (cursor.firstChild()) {
      do {
        if (cursor.name === "Task") return true;
      } while (cursor.nextSibling());
    }
    return false;
  }

  /** Decorate list markers (bullets for UL, numbers for OL) */
  private decorateListMark(
    node: Parameters<NonNullable<Parameters<ReturnType<typeof syntaxTree>["iterate"]>[0]["enter"]>>[0],
    line: { from: number; to: number },
    decorations: Range<Decoration>[],
    cursorOnMark: boolean
  ): void {
    const { from, to } = node;
    const parent = node.node.parent;
    const grandparent = parent?.parent;
    const listType = grandparent?.name;
    const activeClass = cursorOnMark ? classes.active : "";

    // Add indent decoration for nested items
    if (from > line.from) {
      decorations.push(Decoration.mark({ class: classes.indent + activeClass }).range(line.from, from));
    }

    // Add marker decoration based on list type
    const markClass = listType === "OrderedList" ? classes.markOL : classes.markUL;
    decorations.push(Decoration.mark({ class: markClass + activeClass }).range(from, to + 1));

    // Wrap remaining line content
    const contentStart = to + 1;
    if (contentStart < line.to) {
      decorations.push(Decoration.mark({ class: classes.content }).range(contentStart, line.to));
    }
  }

  /** Decorate task markers - show checkbox widget or raw text based on cursor */
  private decorateTaskMarker(
    from: number,
    to: number,
    view: EditorView,
    decorations: Range<Decoration>[],
    cursorInLine: boolean
  ): void {
    const text = view.state.sliceDoc(from, to);
    const isChecked = text.includes("x") || text.includes("X");

    if (cursorInLine) {
      // Show raw marker when editing
      decorations.push(Decoration.mark({ class: classes.taskMarker }).range(from, to));
    } else {
      // Replace with interactive checkbox
      decorations.push(
        Decoration.replace({
          widget: new TaskCheckboxWidget(isChecked),
        }).range(from, to)
      );
    }
  }

  /** Render list nodes to HTML */
  override renderToHTML(
    node: SyntaxNode,
    children: string,
    ctx: { sliceDoc(from: number, to: number): string; sanitize(html: string): string }
  ): string | null {
    switch (node.name) {
      case "BulletList":
        return `<ul class="${classes.previewList} ${classes.previewUL}">${children}</ul>\n`;

      case "OrderedList":
        return `<ol class="${classes.previewList} ${classes.previewOL}">${children}</ol>\n`;

      case "ListItem":
        return `<li>${children}</li>\n`;

      case "Task":
        return children;

      case "TaskMarker": {
        const text = ctx.sliceDoc(node.from, node.to);
        const isChecked = text.includes("x") || text.includes("X");
        return `<input type="checkbox" class="cm-draftly-task-checkbox" disabled ${isChecked ? "checked" : ""} />`;
      }

      case "ListMark":
        return "";

      default:
        return null;
    }
  }
}

// ============================================================================
// Theme
// ============================================================================

const theme = createTheme({
  default: {
    // Indentation marker positioning
    ".cm-draftly-list-indent": {
      overflow: "hidden",
      display: "inline-block",
      position: "absolute",
      left: "calc(1rem * (var(--depth, 0) + 1))",
      transform: "translateX(-100%)",
    },

    // List line layout (flexbox for marker alignment)
    ".cm-draftly-list-line-ul, .cm-draftly-list-line-ol": {
      position: "relative",
      paddingLeft: "calc(1rem * (var(--depth, 0) + 1)) !important",
      display: "flex",
      alignItems: "start",
    },
    ".cm-draftly-list-line-ul > :first-child, .cm-draftly-list-line-ol > :first-child": {
      flexShrink: 0,
    },

    // List marker sizing
    ".cm-draftly-list-line-ul .cm-draftly-list-mark-ul, .cm-draftly-list-line-ol .cm-draftly-list-mark-ol": {
      whiteSpace: "pre",
      position: "relative",
      width: "1rem",
      flexShrink: 0,
    },

    // Hide raw marker text when not active
    ".cm-draftly-list-mark-ul:not(.cm-draftly-active) > span, .cm-draftly-task-line .cm-draftly-list-mark-ol:not(.cm-draftly-active) > span":
      {
        visibility: "hidden",
        display: "none",
      },

    // Styled bullet for unordered lists
    ".cm-draftly-list-line-ul .cm-draftly-list-mark-ul:not(.cm-draftly-active)::after": {
      content: '"•"',
      color: "var(--draftly-color-link)",
      fontWeight: "bold",
      pointerEvents: "none",
    },

    // Task marker styling (visible when editing)
    ".cm-draftly-task-marker": {
      color: "var(--draftly-color-muted)",
      fontFamily: "var(--draftly-font-mono)",
    },

    // Task checkbox container
    ".cm-draftly-task-checkbox": {
      display: "inline-flex",
      verticalAlign: "middle",
      marginRight: "0.3em",
      cursor: "pointer",
      userSelect: "none",
      alignItems: "center",
      height: "1.2em",
    },

    // Task checkbox input styling
    ".cm-draftly-task-checkbox input": {
      cursor: "pointer",
      margin: 0,
      width: "1.1em",
      height: "1.1em",
      appearance: "none",
      border: "1px solid",
      borderRadius: "0.25em",
      backgroundColor: "transparent",
      position: "relative",
    },

    // Checkmark for completed tasks
    ".cm-draftly-task-checkbox.checked input::after": {
      content: '"✓"',
      position: "absolute",
      left: "1px",
      top: "-3px",
    },

    // Preview: a real <ul>/<ol>, styled as one.
    //
    // Nesting depth is structural here -- a nested list is a nested element -- so
    // indentation comes from the child list's own padding and needs no `--depth`.
    // The editor cannot do that, which is why its line classes carry a computed
    // padding and why reusing them here would be wrong.
    ".cm-draftly-list": {
      display: "block",
      paddingLeft: "1.5rem",
      margin: "0.5rem 0",
    },
    ".cm-draftly-list li": {
      display: "list-item",
      marginBottom: "0.25rem",
    },
    "ul.cm-draftly-list": {
      listStyleType: "disc",
    },
    "ol.cm-draftly-list": {
      listStyleType: "decimal",
    },
    // A nested list is already indented by its parent's list item; the wider
    // top-level margin would double the gap.
    ".cm-draftly-list .cm-draftly-list": {
      margin: "0.25rem 0",
    },
    // Hide list marker for task items
    ".cm-draftly-list li:has(.cm-draftly-task-checkbox)": {
      listStyleType: "none",
    },
    ".cm-draftly-list li .cm-draftly-paragraph": {
      padding: "0",
    },
  },
});

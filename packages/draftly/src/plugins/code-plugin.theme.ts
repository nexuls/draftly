import { createTheme } from "../editor";

/** Shared theme styles for editor + preview code blocks. */
export const codePluginTheme = createTheme({
  default: {
    // Inline code
    ".cm-draftly-code-inline": {
      fontFamily: "var(--draftly-font-mono)",
      fontSize: "0.9rem",
      backgroundColor: "var(--draftly-surface-code-inline)",
      padding: "0.1rem 0.25rem",
      border: "1px solid var(--draftly-color-border)",
      borderRadius: "3px",
    },

    // Fenced code block lines
    ".cm-draftly-code-block-line": {
      "--radius": "0.375rem",

      fontFamily: "var(--draftly-font-mono)",
      fontSize: "0.9rem",
      backgroundColor: "var(--draftly-surface-code)",
      padding: "0 1rem !important",
      lineHeight: "1.5",
      borderLeft: "1px solid var(--draftly-color-border)",
      borderRight: "1px solid var(--draftly-color-border)",
    },

    // First line of code block
    ".cm-draftly-code-block-line-start": {
      borderTopLeftRadius: "var(--radius)",
      borderTopRightRadius: "var(--radius)",
      position: "relative",
      overflow: "hidden",
      borderTop: "1px solid var(--draftly-color-border)",
      paddingBottom: "0.5rem !important",
    },

    // Remove top radius when header is present
    ".cm-draftly-code-block-has-header": {
      padding: "0 !important",
      paddingBottom: "0.5rem !important",
    },

    // Code block header widget
    ".cm-draftly-code-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "0.25rem 1rem",
      backgroundColor: "var(--draftly-surface-code-header)",
      fontFamily: "var(--draftly-font-mono)",
      fontSize: "0.85rem",

      ".cm-draftly-code-header-left": {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",

        ".cm-draftly-code-header-title": {
          color: "var(--draftly-color-text)",
          fontWeight: "500",
        },

        ".cm-draftly-code-header-lang": {
          color: "var(--draftly-color-muted)",
          opacity: "0.8",
        },
      },

      ".cm-draftly-code-header-right": {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",

        ".cm-draftly-code-copy-btn": {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.25rem",
          backgroundColor: "transparent",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          color: "var(--draftly-color-muted)",
          transition: "color 0.2s, background-color 0.2s",

          "&:hover": {
            backgroundColor: "var(--draftly-tint-5)",
            color: "var(--draftly-color-text)",
          },

          "&.copied": {
            color: "var(--draftly-color-add)",
          },

          // Clipboard writes are rejected on plain HTTP, without permission, and when
          // the document is not focused. The button says so rather than doing nothing.
          "&.copy-failed": {
            color: "var(--draftly-color-del)",
          },
        },
      },
    },

    // Caption (below code block)
    ".cm-draftly-code-block-has-caption": {
      padding: "0 !important",
      paddingTop: "0.5rem !important",
    },

    ".cm-draftly-code-caption": {
      textAlign: "center",
      fontSize: "0.85rem",
      color: "var(--draftly-color-muted)",
      fontStyle: "italic",
      padding: "0.25rem 1rem",
      backgroundColor: "var(--draftly-surface-code-caption)",
    },

    // Last line of code block
    ".cm-draftly-code-block-line-end": {
      borderBottomLeftRadius: "var(--radius)",
      borderBottomRightRadius: "var(--radius)",
      borderBottom: "1px solid var(--draftly-color-border)",
      paddingTop: "0.5rem !important",

      "& br": {
        display: "none",
      },
    },

    // Fence markers (```)
    ".cm-draftly-code-fence": {
      color: "var(--draftly-color-muted)",
      fontFamily: "var(--draftly-font-mono)",
    },

    // Line numbers
    ".cm-draftly-code-line-numbered": {
      paddingLeft: "calc(var(--line-num-width, 2ch) + 1rem) !important",
      position: "relative",

      "&::before": {
        content: "attr(data-line-num)",
        position: "absolute",
        left: "0.5rem",
        top: "0.2rem",
        width: "var(--line-num-width, 2ch)",
        textAlign: "right",
        color: "var(--draftly-color-muted)",
        opacity: "0.6",
        fontFamily: "var(--draftly-font-mono)",
        fontSize: "0.85rem",
        userSelect: "none",
      },
    },

    ".cm-draftly-code-line-numbered-diff": {
      paddingLeft: "calc(var(--line-num-old-width, 2ch) + var(--line-num-new-width, 2ch) + 2.75rem) !important",
      position: "relative",

      "&::before": {
        content: "attr(data-line-num-old)",
        position: "absolute",
        left: "0.5rem",
        top: "0.2rem",
        width: "var(--line-num-old-width, 2ch)",
        textAlign: "right",
        color: "var(--draftly-color-muted)",
        opacity: "0.6",
        fontFamily: "var(--draftly-font-mono)",
        fontSize: "0.85rem",
        userSelect: "none",
      },

      "&::after": {
        content: 'attr(data-line-num-new) " " attr(data-diff-marker)',
        position: "absolute",
        left: "calc(0.5rem + var(--line-num-old-width, 2ch) + 0.75rem)",
        top: "0.2rem",
        width: "calc(var(--line-num-new-width, 2ch) + 2ch)",
        textAlign: "right",
        color: "var(--draftly-color-muted)",
        opacity: "0.6",
        fontFamily: "var(--draftly-font-mono)",
        fontSize: "0.85rem",
        userSelect: "none",
      },

      "&.cm-draftly-code-line-diff-gutter": {
        paddingLeft: "calc(var(--line-num-width, 2ch) + 2rem) !important",

        "&::after": {
          content: "attr(data-diff-marker)",
          position: "absolute",
          left: "calc(0.5rem + var(--line-num-width, 2ch) + 0.35rem)",
          top: "0.1rem",
          width: "1ch",
          textAlign: "right",
          // Diff rows override this with their own add/delete colour; unchanged
          // rows keep the gutter muted, as the dark layer used to do for both.
          color: "var(--draftly-color-muted)",
          fontFamily: "var(--draftly-font-mono)",
          fontSize: "0.85rem",
          fontWeight: "700",
          userSelect: "none",
        },
      },
    },

    // Preview: code lines (need block display for full-width highlights)
    ".cm-draftly-code-line": {
      display: "block",
      position: "relative",
      paddingLeft: "1rem",
      paddingRight: "1rem",
      lineHeight: "1.5",
      borderLeft: "3px solid transparent",
    },

    // Line highlight
    ".cm-draftly-code-line-highlight": {
      backgroundColor: "var(--draftly-color-mark-line) !important",
      borderLeft: "3px solid var(--draftly-color-mark) !important",
    },

    ".cm-draftly-code-line-diff-add": {
      color: "inherit",
      backgroundColor: "var(--draftly-color-add-line) !important",
      borderLeft: "3px solid var(--draftly-color-add) !important",

      "&.cm-draftly-code-line-diff-gutter::after": {
        color: "var(--draftly-color-add-text)",
      },
    },

    ".cm-draftly-code-line-diff-del": {
      color: "inherit",
      backgroundColor: "var(--draftly-color-del-line) !important",
      borderLeft: "3px solid var(--draftly-color-del) !important",

      "&.cm-draftly-code-line-diff-gutter::after": {
        color: "var(--draftly-color-del-text)",
      },
    },

    ".cm-draftly-code-diff-sign-add": {
      color: "var(--draftly-color-add-text)",
      fontWeight: "700",
    },

    ".cm-draftly-code-diff-sign-del": {
      color: "var(--draftly-color-del-text)",
      fontWeight: "700",
    },

    ".cm-draftly-code-diff-mod-add": {
      color: "inherit",
      backgroundColor: "var(--draftly-color-add-word)",
      borderRadius: "2px",
      padding: "0.1rem 0",
    },

    ".cm-draftly-code-diff-mod-del": {
      color: "inherit",
      backgroundColor: "var(--draftly-color-del-word)",
      borderRadius: "2px",
      padding: "0.1rem 0",
    },

    // Text highlight
    ".cm-draftly-code-text-highlight": {
      color: "inherit",
      backgroundColor: "var(--draftly-color-mark-word)",
      borderRadius: "2px",
      padding: "0.1rem 0",
    },

    // Preview: container wrapper
    ".cm-draftly-code-container": {
      margin: "1rem 0",
      borderRadius: "var(--radius)",
      overflow: "hidden",
      border: "1px solid var(--draftly-color-border)",

      ".cm-draftly-code-header": {
        borderRadius: "0",
        border: "none",
        borderBottom: "1px solid var(--draftly-color-border)",
      },

      ".cm-draftly-code-block": {
        margin: "0",
        borderRadius: "0",
        border: "none",
        whiteSpace: "pre-wrap",
      },

      ".cm-draftly-code-caption": {
        borderTop: "1px solid var(--draftly-color-border)",
      },
    },

    // Preview: standalone code block (not in container)
    ".cm-draftly-code-block": {
      fontFamily: "var(--draftly-font-mono)",
      fontSize: "0.9rem",
      backgroundColor: "var(--draftly-surface-code)",
      padding: "1rem",
      overflow: "auto",
      position: "relative",
      borderRadius: "var(--radius)",
      border: "1px solid var(--draftly-color-border)",

      "&.cm-draftly-code-block-has-header": {
        borderTopLeftRadius: "0",
        borderTopRightRadius: "0",
        borderTop: "none",
        margin: "0",
        paddingTop: "0.5rem !important",
      },

      "&.cm-draftly-code-block-has-caption": {
        borderBottomLeftRadius: "0",
        borderBottomRightRadius: "0",
        borderBottom: "none",
        paddingBottom: "0.5rem !important",
      },
    },
  },
});

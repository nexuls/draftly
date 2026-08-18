import { createTheme } from "../editor";

/** Shared theme styles for editor + preview code blocks. */
export const codePluginTheme = createTheme({
  default: {
    // Inline code
    ".cm-draftly-code-inline": {
      fontFamily: "var(--font-jetbrains-mono, monospace)",
      fontSize: "0.9rem",
      backgroundColor: "rgba(0, 0, 0, 0.05)",
      padding: "0.1rem 0.25rem",
      border: "1px solid var(--color-border)",
      borderRadius: "3px",
    },

    // Fenced code block lines
    ".cm-draftly-code-block-line": {
      "--radius": "0.375rem",

      fontFamily: "var(--font-jetbrains-mono, monospace)",
      fontSize: "0.9rem",
      backgroundColor: "rgba(0, 0, 0, 0.03)",
      padding: "0 1rem !important",
      lineHeight: "1.5",
      borderLeft: "1px solid var(--color-border)",
      borderRight: "1px solid var(--color-border)",
    },

    // First line of code block
    ".cm-draftly-code-block-line-start": {
      borderTopLeftRadius: "var(--radius)",
      borderTopRightRadius: "var(--radius)",
      position: "relative",
      overflow: "hidden",
      borderTop: "1px solid var(--color-border)",
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
      backgroundColor: "rgba(0, 0, 0, 0.06)",
      fontFamily: "var(--font-jetbrains-mono, monospace)",
      fontSize: "0.85rem",

      ".cm-draftly-code-header-left": {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",

        ".cm-draftly-code-header-title": {
          color: "var(--color-text, inherit)",
          fontWeight: "500",
        },

        ".cm-draftly-code-header-lang": {
          color: "#6a737d",
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
          color: "#6a737d",
          transition: "color 0.2s, background-color 0.2s",

          "&:hover": {
            backgroundColor: "rgba(0, 0, 0, 0.1)",
            color: "var(--color-text, inherit)",
          },

          "&.copied": {
            color: "#22c55e",
          },

          // Clipboard writes are rejected on plain HTTP, without permission, and when
          // the document is not focused. The button says so rather than doing nothing.
          "&.copy-failed": {
            color: "#ef4444",
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
      color: "#6a737d",
      fontStyle: "italic",
      padding: "0.25rem 1rem",
      backgroundColor: "rgba(0, 0, 0, 0.06)",
    },

    // Last line of code block
    ".cm-draftly-code-block-line-end": {
      borderBottomLeftRadius: "var(--radius)",
      borderBottomRightRadius: "var(--radius)",
      borderBottom: "1px solid var(--color-border)",
      paddingTop: "0.5rem !important",

      "& br": {
        display: "none",
      },
    },

    // Fence markers (```)
    ".cm-draftly-code-fence": {
      color: "#6a737d",
      fontFamily: "var(--font-jetbrains-mono, monospace)",
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
        color: "#6a737d",
        opacity: "0.6",
        fontFamily: "var(--font-jetbrains-mono, monospace)",
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
        color: "#6a737d",
        opacity: "0.6",
        fontFamily: "var(--font-jetbrains-mono, monospace)",
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
        color: "#6a737d",
        opacity: "0.6",
        fontFamily: "var(--font-jetbrains-mono, monospace)",
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
          fontFamily: "var(--font-jetbrains-mono, monospace)",
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
      backgroundColor: "rgba(255, 220, 100, 0.2) !important",
      borderLeft: "3px solid #f0b429 !important",
    },

    ".cm-draftly-code-line-diff-add": {
      color: "inherit",
      backgroundColor: "rgba(34, 197, 94, 0.12) !important",
      borderLeft: "3px solid #22c55e !important",

      "&.cm-draftly-code-line-diff-gutter::after": {
        color: "#16a34a",
      },
    },

    ".cm-draftly-code-line-diff-del": {
      color: "inherit",
      backgroundColor: "rgba(239, 68, 68, 0.12) !important",
      borderLeft: "3px solid #ef4444 !important",

      "&.cm-draftly-code-line-diff-gutter::after": {
        color: "#dc2626",
      },
    },

    ".cm-draftly-code-diff-sign-add": {
      color: "#16a34a",
      fontWeight: "700",
    },

    ".cm-draftly-code-diff-sign-del": {
      color: "#dc2626",
      fontWeight: "700",
    },

    ".cm-draftly-code-diff-mod-add": {
      color: "inherit",
      backgroundColor: "rgba(34, 197, 94, 0.25)",
      borderRadius: "2px",
      padding: "0.1rem 0",
    },

    ".cm-draftly-code-diff-mod-del": {
      color: "inherit",
      backgroundColor: "rgba(239, 68, 68, 0.25)",
      borderRadius: "2px",
      padding: "0.1rem 0",
    },

    // Text highlight
    ".cm-draftly-code-text-highlight": {
      color: "inherit",
      backgroundColor: "rgba(255, 220, 100, 0.4)",
      borderRadius: "2px",
      padding: "0.1rem 0",
    },

    // Preview: container wrapper
    ".cm-draftly-code-container": {
      margin: "1rem 0",
      borderRadius: "var(--radius)",
      overflow: "hidden",
      border: "1px solid var(--color-border)",

      ".cm-draftly-code-header": {
        borderRadius: "0",
        border: "none",
        borderBottom: "1px solid var(--color-border)",
      },

      ".cm-draftly-code-block": {
        margin: "0",
        borderRadius: "0",
        border: "none",
        whiteSpace: "pre-wrap",
      },

      ".cm-draftly-code-caption": {
        borderTop: "1px solid var(--color-border)",
      },
    },

    // Preview: standalone code block (not in container)
    ".cm-draftly-code-block": {
      fontFamily: "var(--font-jetbrains-mono, monospace)",
      fontSize: "0.9rem",
      backgroundColor: "rgba(0, 0, 0, 0.03)",
      padding: "1rem",
      overflow: "auto",
      position: "relative",
      borderRadius: "var(--radius)",
      border: "1px solid var(--color-border)",

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

  dark: {
    ".cm-draftly-code-inline": {
      backgroundColor: "rgba(255, 255, 255, 0.1)",
    },

    ".cm-draftly-code-block-line": {
      backgroundColor: "rgba(255, 255, 255, 0.05)",
    },

    ".cm-draftly-code-fence": {
      color: "#8b949e",
    },

    ".cm-draftly-code-block": {
      backgroundColor: "rgba(255, 255, 255, 0.05)",
    },

    ".cm-draftly-code-header": {
      backgroundColor: "rgba(255, 255, 255, 0.08)",

      ".cm-draftly-code-header-lang": {
        color: "#8b949e",
      },

      ".cm-draftly-code-copy-btn": {
        color: "#8b949e",

        "&:hover": {
          backgroundColor: "rgba(255, 255, 255, 0.1)",
        },
      },
    },

    ".cm-draftly-code-caption": {
      backgroundColor: "rgba(255, 255, 255, 0.05)",
    },

    ".cm-draftly-code-line-numbered": {
      "&::before": {
        color: "#8b949e",
      },
    },

    ".cm-draftly-code-line-numbered-diff": {
      "&::before": {
        color: "#8b949e",
      },

      "&::after": {
        color: "#8b949e",
      },
    },

    ".cm-draftly-code-line-diff-gutter": {
      "&::after": {
        color: "#8b949e",
      },
    },

    ".cm-draftly-code-line-highlight": {
      backgroundColor: "rgba(255, 220, 100, 0.15) !important",
      borderLeft: "3px solid #d9a520 !important",
    },

    ".cm-draftly-code-line-diff-add": {
      backgroundColor: "rgba(34, 197, 94, 0.15) !important",
      borderLeft: "3px solid #22c55e !important",

      "&.cm-draftly-code-line-diff-gutter::after": {
        color: "#4ade80",
      },
    },

    ".cm-draftly-code-line-diff-del": {
      backgroundColor: "rgba(239, 68, 68, 0.15) !important",
      borderLeft: "3px solid #ef4444 !important",

      "&.cm-draftly-code-line-diff-gutter::after": {
        color: "#f87171",
      },
    },

    ".cm-draftly-code-diff-sign-add": {
      color: "#4ade80",
    },

    ".cm-draftly-code-diff-sign-del": {
      color: "#f87171",
    },

    ".cm-draftly-code-diff-mod-add": {
      backgroundColor: "rgba(34, 197, 94, 0.3)",
    },

    ".cm-draftly-code-diff-mod-del": {
      backgroundColor: "rgba(239, 68, 68, 0.3)",
    },

    ".cm-draftly-code-text-highlight": {
      backgroundColor: "rgba(255, 220, 100, 0.3)",
    },
  },
});

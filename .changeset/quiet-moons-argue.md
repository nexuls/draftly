---
"draftly": patch
---

Guard widget async work.

- **Copy button:** `navigator.clipboard.writeText` had no `.catch()`. It rejects when
  permission is denied, when the document is not focused, and over plain HTTP — all of
  which a docs-site playground in an iframe hits routinely — so the failure was an
  unhandled rejection and a button that silently did nothing. It now shows a failure state.
  The 2-second reset timer is tracked, cancelled on widget teardown, and restarted rather
  than raced on a rapid second click.
- **Mermaid:** the async render no longer writes into a detached element, and the error
  path uses `classList.add` instead of `className +=`. Error text is escaped. The
  module-level id counter wraps instead of growing for the page's lifetime.
- **Images:** a broken image shows exactly one error message. `onerror` can fire more than
  once for the same element, which stacked duplicates.

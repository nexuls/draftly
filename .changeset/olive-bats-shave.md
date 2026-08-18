---
"draftly": patch
---

Make server-side sanitization honest, and add `PreviewConfig.sanitizer`.

`sanitize` is implemented with DOMPurify, which needs a DOM — so during SSR or static
generation `sanitize: true` was a silent no-op while every signal told the consumer they
were protected. It now warns once per process, naming the risk and the remedy.

The remedy is the new `sanitizer` option: supply your own function (`isomorphic-dompurify`,
or DOMPurify with jsdom) and Draftly uses it in preference to the bundled one, on every
surface. Draftly still does not bundle jsdom.

Pass-through when no sanitizer is supplied is unchanged, so existing setups keep working;
only the silence is gone. The README now carries a warning call-out on the preview config
table rather than leaving this to a source comment.

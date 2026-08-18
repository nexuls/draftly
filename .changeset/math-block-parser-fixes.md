---
"draftly": patch
---

Fix three math block parsing bugs.

- `$$x^2$$` on a single line was never recognised as a math block; only the fenced form
  with the delimiters on their own lines parsed. The single-line form is now claimed when
  it occupies the whole line, and deliberately left alone when other content follows it.
- An indented `$$` — inside a list item or blockquote — produced an opening `MathBlockMark`
  covering the leading whitespace instead of the delimiter, because the fence was searched
  for from the start of the line rather than from the container prefix.
- Trailing whitespace after the closing `$$` pushed the closing mark past the delimiter, so
  it covered the whitespace instead.

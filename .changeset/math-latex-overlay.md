---
"draftly": minor
---

`MathPlugin` accepts a LaTeX parser to overlay on math content, so the raw source
highlights while the cursor is inside a formula.

```ts
import { latexLanguage } from "codemirror-lang-latex";
import { styleTags } from "@lezer/highlight";
import { MathPlugin, latexHighlightTags } from "draftly/plugins";

new MathPlugin({
  mathParser: latexLanguage.parser.configure({ props: [styleTags(latexHighlightTags)] }),
});
```

The parser is injected rather than bundled. `codemirror-lang-latex` is AGPL-3.0-or-later
and draftly is MIT, so depending on it would push those terms onto every consumer — this
way the choice stays with the application that wants the feature, and draftly's dependency
list and bundle are unchanged.

`latexHighlightTags` covers the ~40 control-sequence node types that package specialises but
does not style, which otherwise render as plain text next to the generic `CtrlSeq` token.

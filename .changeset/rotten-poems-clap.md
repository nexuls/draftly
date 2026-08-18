---
"draftly": minor
---

Surface genuine plugin errors instead of swallowing everything.

`buildDecorations` failures were caught and discarded without a trace. The rationale is
sound — Lezer exposes partially-built trees mid-parse and node access throws until it
settles — but it meant a real plugin bug produced exactly the same symptom as the benign
case: the decoration silently did not appear, with no log and no counter. Debugging meant
editing library source.

Errors raised while the syntax tree is still parsing are still swallowed. Everything else
is reported **once per distinct plugin and message**, so a persistent bug does not flood
the console as decorations rebuild on every cursor movement.

New `DraftlyConfig.onPluginError?: (plugin, error) => void` routes them wherever you want.
Without a handler, Draftly logs to `console.error` outside production and stays silent in
production.

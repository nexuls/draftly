---
"draftly": patch
---

Escape attribute values and reject dangerous URL schemes in preview output.

`LinkPlugin` and `ImagePlugin` built their HTML attributes by interpolating
`ctx.sanitize(value)` into a quoted attribute. DOMPurify sanitizes an HTML
*fragment*; handed a bare string it returns it essentially unchanged, quotes
included — so `[x](" onmouseover="alert(1))` injected an attribute, and
`[x](javascript:alert(1))` emitted a live `javascript:` URL. Attribute values are
now escaped with `escapeHtml`, and URLs pass a scheme allowlist.

New in `draftly/lib`: `isSafeUrl`, `safeUrl` and `SafeUrlOptions`. `escapeHtml`
also moved here; it is still re-exported from `draftly/preview`, so that import
path is unchanged.

The editor surface applies the same guard — an image `src` and a Ctrl+Click on a
link now reject the schemes preview rejects. A link or image whose URL is
rejected renders with an empty `href`/`src` rather than being dropped.

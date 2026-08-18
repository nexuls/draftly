# Web Playground

> Last verified: 2026-08-18 · commit `eae4434`
> Source: `apps/web/`

The Next.js app that serves as Draftly's documentation site, live demo, and — most
importantly for agents — **the primary verification surface for library changes**.

---

## Role in the workflow

There is no test suite ([build-and-tooling.md](./build-and-tooling.md)), so the
playground is how a change gets verified. It imports `draftly/src` (raw TypeScript), so:

- library edits hot-reload with no rebuild;
- type errors in the library surface immediately in the app;
- the editor pane and the preview pane render side by side, letting you check both
  surfaces of a plugin change at once.

```bash
bun dev          # then open the playground route
```

---

## Structure

```
apps/web/app/
├── layout.tsx                  # Root layout, theme provider
├── page.tsx                    # Landing page
├── data/md/
│   ├── what-id-draftly.ts      # Intro document (seed content)
│   └── walkthrough.ts          # Feature tour — exercises every plugin
└── playground/
    ├── page.tsx                # State, persistence, editor + preview panes
    ├── devbar.tsx              # Live toggles for config + plugins
    ├── sidebar.tsx             # Document list
    ├── header.tsx / footer.tsx
    ├── create-content-dialog.tsx
    └── types.d.ts              # `Content` type
```

Styling comes from `@workspace/ui` (shadcn/ui, Tailwind v4) plus `next-themes` for
light/dark.

---

## `playground/page.tsx`

The app's centre of gravity. Responsibilities:

1. **Document management** — a list of `Content` items in `localStorage`, seeded from
   `data/md/`.
2. **Live configuration** — a `PlaygroundConfig` covering editor flags, preview flags,
   and a per-plugin on/off map.
3. **Dual rendering** — a CodeMirror editor and an async `preview()` result, plus panes
   showing the generated HTML and CSS.
4. **AST inspection** — consumes `onNodesChange` to display the parsed tree.

### Plugin toggles are derived, not hardcoded

```ts
const defaultPluginConfig: PluginConfig = Object.fromEntries(
  playgroundPlugins.map((plugin) => [plugin.name.toLowerCase(), true])
);
```

A new plugin registered in `plugins/index.ts` appears in the devbar automatically. **Do
not add a manual entry** — if a toggle is missing, the plugin was not added to
`createEssentialPlugins()`.

### localStorage keys and versioning

```ts
const STORAGE_KEY = "draftly-playground-contents";
const STORAGE_CURRENT_KEY = "draftly-playground-current";
const STORAGE_VERSION_KEY = "draftly-playground-version";
const VERSION = 1;
```

> **Bump `VERSION` whenever you edit `data/md/what-id-draftly.ts` or `walkthrough.ts`.**
> Returning users have the old text cached in `localStorage`; the version mismatch is
> what triggers a refresh of the seed documents. Forgetting this means your new demo
> content is invisible to everyone who has visited before — including you.

### Debouncing

`DEBOUNCE_MS = 500` gates preview regeneration. `preview()` is async and re-parses the
whole document, so it must not run per keystroke. Keep this in mind when a preview change
feels laggy — the delay may be the debounce, not your code.

---

## Verifying a library change here

1. `bun dev`, open the playground.
2. Load or write markdown exercising the feature. `walkthrough.ts` covers every plugin —
   extend it when adding one.
3. Check the **editor pane**: correct decoration, and syntax reveals when the cursor
   enters the construct.
4. Check the **preview pane**: matching visual output.
5. Check the **HTML pane**: semantic, correctly escaped markup.
6. Check the **CSS pane**: your plugin's styles present, scoped under the wrapper class.
7. Toggle your plugin **off** in the devbar and confirm graceful degradation.
8. Toggle **dark/light** and confirm both themes.

Step 7 catches the common bug where a plugin's decoration is required by another
plugin's assumptions.

---

## Conventions

- Client components only where interactivity demands it (`"use client"` at the top of
  `playground/page.tsx` and its children).
- UI primitives come from `@workspace/ui/components/*`; do not re-implement them locally.
- `cn()` from `@workspace/ui/lib/utils` for class composition.
- The app is `private: true` and never published; its version (`0.0.9`) is cosmetic.

## Boundary

The playground is a **consumer** of the library, exactly like an external user's app. It
must never be the place a feature lives. If playground code needs a helper that other
consumers would also want, that helper belongs in `packages/draftly/src/lib/`.

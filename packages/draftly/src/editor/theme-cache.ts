import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import type { DraftlyPlugin } from "./plugin";
import type { ThemeEnum, ThemeStyle } from "./utils";

/**
 * Per-plugin memo of everything derived from `plugin.theme`.
 *
 * At most three entries per map — one per `ThemeEnum` value.
 */
interface PluginThemeCache {
  /** Resolved (flattened + layer-merged) style objects. */
  styles: Map<ThemeEnum, ThemeStyle>;
  /** `EditorView.theme()` extensions, and therefore `StyleModule` identities. */
  extensions: Map<ThemeEnum, Extension>;
}

/**
 * Keyed on the plugin **instance** so a consumer's plugin is cached exactly like a
 * built-in one, and so entries are collectable if instances ever stop being the
 * module-level singletons they are today.
 */
const themeCache = new WeakMap<DraftlyPlugin, PluginThemeCache>();

/**
 * Get (or create) the cache entry for a plugin.
 *
 * @param plugin - The plugin to look up
 * @returns Its cache entry, created empty on first access
 */
function entryFor(plugin: DraftlyPlugin): PluginThemeCache {
  let entry = themeCache.get(plugin);
  if (!entry) {
    entry = { styles: new Map(), extensions: new Map() };
    themeCache.set(plugin, entry);
  }
  return entry;
}

/**
 * Resolve a plugin's styles for a theme, memoized.
 *
 * `plugin.theme` is a getter that allocates a fresh resolver on the base class, and
 * resolving re-walks the whole style tree. Both surfaces call it repeatedly — once
 * per plugin per `draftly()` call, and again per `generateCSS()` call — for a result
 * that is constant per `(plugin, theme)` pair.
 *
 * @param plugin - The plugin whose theme to resolve
 * @param theme - Which theme layer to apply
 * @returns The flattened, layer-merged style object. **Shared — do not mutate.**
 */
export function resolvePluginTheme(plugin: DraftlyPlugin, theme: ThemeEnum): ThemeStyle {
  const { styles } = entryFor(plugin);

  let resolved = styles.get(theme);
  if (!resolved) {
    const resolver = plugin.theme;
    resolved = typeof resolver === "function" ? resolver(theme) : {};
    styles.set(theme, resolved);
  }

  return resolved;
}

/**
 * Build a plugin's `EditorView.theme()` extension, memoized.
 *
 * The memo is what keeps the injected stylesheet from growing. `EditorView.theme()`
 * mints a new `StyleModule`, and style-mod deduplicates injected rules by module
 * *identity* — so a fresh module per `draftly()` call appends a fresh copy of every
 * rule to `document.head`. Hosts that rebuild their extension array on each toggle
 * (the playground does) otherwise accumulate 14 plugins' worth of CSS per rebuild.
 *
 * @param plugin - The plugin whose theme to wrap
 * @param theme - Which theme layer to apply
 * @returns A stable extension; the same instance for the same `(plugin, theme)` pair
 */
export function pluginThemeExtension(plugin: DraftlyPlugin, theme: ThemeEnum): Extension {
  const { extensions } = entryFor(plugin);

  let extension = extensions.get(theme);
  if (!extension) {
    extension = EditorView.theme(resolvePluginTheme(plugin, theme));
    extensions.set(theme, extension);
  }

  return extension;
}

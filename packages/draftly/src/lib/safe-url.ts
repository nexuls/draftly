/**
 * URL scheme validation shared by the editor and preview surfaces.
 *
 * Pure and CodeMirror-free by design: both surfaces must reject the same schemes,
 * and the only way to guarantee that is for both to call the same function.
 *
 * @packageDocumentation
 */

/**
 * Schemes that may appear in a link or image URL.
 *
 * Deliberately short. `javascript:` and `vbscript:` execute; `file:` and `blob:`
 * reach for local or origin-scoped resources a markdown document has no business
 * addressing. `data:` is handled separately -- see {@link SafeUrlOptions.allowDataImages}.
 */
const ALLOWED_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Matches a leading URL scheme, per RFC 3986: a letter followed by letters,
 * digits, `+`, `-` or `.`, terminated by a colon.
 */
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Matches a `data:` URL whose media type is a raster image.
 *
 * `image/svg+xml` is excluded on purpose -- SVG carries script, so a
 * `data:image/svg+xml` URL is an XSS vector wearing an image's clothes.
 */
const DATA_IMAGE_PATTERN = /^data:image\/(png|jpeg|jpg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon);/i;

/**
 * Characters stripped before the scheme is examined.
 *
 * Browsers ignore C0 controls, spaces, DEL and the C1 range when resolving a URL,
 * so a newline spliced into `javascript:` still yields a live `javascript:` URL.
 * Testing the raw string would miss it.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point -- browsers strip them before resolving a URL, so the scheme check must strip them too
const IGNORED_IN_SCHEME = /[\u0000-\u0020\u007f-\u009f]/g;

/**
 * Options for {@link isSafeUrl} and {@link safeUrl}.
 */
export interface SafeUrlOptions {
  /**
   * Permit `data:` URLs with a raster image media type.
   *
   * Set for an `<img src>`, where inline images are a legitimate and common
   * markdown idiom. Leave unset for `<a href>`, where a `data:` URL is a
   * navigation target and gains nothing but risk.
   *
   * @defaultValue false
   */
  allowDataImages?: boolean;
}

/**
 * Test whether a URL is safe to place in an `href` or `src`.
 *
 * A URL with no scheme -- relative, protocol-relative, a fragment, a query -- is
 * always safe; it inherits the hosting document's own scheme. A URL *with* a
 * scheme must name one in the allowlist.
 *
 * @param url - The raw URL as written in the markdown source
 * @param options - Scheme policy; see {@link SafeUrlOptions}
 * @returns `true` if the URL may be emitted as-is
 *
 * @example
 * ```ts
 * isSafeUrl("https://example.com");   // true
 * isSafeUrl("./relative/path.md");    // true
 * isSafeUrl("javascript:alert(1)");   // false
 * isSafeUrl("data:image/png;base64,AA", { allowDataImages: true }); // true
 * ```
 */
export function isSafeUrl(url: string, options: SafeUrlOptions = {}): boolean {
  const normalized = url.replace(IGNORED_IN_SCHEME, "");

  const scheme = normalized.match(SCHEME_PATTERN)?.[0];
  if (!scheme) {
    // No scheme: relative, protocol-relative, fragment or query. It inherits the
    // hosting document's scheme, so there is nothing to allowlist.
    return true;
  }

  if (ALLOWED_SCHEMES.has(scheme.toLowerCase())) {
    return true;
  }

  return options.allowDataImages === true && DATA_IMAGE_PATTERN.test(normalized);
}

/**
 * Return the URL if it is safe, or an empty string if it is not.
 *
 * The empty string is chosen over dropping the attribute entirely so callers stay
 * simple: an `href=""` is inert, and the surrounding markup does not change shape
 * depending on the input.
 *
 * @param url - The raw URL as written in the markdown source
 * @param options - Scheme policy; see {@link SafeUrlOptions}
 * @returns The original URL, or `""` when its scheme is not permitted
 */
export function safeUrl(url: string, options: SafeUrlOptions = {}): string {
  return isSafeUrl(url, options) ? url : "";
}

/**
 * Canonical text-aware node sizing.
 *
 * Both the export pipeline (Ledger #8/F07 — a node's exported box must
 * grow to fit its wrapped text, not overflow or truncate it) and the
 * production mind-map layout engine (M0/M1-A — a node's *declared*
 * geometry must reflect its real text size before layout positions it,
 * not a fixed box regardless of text length) need the same answer to
 * "how big does this text actually render." This module is that single
 * source, so canvas, layout, and export can't drift apart on it again.
 *
 * `estimatedCharWidth`/`wrapNodeText` moved here from `src/export/exporter.ts`
 * verbatim (no behavior change); `exporter.ts` now imports them from here.
 * `computeTextAwareNodeSize` is new for M1-A: the same "wrap at a fixed
 * width, grow height only" model export already uses, applied *before*
 * layout runs instead of after the fact.
 */

/**
 * Estimated glyph width as a fraction of font-size: CJK/full-width characters
 * render roughly square (~1em), Latin/half-width characters roughly half that
 * in common sans-serif fonts. This is a rendering-time estimate (no DOM
 * measurement dependency, so it behaves identically in tests and in the app).
 */
export function estimatedCharWidth(char: string, fontSize: number): number {
  const code = char.codePointAt(0) || 0;
  const isFullWidth =
    (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0xa4cf) || // CJK radicals, Kangxi, Hiragana/Katakana, CJK Unified
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0xff00 && code <= 0xffef); // Fullwidth forms
  return fontSize * (isFullWidth ? 1 : 0.56);
}

export interface WrappedNodeText {
  lines: string[];
  lineHeight: number;
}

/**
 * Word/character-wraps node text to fit within maxWidth (minus horizontal
 * padding), matching how the live canvas naturally wraps text in a
 * fixed-width, auto-height node.
 */
export function wrapNodeText(text: string, maxWidth: number, fontSize: number): WrappedNodeText {
  const usableWidth = Math.max(maxWidth - 16, fontSize * 2);
  const lineHeight = Math.round(fontSize * 1.35);
  const words = text.split(/(\s+)/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = '';
  let currentWidth = 0;

  const pushCurrent = () => {
    if (current.trim().length > 0) lines.push(current.trim());
    current = '';
    currentWidth = 0;
  };

  for (const word of words) {
    const wordWidth = [...word].reduce((sum, ch) => sum + estimatedCharWidth(ch, fontSize), 0);
    if (wordWidth > usableWidth) {
      // A single "word" (e.g. an unbroken run of CJK characters) longer than
      // one line's width: break it character-by-character.
      for (const ch of word) {
        const chWidth = estimatedCharWidth(ch, fontSize);
        if (currentWidth + chWidth > usableWidth && current.length > 0) {
          pushCurrent();
        }
        current += ch;
        currentWidth += chWidth;
      }
      continue;
    }
    if (currentWidth + wordWidth > usableWidth && current.length > 0) {
      pushCurrent();
    }
    current += word;
    currentWidth += wordWidth;
  }
  pushCurrent();

  return { lines: lines.length > 0 ? lines : [''], lineHeight };
}

export interface TextAwareNodeSize {
  width: number;
  height: number;
}

/**
 * Derives a node's text-first auto width with a single-line bias.
 * Short text hugs its content; medium sentences form wide capsule nodes up to
 * a reasonable ceiling (e.g. 360px); very long text wraps into multiple lines.
 */
export function computeTextFirstAutoWidth(
  text: string,
  fontSize: number = 14,
  minWidth: number = 90,
  maxWidth: number = 360
): number {
  const contentWidth =
    [...text].reduce((sum, ch) => sum + estimatedCharWidth(ch, fontSize), 0) + 28;
  return Math.max(minWidth, Math.min(maxWidth, Math.ceil(contentWidth)));
}

/**
 * The node's real footprint for a given declared width or text-first auto width.
 * If options.width is provided (e.g. explicit manualSize.width), that width wins.
 * Otherwise, text-first auto-sizing is computed with single-line bias and a 360px ceiling.
 * Height is derived from text wrapping at the resolved width.
 */
export function computeTextAwareNodeSize(
  text: string,
  options: { width?: number; fontSize?: number; minWidth?: number; maxWidth?: number } = {}
): TextAwareNodeSize {
  const fontSize = options.fontSize || 14;
  const width =
    options.width && options.width > 0
      ? options.width
      : computeTextFirstAutoWidth(text || '', fontSize, options.minWidth, options.maxWidth);
  const { lines, lineHeight } = wrapNodeText(text || '', width, fontSize);
  const height = Math.max(44, lines.length * lineHeight + 16);
  return { width, height };
}

/**
 * M1-C Geometry Convergence predicate.
 *
 * Returns `true` when a node's canonical `geometry.height` agrees with
 * what `computeTextAwareNodeSize` (and therefore `computeEffectiveNodeBoxes`
 * in the exporter) would derive for the same text, width, and font size —
 * i.e. the layout engine and the exporter are looking at the same size.
 *
 * Tolerance: 1 pixel (integer rounding in `Math.round(fontSize * 1.35)` can
 * cause ±1px differences on certain font sizes; anything larger than that
 * indicates a real divergence).
 *
 * This is a pure predicate — no side effects, no imports from layout or
 * adapter modules — so acceptance tests can import it without touching any
 * rendering layer.
 *
 * Note on Divergence A (Canvas DOM): the Canvas layer passes
 * `node.geometry.width`/`height` as React Flow `style.width`/`height` and
 * renders text as `break-words` inside that container. In a live browser
 * the DOM may overflow the container if the real rendered font metrics
 * differ from the `estimatedCharWidth` model (Latin: 0.56em, CJK: 1em).
 * This divergence cannot be tested in a Vitest/Node environment (no DOM
 * text layout); it is documented here as the known residual gap between the
 * canonical geometry contract and live Canvas rendering.
 *
 * @param node - A CanonicalNode as written by the V2 layout engine (after
 *   `autoLayoutDocument` has run with preset:'balanced').
 */
export function nodeGeometryConverges(node: {
  text: string;
  geometry: { width?: number; height?: number };
  style?: { fontSize?: number };
}): boolean {
  const declaredHeight = node.geometry.height ?? 44;
  const expected = computeTextAwareNodeSize(node.text || '', {
    width: node.geometry.width,
    fontSize: node.style?.fontSize,
  });
  return Math.abs(declaredHeight - expected.height) <= 1;
}

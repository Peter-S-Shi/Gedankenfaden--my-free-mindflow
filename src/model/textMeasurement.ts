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
 * The node's real footprint for a given declared width: same width back
 * (production nodes don't auto-grow width today — canvas and export both
 * already assume a fixed declared width), height grown to fit the wrapped
 * text, using the exact same growth formula `computeEffectiveNodeBoxes`
 * (export) uses, so a node "looks the same size" whether you're laying it
 * out or exporting it.
 */
export function computeTextAwareNodeSize(
  text: string,
  options: { width?: number; fontSize?: number } = {}
): TextAwareNodeSize {
  const width = options.width || 150;
  const fontSize = options.fontSize || 14;
  const { lines, lineHeight } = wrapNodeText(text || '', width, fontSize);
  const height = Math.max(44, lines.length * lineHeight + 16);
  return { width, height };
}

/**
 * PROTOTYPE (M0 gate) -- throwaway. Not wired into production import/layout.
 *
 * Contract invariant #8: node geometry must be text-aware *before* layout
 * runs, not the current production behaviour of a fixed 150x44 (or
 * importer's 140x40) box regardless of text length, with wrapping only
 * discovered later at export time (Ledger #8/F07). Reuses the exact same
 * CJK/Latin char-width heuristic and wrapping algorithm export already
 * uses (`src/export/exporter.ts`) so a node's in-canvas footprint and its
 * exported footprint agree.
 */
import { estimatedCharWidth, wrapNodeText } from '../../export/exporter';

export interface TextAwareSizeInput {
  id: string;
  text: string;
  fontSize?: number;
}

export interface TextAwareSize {
  width: number;
  height: number;
}

const MAX_NODE_WIDTH = 220;
const MIN_NODE_WIDTH = 90;
const NODE_PADDING_X = 16;
const NODE_PADDING_Y = 16;

/**
 * Picks a width that fits the text on one line up to MAX_NODE_WIDTH (so
 * short labels stay compact instead of always maxing out), then wraps at
 * that width to derive height. Mirrors how a real auto-sizing node would
 * behave: grow width first, then wrap and grow height once the width cap
 * is hit.
 */
export function computeTextAwareSize(input: TextAwareSizeInput): TextAwareSize {
  const fontSize = input.fontSize ?? 14;
  const text = input.text || '';
  const naturalWidth =
    [...text].reduce((sum, ch) => sum + estimatedCharWidth(ch, fontSize), 0) + NODE_PADDING_X;
  const width = Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, Math.ceil(naturalWidth)));

  const { lines, lineHeight } = wrapNodeText(text, width, fontSize);
  const height = Math.max(44, lines.length * lineHeight + NODE_PADDING_Y);

  return { width, height };
}

export function applyTextAwareSizes<T extends TextAwareSizeInput>(
  inputs: T[]
): Map<string, TextAwareSize> {
  const sizes = new Map<string, TextAwareSize>();
  for (const input of inputs) {
    sizes.set(input.id, computeTextAwareSize(input));
  }
  return sizes;
}

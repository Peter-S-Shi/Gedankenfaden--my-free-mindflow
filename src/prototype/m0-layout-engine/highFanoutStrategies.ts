/**
 * PROTOTYPE (M0 Corrective Gate) -- throwaway. Not wired into production.
 *
 * M0's first pass treated "same hierarchy depth = exact same x-band" as an
 * absolute rule, discovered it makes extreme fan-out (one parent, 60 direct
 * children) pile into a single pathological tall column, and reported that
 * finding without proposing a fix -- deferring "edge routing" as someone
 * else's problem. The corrective brief asks for the missing piece: an
 * *explicit, bounded* exception for the fan-out case, not a silent global
 * hack like the old sqrt-rows patch (which broke the band invariant for
 * *every* topology and stole column budget from unrelated siblings).
 *
 * Two candidate local-packing strategies for ONE pathological parent's
 * direct children, both scoped so the exception cannot leak into siblings
 * or grandchildren the way the old bug did:
 *
 *  - `packChildrenGrid`: a compact 2D micro-grid local to this parent only.
 *    Deliberately departs from "one shared x per depth" for *this parent's*
 *    children -- documented as a bounded exception, not hidden.
 *  - `packChildrenRadial`: children ringed around the parent at a fixed
 *    radius, angle-spaced. No column concept at all for this cluster.
 *
 * Both return positions relative to the parent at (0,0); the caller
 * (`prototypeAAdaptive.ts`) offsets them into the real document and keeps
 * normal per-depth banding for any of *their* children (grandchildren of
 * the fan-out parent resume the ordinary rule from wherever their own
 * parent cell landed).
 */
import { ProtoNodeInput, SizeOf } from './treeUtils';

export interface RelativeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Roughly-square grid: `cols = ceil(sqrt(n))`. Each column's x is the
 * cumulative max width of prior columns (so variable text-aware widths
 * don't cause overlap); each row's y within a column is similarly packed
 * by max row height. The grid's own bounding box is then centered on the
 * parent (x: extends outward on `side`; y: centered on 0).
 */
export function packChildrenGrid(
  children: ProtoNodeInput[],
  sizeOf: SizeOf,
  hGap: number,
  vGap: number,
  side: 'left' | 'right'
): Map<string, RelativeBox> {
  const n = children.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));

  const grid: (ProtoNodeInput | undefined)[][] = Array.from({ length: cols }, () => []);
  children.forEach((c, i) => {
    grid[i % cols].push(c);
  });

  const colWidths = grid.map((col) => Math.max(0, ...col.filter(Boolean).map((c) => sizeOf(c!.id).width)));
  const rowHeightsByCol = grid.map((col) => col.map((c) => sizeOf(c!.id).height));
  const colTotalHeight = rowHeightsByCol.map((hs) => hs.reduce((s, h) => s + h, 0) + vGap * Math.max(0, hs.length - 1));
  const gridHeight = Math.max(...colTotalHeight);

  const result = new Map<string, RelativeBox>();
  let cumulativeX = 0;
  for (let col = 0; col < cols; col++) {
    const colW = colWidths[col] || 0;
    let cursorY = -colTotalHeight[col] / 2; // each column vertically centered on 0 independently, then...
    // ...re-centered against the tallest column so the whole grid is
    // centered on the parent, not just each column on itself.
    const colOffsetY = (gridHeight - colTotalHeight[col]) / 2;
    for (const child of grid[col]) {
      if (!child) continue;
      const size = sizeOf(child.id);
      const x = side === 'right' ? cumulativeX : -(cumulativeX + colW);
      result.set(child.id, { x, y: cursorY + colOffsetY - gridHeight / 2 + colTotalHeight[col] / 2, width: size.width, height: size.height });
      cursorY += size.height + vGap;
    }
    cumulativeX += colW + hGap;
  }
  return result;
}

/**
 * Full-circle radial ring around the parent. Radius is picked so adjacent
 * children (by arc length at that radius) clear each other's rendered
 * width, using the largest child as a conservative bound.
 */
export function packChildrenRadial(children: ProtoNodeInput[], sizeOf: SizeOf, hGap: number, vGap: number): Map<string, RelativeBox> {
  const n = children.length;
  const maxDim = Math.max(...children.map((c) => Math.max(sizeOf(c.id).width, sizeOf(c.id).height)), 44);
  const minCircumference = n * (maxDim + vGap);
  const radius = Math.max(maxDim, minCircumference / (2 * Math.PI)) + hGap;

  const result = new Map<string, RelativeBox>();
  children.forEach((c, i) => {
    const angle = (i / n) * 2 * Math.PI;
    const size = sizeOf(c.id);
    const cx = radius * Math.cos(angle);
    const cy = radius * Math.sin(angle);
    result.set(c.id, { x: cx - size.width / 2, y: cy - size.height / 2, width: size.width, height: size.height });
  });
  return result;
}

export function boundingHeight(boxes: Map<string, RelativeBox>): number {
  const ys = [...boxes.values()].flatMap((b) => [b.y, b.y + b.height]);
  return Math.max(...ys) - Math.min(...ys);
}

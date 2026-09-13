/**
 * PROTOTYPE (M0 gate) -- throwaway. Not wired into production import/layout.
 *
 * Executable form of the Mind Map Layout Contract agreed for
 * v2-layout-engine-reconstruction / PR #18, M0. Each invariant below is
 * translated into a quantifiable metric so prototypes A and B (and the
 * current production engine, as a baseline) can be compared on the same
 * numbers rather than eyeballed screenshots.
 *
 * Contract (source of truth -- keep this list and the metrics below in sync):
 *  1. hierarchy depth determines primary growth direction (LR: x/column).
 *  2. same-depth nodes share a consistent band (column x-coordinate).
 *  3. every subtree has an independent footprint (no cross-subtree overlap).
 *  4. a sibling subtree must not consume hierarchy-depth/column budget that
 *     belongs to a later sibling.
 *  5. a parent sits at the visual center of its direct children / subtree.
 *  6. bilateral (left/right) balance is by subtree footprint, not index.
 *  7. high fan-out keeps same-depth-band semantics (no fake extra columns).
 *  8. node geometry is text-aware *before* layout runs.
 *  9. edges should not cross through unrelated nodes.
 * 10. collapse/expand and incremental edits should stay mental-map-stable
 *     (same input always lays out the same way; deterministic).
 */

export interface PositionedNode {
  id: string;
  parentId?: string;
  depth: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedEdge {
  source: string;
  target: string;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
}

export interface LayoutMetrics {
  nodeCount: number;
  maxDepth: number;
  totalCanvasArea: number;
  aspectRatio: number;
  maxParentChildEdgeLength: number;
  sameDepthBandDeviation: number;
  nodeOverlapCount: number;
  edgeThroughNodeCount: number;
  subtreeOverlapCount: number;
  leftRightFootprintImbalance: number;
  siblingConsumesDepthBudget: boolean;
  parentCenteringError: number;
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function centerX(n: PositionedNode) {
  return n.x + n.width / 2;
}
function centerY(n: PositionedNode) {
  return n.y + n.height / 2;
}

/** Computes every contract metric for one laid-out document. */
export function computeLayoutMetrics(result: LayoutResult): LayoutMetrics {
  const { nodes, edges } = result;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const minX = Math.min(...nodes.map((n) => n.x));
  const maxX = Math.max(...nodes.map((n) => n.x + n.width));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxY = Math.max(...nodes.map((n) => n.y + n.height));
  const canvasWidth = maxX - minX;
  const canvasHeight = maxY - minY;

  // (1)/(2): same-depth band deviation -- stdev of x among nodes sharing a
  // depth AND side (left/right of root), since LR mind maps grow outward in
  // both directions from a shared root column.
  const rootId = nodes.find((n) => !n.parentId)?.id;
  const root = rootId ? byId.get(rootId) : undefined;
  const side = (n: PositionedNode) => (root ? (centerX(n) >= centerX(root) ? 'right' : 'left') : 'right');

  const bandGroups = new Map<string, PositionedNode[]>();
  for (const n of nodes) {
    if (n.depth === 0) continue;
    const key = `${side(n)}:${n.depth}`;
    const list = bandGroups.get(key) || [];
    list.push(n);
    bandGroups.set(key, list);
  }
  // Compare the edge that actually faces the parent/root column (left edge
  // for right-growing bands, right edge for left-growing bands), since
  // that's the edge a real "shared column line" would align to.
  let bandDeviationSum = 0;
  let bandGroupCount = 0;
  for (const [key, group] of bandGroups) {
    const isRight = key.startsWith('right:');
    const xs = group.map((n) => (isRight ? n.x : n.x + n.width));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length;
    bandDeviationSum += Math.sqrt(variance);
    bandGroupCount++;
  }
  const sameDepthBandDeviation = bandGroupCount > 0 ? bandDeviationSum / bandGroupCount : 0;

  // (9)/general: node-node overlap count (excludes a node against itself).
  let nodeOverlapCount = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (rectsOverlap(nodes[i], nodes[j])) nodeOverlapCount++;
    }
  }

  // max parent-child edge length (straight-line, center to center).
  let maxParentChildEdgeLength = 0;
  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    const len = Math.hypot(centerX(t) - centerX(s), centerY(t) - centerY(s));
    if (len > maxParentChildEdgeLength) maxParentChildEdgeLength = len;
  }

  // (9) edge-through-node: does an edge's straight segment pass through the
  // bounding box of a node that is neither its source nor its target?
  let edgeThroughNodeCount = 0;
  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    const sx = centerX(s);
    const sy = centerY(s);
    const tx = centerX(t);
    const ty = centerY(t);
    for (const n of nodes) {
      if (n.id === e.source || n.id === e.target) continue;
      if (segmentIntersectsRect(sx, sy, tx, ty, n)) edgeThroughNodeCount++;
    }
  }

  // (3) subtree overlap: bounding box of each direct child's whole subtree
  // must not overlap a sibling subtree's bounding box.
  const childrenOf = new Map<string, PositionedNode[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = childrenOf.get(n.parentId) || [];
    list.push(n);
    childrenOf.set(n.parentId, list);
  }
  const subtreeBBoxCache = new Map<string, { x: number; y: number; width: number; height: number }>();
  function subtreeBBox(id: string): { x: number; y: number; width: number; height: number } {
    const cached = subtreeBBoxCache.get(id);
    if (cached) return cached;
    const n = byId.get(id)!;
    let bx0 = n.x, by0 = n.y, bx1 = n.x + n.width, by1 = n.y + n.height;
    for (const child of childrenOf.get(id) || []) {
      const cb = subtreeBBox(child.id);
      bx0 = Math.min(bx0, cb.x);
      by0 = Math.min(by0, cb.y);
      bx1 = Math.max(bx1, cb.x + cb.width);
      by1 = Math.max(by1, cb.y + cb.height);
    }
    const box = { x: bx0, y: by0, width: bx1 - bx0, height: by1 - by0 };
    subtreeBBoxCache.set(id, box);
    return box;
  }
  let subtreeOverlapCount = 0;
  for (const siblings of childrenOf.values()) {
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        if (rectsOverlap(subtreeBBox(siblings[i].id), subtreeBBox(siblings[j].id))) subtreeOverlapCount++;
      }
    }
  }

  // (6) left/right footprint imbalance: |sum(right subtree heights) -
  // sum(left subtree heights)| relative to the larger side.
  let leftFootprint = 0;
  let rightFootprint = 0;
  if (root) {
    for (const child of childrenOf.get(root.id) || []) {
      const bbox = subtreeBBox(child.id);
      if (side(child) === 'left') leftFootprint += bbox.height;
      else rightFootprint += bbox.height;
    }
  }
  const largerSide = Math.max(leftFootprint, rightFootprint);
  const leftRightFootprintImbalance = largerSide > 0 ? Math.abs(rightFootprint - leftFootprint) / largerSide : 0;

  // (4) sibling-consumes-depth-budget: true if two level-1 siblings on the
  // SAME side end up in different columns purely because of processing
  // order/prior-sibling subtree size, rather than their own depth. Detected
  // as: two nodes at the same hierarchy depth and same side whose x differs
  // by more than one column stride's worth of tolerance.
  const columnStride = Math.max(...nodes.map((n) => n.width)) + 40;
  let siblingConsumesDepthBudget = false;
  for (const [key, group] of bandGroups) {
    const isRight = key.startsWith('right:');
    const xs = group.map((n) => (isRight ? n.x : n.x + n.width));
    const spread = Math.max(...xs) - Math.min(...xs);
    if (spread > columnStride * 0.5) siblingConsumesDepthBudget = true;
  }

  // (5) parent centering error: average |parentCenterY - mean(childCenterY
  // min, max)| across all parents with >=1 child, normalized by that
  // parent's own subtree footprint height.
  let centeringErrorSum = 0;
  let centeringSamples = 0;
  for (const [parentId, children] of childrenOf) {
    const parent = byId.get(parentId);
    if (!parent || children.length === 0) continue;
    const ys = children.map(centerY);
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    const footprint = subtreeBBox(parentId).height || 1;
    centeringErrorSum += Math.abs(centerY(parent) - mid) / footprint;
    centeringSamples++;
  }
  const parentCenteringError = centeringSamples > 0 ? centeringErrorSum / centeringSamples : 0;

  const maxDepth = Math.max(...nodes.map((n) => n.depth));

  return {
    nodeCount: nodes.length,
    maxDepth,
    totalCanvasArea: canvasWidth * canvasHeight,
    aspectRatio: canvasHeight > 0 ? canvasWidth / canvasHeight : 0,
    maxParentChildEdgeLength,
    sameDepthBandDeviation,
    nodeOverlapCount,
    edgeThroughNodeCount,
    subtreeOverlapCount,
    leftRightFootprintImbalance,
    siblingConsumesDepthBudget,
    parentCenteringError,
  };
}

function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  // Shrink the rect slightly so an edge merely touching a node's border
  // (as it must, at source/target) isn't counted as "through" an unrelated
  // node sitting immediately adjacent to it.
  const pad = 2;
  const rx0 = rect.x + pad;
  const ry0 = rect.y + pad;
  const rx1 = rect.x + rect.width - pad;
  const ry1 = rect.y + rect.height - pad;
  if (rx1 <= rx0 || ry1 <= ry0) return false;

  // Liang-Barsky segment/rect clip test.
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const checks: [number, number][] = [
    [-dx, x1 - rx0],
    [dx, rx1 - x1],
    [-dy, y1 - ry0],
    [dy, ry1 - y1],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 < t1;
}

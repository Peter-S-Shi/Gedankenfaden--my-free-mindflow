/**
 * Production mind-map layout engine (M1-A).
 *
 * Built from the M0 Architecture Decision (Prototype A, "parent-local
 * recursive packing" — see `src/prototype/m0-layout-engine/M0_REPORT.md`
 * §6), reimplemented as a production module rather than copied wholesale:
 * real `CanonicalDocument`/`CanonicalNode` types, the shared
 * `textMeasurement` module instead of a prototype-local size helper, and
 * doc comments aimed at a maintainer rather than at an A/B comparison.
 *
 * Interface (the seam): `layoutMindMapEngineV2(doc, options) ->
 * CanonicalDocument`, the same shape as the legacy
 * `layoutMindMapDocument()` in `layout.ts`, so the two can be swapped or
 * run side-by-side for comparison (`compareLayoutEngines` below) without
 * either the importer or the canvas changing. Neither is wired into
 * `autoLayoutDocument()` as the new default yet — that's M1-B's job,
 * after integration acceptance.
 *
 * Scope: this engine only handles the "balanced" bidirectional mind-map
 * case (children fan out left and right from a central root) — the case
 * M0's whole contract and corpus is about. The legacy engine's single-
 * direction presets (`LR`/`RL`/`TB`) are not migrated; asking this engine
 * for one throws rather than silently mishandling it.
 *
 * What this module is responsible for (its depth): given a hierarchy
 * (nodes with `parentId`) and each node's text, it decides every node's
 * `geometry` — column (from hierarchy depth), row (from footprint-based
 * packing), and side (from footprint-based bilateral balance) — while
 * preserving `collapsed` and `manualOffset` semantics. Everything below
 * (`textMeasurement`, the fan-out decision seam) is invisible to a caller;
 * they hand over a document and get one back with `geometry` filled in.
 */
import { CanonicalDocument, CanonicalNode } from './types';
import { cloneDocument } from './document';
import { computeTextAwareNodeSize } from './textMeasurement';
import { layoutMindMapDocument, LayoutOptions } from './layout';

type Side = 'left' | 'right';

/**
 * Fan-out strategy decision seam (M0's open item #1, carried forward
 * rather than hidden): when one parent's direct, same-side children
 * exceed this many, a plain single-column band starts producing badly
 * overlapping edges (M0's empirical sweep). Two candidate mitigations
 * (compact grid packing, radial packing) were prototyped but are NOT
 * production-ready (known overlap/spacing bugs, and neither addresses
 * further descendants under a fanned-out child) — see M0_REPORT.md §5.
 *
 * This constant and `decideFanoutStrategy` exist so a real strategy can
 * be wired in later without touching every call site — not as permanent
 * product truth. Today, the decision is always `'none'`: no production
 * behavior depends on this number yet.
 */
export const PROVISIONAL_FANOUT_THRESHOLD = 16;

export type FanoutStrategyId = 'none';

export interface FanoutDecision {
  strategy: FanoutStrategyId;
}

/**
 * Always returns `'none'` today. Exists as the seam a future ticket wires
 * a real strategy into, once one of M0's candidates (or a new one) is
 * production-ready — see this module's doc comment and M0_REPORT.md §5/§9.
 */
export function decideFanoutStrategy(_directChildCount: number): FanoutDecision {
  return { strategy: 'none' };
}

export interface MindMapEngineOptions extends Pick<LayoutOptions, 'horizontalGap' | 'verticalGap' | 'centerCoordinates'> {
  preset?: 'balanced';
}

/**
 * Lays out a mind-map document: hierarchy depth decides each node's
 * column, footprint-based packing decides its row, footprint-based
 * bilateral balance decides its side. Pure function of `doc` and
 * `options` — same input always produces the same geometry (the
 * mental-map-stability contract's round-trip half; see
 * `src/test/v2-m1a-mind-map-engine.test.ts`).
 */
export function layoutMindMapEngineV2(
  doc: CanonicalDocument,
  options: MindMapEngineOptions = {}
): CanonicalDocument {
  if (options.preset && options.preset !== 'balanced') {
    throw new Error(
      `layoutMindMapEngineV2 only supports the "balanced" bidirectional preset (got "${options.preset}"). ` +
        'Single-direction presets (LR/RL/TB) are not migrated from the legacy engine in M1-A.'
    );
  }

  const hGap = options.horizontalGap ?? 90;
  const vGap = options.verticalGap ?? 24;

  const nextDoc = cloneDocument(doc);
  if (nextDoc.nodes.length === 0) return nextDoc;

  const rootNode =
    nextDoc.nodes.find((n) => n.type === 'root') || nextDoc.nodes.find((n) => !n.parentId) || nextDoc.nodes[0];

  const childrenMap = buildChildrenMap(nextDoc.nodes);
  const depths = computeDepths(rootNode, childrenMap);
  const sizeOf = makeSizeOf(nextDoc.nodes);
  const collapsedIds = new Set(nextDoc.nodes.filter((n) => n.collapsed).map((n) => n.id));

  // Same formula decides "which side" (bilateral balance) and "how much
  // vertical space to reserve" (packing) -- a subtree's rendered footprint
  // can't drift between the two, unlike descendant-count weighting would.
  const footprint = computeSubtreeFootprint(nextDoc.nodes, childrenMap, sizeOf, vGap, collapsedIds);

  const rootWidth = rootNode.geometry.width || 160;
  const rootHeight = rootNode.geometry.height || 48;
  const rootX = options.centerCoordinates?.x ?? 400;
  const rootY = options.centerCoordinates?.y ?? 300;

  const nodeSide = new Map<string, Side>();
  const level1 = childrenMap.get(rootNode.id) || [];
  const { left, right } = partitionBySide(level1, footprint);
  for (const c of left) assignSideRecursive(c, 'left', childrenMap, nodeSide);
  for (const c of right) assignSideRecursive(c, 'right', childrenMap, nodeSide);

  const bandMaxWidth = computeBandMaxWidth(nextDoc.nodes, rootNode.id, depths, nodeSide, sizeOf);

  const positioned = new Map<string, { x: number; y: number; width: number; height: number }>();
  positioned.set(rootNode.id, { x: rootX, y: rootY, width: rootWidth, height: rootHeight });

  const edgeHandleAssignments = new Map<string, { sourceHandle: string; targetHandle: string }>();

  function nearEdgeX(side: Side, depth: number): number {
    let x = side === 'right' ? rootX + rootWidth + hGap : rootX - hGap;
    for (let d = 1; d < depth; d++) {
      const bandWidth = bandMaxWidth.get(`${side}:${d}`) || 150;
      x += side === 'right' ? bandWidth + hGap : -(bandWidth + hGap);
    }
    return x;
  }

  function placeChildren(parentId: string, parentCenterY: number, side: Side, depth: number) {
    if (collapsedIds.has(parentId)) return;
    // Filtering by assigned side is a no-op below the root (a node's whole
    // subtree shares one side); it's what splits root's own direct
    // children into their two wings here.
    const children = (childrenMap.get(parentId) || []).filter((c) => nodeSide.get(c.id) === side);
    if (children.length === 0) return;

    // Fan-out decision seam: consulted (so it's exercised and testable)
    // but its result isn't branched on yet -- see decideFanoutStrategy's
    // doc comment. TODO(M1-B+): once a strategy other than 'none' is
    // production-ready, branch on this result here instead of always
    // falling through to the single-column packing below.
    decideFanoutStrategy(children.length);

    const totalHeight =
      children.reduce((sum, c) => sum + (footprint.get(c.id) ?? sizeOf(c.id).height), 0) + vGap * (children.length - 1);
    let cursorY = parentCenterY - totalHeight / 2;

    for (const child of children) {
      const h = footprint.get(child.id) ?? sizeOf(child.id).height;
      const childCenterY = cursorY + h / 2;
      const size = sizeOf(child.id);
      const near = nearEdgeX(side, depth);
      const x = side === 'right' ? near : near - size.width;

      positioned.set(child.id, { x, y: childCenterY - size.height / 2, width: size.width, height: size.height });
      edgeHandleAssignments.set(`${parentId}->${child.id}`, {
        sourceHandle: side,
        targetHandle: side === 'right' ? 'left' : 'right',
      });

      placeChildren(child.id, childCenterY, side, depth + 1);
      cursorY += h + vGap;
    }
  }

  placeChildren(rootNode.id, rootY + rootHeight / 2, 'right', 1);
  placeChildren(rootNode.id, rootY + rootHeight / 2, 'left', 1);

  nextDoc.nodes = nextDoc.nodes.map((n): CanonicalNode => {
    const base = positioned.get(n.id);
    if (!base) return n;
    let x = base.x;
    let y = base.y;
    if (n.manualOffset) {
      x += n.manualOffset.dx;
      y += n.manualOffset.dy;
    }
    return { ...n, geometry: { x, y, width: base.width, height: base.height } };
  });

  nextDoc.edges = nextDoc.edges.map((edge) => {
    const handles = edgeHandleAssignments.get(`${edge.source}->${edge.target}`);
    if (!handles) return edge;
    return { ...edge, sourceHandle: handles.sourceHandle, targetHandle: handles.targetHandle, type: 'smoothstep' };
  });

  nextDoc.updatedAt = new Date().toISOString();
  return nextDoc;
}

function buildChildrenMap(nodes: CanonicalNode[]): Map<string, CanonicalNode[]> {
  const map = new Map<string, CanonicalNode[]>();
  for (const n of nodes) {
    if (!n.parentId || n.parentId === n.id) continue;
    const list = map.get(n.parentId) || [];
    list.push(n);
    map.set(n.parentId, list);
  }
  return map;
}

function computeDepths(root: CanonicalNode, childrenMap: Map<string, CanonicalNode[]>): Map<string, number> {
  const depths = new Map<string, number>();
  const stack: Array<{ node: CanonicalNode; depth: number }> = [{ node: root, depth: 0 }];
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    depths.set(node.id, depth);
    for (const child of childrenMap.get(node.id) || []) stack.push({ node: child, depth: depth + 1 });
  }
  return depths;
}

function makeSizeOf(nodes: CanonicalNode[]): (id: string) => { width: number; height: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cache = new Map<string, { width: number; height: number }>();
  return (id: string) => {
    const cached = cache.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    if (!node) return { width: 150, height: 44 };
    const declaredWidth = node.geometry.width || 150;
    const fontSize = node.style?.fontSize || 14;
    const size = computeTextAwareNodeSize(node.text || '', { width: declaredWidth, fontSize });
    cache.set(id, size);
    return size;
  };
}

/**
 * Bottom-up rendered footprint: a node's own text-aware height, or (if it
 * has visible, non-collapsed children) the larger of that and the stacked
 * total of its children's own footprints. This is the number both
 * bilateral balance and vertical packing use, so they can't disagree
 * about how much space a subtree really needs.
 */
function computeSubtreeFootprint(
  nodes: CanonicalNode[],
  childrenMap: Map<string, CanonicalNode[]>,
  sizeOf: (id: string) => { width: number; height: number },
  vGap: number,
  collapsedIds: Set<string>
): Map<string, number> {
  const footprint = new Map<string, number>();
  function footprintOf(id: string): number {
    const cached = footprint.get(id);
    if (cached !== undefined) return cached;
    const own = sizeOf(id).height;
    const children = childrenMap.get(id) || [];
    let value: number;
    if (children.length === 0 || collapsedIds.has(id)) {
      value = own;
    } else {
      const childrenTotal = children.reduce((sum, c) => sum + footprintOf(c.id), 0) + vGap * (children.length - 1);
      value = Math.max(own, childrenTotal);
    }
    footprint.set(id, value);
    return value;
  }
  for (const n of nodes) footprintOf(n.id);
  return footprint;
}

/**
 * Greedy longest-processing-time bin balance over footprint weight:
 * sort level-1 children by descending footprint, always add the next one
 * to the currently lighter side. Balances rendered size, not descendant
 * count or index parity.
 */
function partitionBySide(
  level1Children: CanonicalNode[],
  footprint: Map<string, number>
): { left: CanonicalNode[]; right: CanonicalNode[] } {
  const sorted = [...level1Children].sort((a, b) => (footprint.get(b.id) || 1) - (footprint.get(a.id) || 1));
  const left: CanonicalNode[] = [];
  const right: CanonicalNode[] = [];
  let leftWeight = 0;
  let rightWeight = 0;
  for (const child of sorted) {
    const w = footprint.get(child.id) || 1;
    if (rightWeight <= leftWeight) {
      right.push(child);
      rightWeight += w;
    } else {
      left.push(child);
      leftWeight += w;
    }
  }
  return { left, right };
}

function assignSideRecursive(
  node: CanonicalNode,
  side: Side,
  childrenMap: Map<string, CanonicalNode[]>,
  nodeSide: Map<string, Side>
) {
  nodeSide.set(node.id, side);
  for (const child of childrenMap.get(node.id) || []) assignSideRecursive(child, side, childrenMap, nodeSide);
}

/**
 * Per (side, depth) band shares one x line: the max node width seen at
 * that band decides how far the next band starts, so every node at that
 * depth/side aligns on the edge facing the root regardless of its own
 * (text-aware, so variable) width.
 */
function computeBandMaxWidth(
  nodes: CanonicalNode[],
  rootId: string,
  depths: Map<string, number>,
  nodeSide: Map<string, Side>,
  sizeOf: (id: string) => { width: number; height: number }
): Map<string, number> {
  const bandMaxWidth = new Map<string, number>();
  for (const n of nodes) {
    if (n.id === rootId) continue;
    const side = nodeSide.get(n.id) || 'right';
    const depth = depths.get(n.id);
    if (depth === undefined) continue;
    const key = `${side}:${depth}`;
    bandMaxWidth.set(key, Math.max(bandMaxWidth.get(key) || 0, sizeOf(n.id).width));
  }
  return bandMaxWidth;
}

export interface EngineComparisonResult {
  legacy: CanonicalDocument;
  v2: CanonicalDocument;
}

/**
 * Runs both engines on the same input document for side-by-side
 * comparison during M1-A/M1-B, without either being the "real" default
 * yet. `layout.ts` does not import this module, so this direction is not
 * a cycle.
 */
export function compareLayoutEngines(doc: CanonicalDocument, options: MindMapEngineOptions = {}): EngineComparisonResult {
  return {
    legacy: layoutMindMapDocument(doc, {
      preset: 'balanced',
      horizontalGap: options.horizontalGap,
      verticalGap: options.verticalGap,
      centerCoordinates: options.centerCoordinates,
    }),
    v2: layoutMindMapEngineV2(doc, options),
  };
}

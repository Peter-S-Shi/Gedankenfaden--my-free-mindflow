/**
 * Production mind-map layout engine (M1-A, extended in M1-D).
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
 * `layoutMindMapDocument()` in `layout.ts`, so the two can be swapped
 * without either the importer or the canvas changing. This module does
 * NOT import `layout.ts` — that would create the exact cycle M1-B needs
 * to avoid when it makes `layout.ts -> mindMapLayoutEngine.ts` a one-way
 * dependency. Side-by-side comparison between the two engines belongs in
 * a test/acceptance helper (see `v2-m1a-mind-map-engine.test.ts`), which
 * is free to import both; this module only exports its own engine.
 * M1-B wires this engine into `autoLayoutDocument()` for balanced mind-map
 * dispatch only; flowcharts and single-direction mind-map presets still
 * stay on their existing layout paths.
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
 * (`textMeasurement`, the fan-out decision seam, incremental-edit
 * stabilization) is invisible to a caller; they hand over a document and
 * get one back with `geometry` filled in.
 *
 * M1-D adds two production contracts on top of M1-A/B/C, both scoped as
 * bounded extensions of this same pure function rather than a rewrite:
 *
 * 1. High fan-out (`decideFanoutStrategy` / `placeChildrenGrid`): when one
 *    parent's same-side direct children exceed
 *    `FANOUT_GRID_ACTIVATION_THRESHOLD`, they are packed into a balanced
 *    multi-column grid instead of one long single column. See that
 *    function's doc comment for the evidence this threshold and strategy
 *    are based on, and its KNOWN RESIDUAL LIMITATION note for the one
 *    scenario (a fanned child that itself has further descendants) this
 *    bounded extension does not fully close -- unexercised in M0's own
 *    evidence, where every fanned child was a leaf.
 * 2. Incremental-edit stability (`options.stabilizeAgainst`, M0/M1
 *    open item #10c): an OPTIONAL second document — the caller's own
 *    prior layout output — that this function uses only to decide which
 *    already-existing, structurally-unchanged nodes to leave at their
 *    exact previous position, rather than recomputing everyone from
 *    scratch every call. The function stays pure (same two inputs ->
 *    same output); no new persistent state is introduced. When
 *    `stabilizeAgainst` is omitted, behavior is byte-for-byte identical
 *    to the M1-A/B/C engine.
 */
import { CanonicalDocument, CanonicalNode } from './types';
import { cloneDocument } from './document';
import { computeTextAwareNodeSize } from './textMeasurement';

type Side = 'left' | 'right';

/**
 * Fan-out activation threshold (M0's open item #1, now closed for the
 * common case): M0's empirical sweep (`src/prototype/m0-layout-engine/
 * fanoutStrategy.test.ts`, summarized in M0_REPORT.md §5) measured plain
 * single-column banding's `edgeThroughNodeCount` starting to degrade at
 * n≈16 direct same-side children (8 crossings) and becoming clearly bad
 * by n≈24-40 (20-62 crossings; 302 on the real 60-node fixture at aspect
 * ratio 0.15). 16 is that measured knee, not an arbitrary round number.
 */
export const FANOUT_GRID_ACTIVATION_THRESHOLD = 16;

/** @deprecated Use `FANOUT_GRID_ACTIVATION_THRESHOLD`. Kept as an alias so any external reference from the M0/M1-A era still resolves. */
export const PROVISIONAL_FANOUT_THRESHOLD = FANOUT_GRID_ACTIVATION_THRESHOLD;

export type FanoutStrategyId = 'none' | 'grid';

export interface FanoutDecision {
  strategy: FanoutStrategyId;
}

/**
 * `'grid'` once same-side direct-child count exceeds
 * `FANOUT_GRID_ACTIVATION_THRESHOLD`, else `'none'` (plain single-column
 * banding, unchanged from M1-A/B/C).
 *
 * `'grid'` is a corrected reimplementation of M0's `packChildrenGrid`
 * prototype, not a promotion of that prototype as-is: M0 measured two
 * concrete bugs in it — round-robin column assignment ignoring subtree
 * size (causing column-height imbalance) and an "imperfect centering
 * formula" producing 2-4 node overlaps (M0_REPORT.md §5, §9). Both are
 * fixed here by reusing pieces already proven correct in this file:
 * LPT footprint-balanced column assignment (the same algorithm
 * `partitionBySide` already uses for left/right, generalized to k
 * columns) and per-column centering via the exact same single-column
 * centering formula the 'none' strategy already uses, applied once per
 * column instead of once per whole band.
 *
 * `radial` was measured too (M0_REPORT.md §5) but is NOT promoted here:
 * its single global-radius formula produced 20-30 overlapping nodes at
 * scale and 10x the canvas area of grid on the real 60-node fixture —
 * a worse correctness/cost tradeoff than grid's bugs, which are fixable
 * with algorithms this file already has.
 */
export function decideFanoutStrategy(directChildCount: number): FanoutDecision {
  return { strategy: directChildCount > FANOUT_GRID_ACTIVATION_THRESHOLD ? 'grid' : 'none' };
}

export interface MindMapEngineOptions {
  horizontalGap?: number;
  verticalGap?: number;
  centerCoordinates?: { x: number; y: number };
  preset?: 'balanced';
  /**
   * M0/M1 open item #10c (incremental-edit mental-map stability): the
   * caller's own prior layout output for this same document (i.e. what a
   * previous `layoutMindMapEngineV2` call returned, before the caller's
   * latest edit). When provided, any node whose own size/collapse state
   * and *entire descendant subtree* are unchanged from that prior
   * document keeps its exact previous position -- untouched by edits
   * made elsewhere in the tree. Nodes that changed, or are brand new,
   * are freshly positioned next to their nearest still-anchored sibling
   * rather than as part of one shared parent-centered stack.
   *
   * This is an explicit, bounded, opt-in extension of an otherwise pure
   * function -- omitting it (the default) reproduces the exact M1-A/B/C
   * behavior. See CONTEXT.md's "Incremental-edit stabilization" entry
   * for the accepted tradeoff this makes against strict parent-centering
   * for the *edited* branch (unrelated branches are never affected).
   *
   * Not applied to a parent whose children are in the 'grid' fan-out
   * regime (see CONTEXT.md's "Fan-out/stabilization interaction" entry)
   * -- that is a deliberate, documented scope boundary, not a bug.
   */
  stabilizeAgainst?: CanonicalDocument;
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

  // The root follows the same text-aware geometry contract as every other
  // node (contract invariant #8) -- no fixed/declared-box exception.
  const rootSize = sizeOf(rootNode.id);
  const rootWidth = rootSize.width;
  const rootHeight = rootSize.height;
  const rootX = options.centerCoordinates?.x ?? 400;
  const rootY = options.centerCoordinates?.y ?? 300;

  // --- Incremental-edit stabilization setup (#10c) -----------------------
  // Everything in this block is only ever consulted; when
  // `options.stabilizeAgainst` is absent, `anchor` is `null` and every
  // stabilization branch below falls through to the original, unmodified
  // M1-A/B/C computation.
  const anchor = options.stabilizeAgainst
    ? buildAnchorContext(options.stabilizeAgainst, nextDoc.nodes, childrenMap, sizeOf, collapsedIds)
    : null;

  const nodeSide = new Map<string, Side>();
  const level1 = childrenMap.get(rootNode.id) || [];
  if (anchor) {
    assignSidesAnchored(level1, footprint, anchor, rootNode.id, nodeSide);
  } else {
    const { left, right } = partitionBySide(level1, footprint);
    for (const c of left) nodeSide.set(c.id, 'left');
    for (const c of right) nodeSide.set(c.id, 'right');
  }
  for (const c of level1) assignSideRecursive(c, nodeSide.get(c.id)!, childrenMap, nodeSide);

  // Collapsed descendants stay in doc.nodes with stale geometry, but must
  // not participate in any *visible* layout calculation -- a hidden node's
  // (possibly very wide) text must not inflate the band its ancestor's
  // visible siblings render in. computeBandMaxWidth is restricted to nodes
  // actually reachable without crossing a collapsed ancestor.
  const visibleIds = computeVisibleIds(rootNode.id, childrenMap, collapsedIds);
  const bandMaxWidth = computeBandMaxWidth(nextDoc.nodes, rootNode.id, depths, nodeSide, sizeOf, visibleIds);

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

  function placeSingleChild(child: CanonicalNode, centerY: number, side: Side, depth: number, localAnchorX?: number) {
    const size = sizeOf(child.id);
    const near = localAnchorX ?? nearEdgeX(side, depth);
    const x = side === 'right' ? near : near - size.width;
    positioned.set(child.id, { x, y: centerY - size.height / 2, width: size.width, height: size.height });
    edgeHandleAssignments.set(`${parentEdgeKeyOf(child)}`, {
      sourceHandle: side,
      targetHandle: side === 'right' ? 'left' : 'right',
    });
    // Once a subtree is anchored to a *local* x (because an ancestor was a
    // fan-out grid column, not the global per-depth band), every further
    // descendant stays parent-local too -- computed from this node's own
    // near edge, never falling back to the global band it never belonged
    // to. Ordinary (non-fanned) nodes keep `localAnchorX` undefined all the
    // way down, reproducing the exact M1-A/B/C global-band behavior.
    const childLocalAnchor = localAnchorX !== undefined ? (side === 'right' ? x + size.width + hGap : x - hGap) : undefined;
    placeChildren(child.id, centerY, side, depth + 1, childLocalAnchor);
  }

  function parentEdgeKeyOf(child: CanonicalNode): string {
    return `${child.parentId}->${child.id}`;
  }

  /** Bulk-copies a fully-stable subtree's positions from `anchor` verbatim (see buildAnchorContext). */
  function bulkCopySubtree(nodeId: string, side: Side) {
    const prevNode = anchor!.prevById.get(nodeId)!;
    const baseX = prevNode.geometry.x - (prevNode.manualOffset?.dx || 0);
    const baseY = prevNode.geometry.y - (prevNode.manualOffset?.dy || 0);
    positioned.set(nodeId, {
      x: baseX,
      y: baseY,
      width: prevNode.geometry.width || sizeOf(nodeId).width,
      height: prevNode.geometry.height || sizeOf(nodeId).height,
    });
    for (const child of childrenMap.get(nodeId) || []) {
      edgeHandleAssignments.set(`${nodeId}->${child.id}`, {
        sourceHandle: side,
        targetHandle: side === 'right' ? 'left' : 'right',
      });
      bulkCopySubtree(child.id, side);
    }
  }

  function placeChildren(parentId: string, parentCenterY: number, side: Side, depth: number, localAnchorX?: number) {
    if (collapsedIds.has(parentId)) return;
    // Filtering by assigned side is a no-op below the root (a node's whole
    // subtree shares one side); it's what splits root's own direct
    // children into their two wings here.
    const children = (childrenMap.get(parentId) || []).filter((c) => nodeSide.get(c.id) === side);
    if (children.length === 0) return;

    const fanoutDecision = decideFanoutStrategy(children.length);

    if (fanoutDecision.strategy === 'grid') {
      // Fan-out regime: this parent's own direct children are repacked as
      // a balanced grid every call, regardless of `stabilizeAgainst` --
      // see `MindMapEngineOptions.stabilizeAgainst`'s doc comment and
      // CONTEXT.md's "Fan-out/stabilization interaction" entry for why
      // this is a deliberate scope boundary rather than a gap.
      placeChildrenGrid(children, parentCenterY, side, depth, localAnchorX);
      return;
    }

    if (anchor) {
      placeChildrenAnchored(children, parentCenterY, side, depth, localAnchorX);
      return;
    }

    placeChildrenSingleColumn(children, parentCenterY, side, depth, localAnchorX);
  }

  function placeChildrenSingleColumn(
    children: CanonicalNode[],
    parentCenterY: number,
    side: Side,
    depth: number,
    localAnchorX?: number
  ) {
    const totalHeight =
      children.reduce((sum, c) => sum + (footprint.get(c.id) ?? sizeOf(c.id).height), 0) + vGap * (children.length - 1);
    let cursorY = parentCenterY - totalHeight / 2;

    for (const child of children) {
      const h = footprint.get(child.id) ?? sizeOf(child.id).height;
      const childCenterY = cursorY + h / 2;
      placeSingleChild(child, childCenterY, side, depth, localAnchorX);
      cursorY += h + vGap;
    }
  }

  /**
   * Balanced multi-column grid for a pathologically-fanned parent's direct
   * children. Column count is `ceil(sqrt(n))` (M0's own heuristic -- keeps
   * aspect ratio far closer to square than one long column). Columns are
   * assigned via LPT footprint-balance (this file's `kWayPartition`,
   * generalizing the two-way `partitionBySide` already used for left/
   * right), fixing M0's round-robin-assignment bug. Each column is then
   * centered on `parentCenterY` using the exact same formula
   * `placeChildrenSingleColumn` uses for one column, fixing M0's
   * "imperfect centering formula" overlap bug by reusing an
   * already-correct formula instead of a new one.
   *
   * Further descendants of a fanned child do NOT fall back to the global
   * per-depth band: because grid columns sit at different distances from
   * the parent, the global band (sized for the single widest column)
   * could overshoot or undershoot an individual column's own edge and
   * overlap a neighboring column's nodes. Each fanned child instead
   * becomes the root of its own parent-local band starting at its own
   * near edge (`localAnchorX` in `placeSingleChild`/`placeChildren`) --
   * genuine "parent-local recursive packing" for the part of the tree
   * where the global band assumption no longer holds.
   *
   * KNOWN RESIDUAL LIMITATION (carried forward from M0_REPORT.md §5/§9,
   * not solved here): columns are packed edge-to-edge with no reserved
   * slack for a column's own descendants to extend into. Local anchoring
   * guarantees a fanned child's descendants land strictly farther from
   * the root than their parent (correct depth, deterministic, never
   * dropped or NaN) but does NOT guarantee they avoid the *next* column
   * over, since that column starts immediately after this one's own
   * width with no allowance for what's queued up behind it. M0's own
   * corpus and real-world evidence (`01_extreme_star_60.md`) have every
   * fanned child as a leaf, so this never triggers in the measured
   * evidence this strategy is based on; a parent whose pathological
   * fan-out children *also* have their own children is the one scenario
   * this bounded extension does not fully close (see
   * `src/test/v2-m1d-fanout-and-stability.test.ts` for a test that
   * documents this exact boundary rather than silently passing over it).
   */
  function placeChildrenGrid(children: CanonicalNode[], parentCenterY: number, side: Side, depth: number, localAnchorX?: number) {
    const cols = Math.max(2, Math.ceil(Math.sqrt(children.length)));
    const columns = kWayPartition(children, cols, footprint);

    let columnNearX = localAnchorX ?? nearEdgeX(side, depth);
    for (const column of columns) {
      if (column.length === 0) continue;
      const totalHeight =
        column.reduce((sum, c) => sum + (footprint.get(c.id) ?? sizeOf(c.id).height), 0) + vGap * (column.length - 1);
      let cursorY = parentCenterY - totalHeight / 2;
      let columnWidth = 0;

      for (const child of column) {
        const h = footprint.get(child.id) ?? sizeOf(child.id).height;
        const childCenterY = cursorY + h / 2;
        const size = sizeOf(child.id);
        const x = side === 'right' ? columnNearX : columnNearX - size.width;
        positioned.set(child.id, { x, y: childCenterY - size.height / 2, width: size.width, height: size.height });
        edgeHandleAssignments.set(`${child.parentId}->${child.id}`, {
          sourceHandle: side,
          targetHandle: side === 'right' ? 'left' : 'right',
        });
        const childLocalAnchor = side === 'right' ? x + size.width + hGap : x - hGap;
        placeChildren(child.id, childCenterY, side, depth + 1, childLocalAnchor);
        columnWidth = Math.max(columnWidth, size.width);
        cursorY += h + vGap;
      }
      columnNearX = side === 'right' ? columnNearX + columnWidth + hGap : columnNearX - columnWidth - hGap;
    }
  }

  /**
   * #10c stabilized stacking: children are partitioned into "anchored"
   * (existed in `stabilizeAgainst` under the same parent) and "new" (no
   * prior anchor). Anchored children keep their previous center exactly
   * -- fully-stable ones (whole subtree unchanged) are bulk-copied
   * verbatim without recursing; changed-but-existing ones keep their own
   * center fixed and recurse normally so only *their* internal content
   * reflows. New children are slotted in next to the nearest already-
   * positioned neighbor rather than recentering the whole list, so
   * existing siblings never move because of a change elsewhere.
   */
  function placeChildrenAnchored(
    children: CanonicalNode[],
    parentCenterY: number,
    side: Side,
    depth: number,
    localAnchorX?: number
  ) {
    const byChildId = new Map(children.map((c) => [c.id, c]));
    const isNew = (id: string) => {
      const prev = anchor!.prevById.get(id);
      return !prev || prev.parentId !== byChildId.get(id)?.parentId;
    };
    const anyAnchored = children.some((c) => !isNew(c.id));
    if (!anyAnchored) {
      placeChildrenSingleColumn(children, parentCenterY, side, depth, localAnchorX);
      return;
    }

    // Pass 1: place every anchored child at its own previous center.
    const centerOf = new Map<string, number>();
    for (const child of children) {
      if (isNew(child.id)) continue;
      const prev = anchor!.prevById.get(child.id)!;
      const baseHeight = (prev.geometry.height || sizeOf(child.id).height);
      const baseY = prev.geometry.y - (prev.manualOffset?.dy || 0);
      const centerY = baseY + baseHeight / 2;
      centerOf.set(child.id, centerY);

      if (anchor!.isFullyStable(child.id)) {
        bulkCopySubtree(child.id, side);
      } else {
        placeSingleChild(child, centerY, side, depth, localAnchorX);
      }
    }

    // Pass 2: slot new children next to the nearest already-positioned
    // neighbor (preceding, else following), preserving list order.
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!isNew(child.id)) continue;
      const h = footprint.get(child.id) ?? sizeOf(child.id).height;

      let precedingBottom: number | null = null;
      for (let j = i - 1; j >= 0; j--) {
        const c = centerOf.get(children[j].id);
        if (c !== undefined) {
          const hh = footprint.get(children[j].id) ?? sizeOf(children[j].id).height;
          precedingBottom = c + hh / 2;
          break;
        }
      }
      let followingTop: number | null = null;
      for (let j = i + 1; j < children.length; j++) {
        const c = centerOf.get(children[j].id);
        if (c !== undefined) {
          const hh = footprint.get(children[j].id) ?? sizeOf(children[j].id).height;
          followingTop = c - hh / 2;
          break;
        }
      }

      const centerY =
        precedingBottom !== null
          ? precedingBottom + vGap + h / 2
          : followingTop !== null
            ? followingTop - vGap - h / 2
            : parentCenterY;

      centerOf.set(child.id, centerY);
      placeSingleChild(child, centerY, side, depth, localAnchorX);
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
  const [right, left] = kWayPartition(level1Children, 2, footprint);
  return { left, right };
}

/**
 * Generalizes `partitionBySide`'s greedy LPT bin balance to `k` bins:
 * sort descending by footprint, always add the next item to the
 * currently lightest bin. Used both for left/right (`k=2`, via
 * `partitionBySide`) and for fan-out grid columns (`k=ceil(sqrt(n))`).
 */
function kWayPartition(items: CanonicalNode[], k: number, footprint: Map<string, number>): CanonicalNode[][] {
  const bins: CanonicalNode[][] = Array.from({ length: k }, () => []);
  const weights = new Array(k).fill(0);
  const sorted = [...items].sort((a, b) => (footprint.get(b.id) || 1) - (footprint.get(a.id) || 1));
  for (const item of sorted) {
    let lightest = 0;
    for (let i = 1; i < k; i++) {
      if (weights[i] < weights[lightest]) lightest = i;
    }
    bins[lightest].push(item);
    weights[lightest] += footprint.get(item.id) || 1;
  }
  return bins;
}

/**
 * #10c side-anchoring: existing top-level branches keep the side they
 * were already assigned in `stabilizeAgainst` (compared against that
 * prior document's own root x), so an unrelated edit can never flip an
 * existing branch from left to right. Only brand-new top-level branches
 * are assigned, greedily, to whichever side's running weight (existing +
 * already-assigned-new) is currently lighter.
 */
function assignSidesAnchored(
  level1: CanonicalNode[],
  footprint: Map<string, number>,
  anchor: AnchorContext,
  rootId: string,
  nodeSide: Map<string, Side>
): void {
  let leftWeight = 0;
  let rightWeight = 0;
  for (const child of level1) {
    const prev = anchor.prevById.get(child.id);
    if (prev && prev.parentId === rootId) {
      const side: Side = prev.geometry.x >= anchor.prevRootX ? 'right' : 'left';
      nodeSide.set(child.id, side);
      if (side === 'right') rightWeight += footprint.get(child.id) || 1;
      else leftWeight += footprint.get(child.id) || 1;
    } else {
      const side: Side = rightWeight <= leftWeight ? 'right' : 'left';
      nodeSide.set(child.id, side);
      if (side === 'right') rightWeight += footprint.get(child.id) || 1;
      else leftWeight += footprint.get(child.id) || 1;
    }
  }
}

/**
 * Nodes reachable from the root without crossing a collapsed ancestor's
 * boundary -- i.e. what `placeChildren` actually positions. A collapsed
 * node itself is visible (its own box still renders); its descendants are
 * not, matching `placeChildren`'s own `collapsedIds.has(parentId)` early
 * return.
 */
function computeVisibleIds(
  rootId: string,
  childrenMap: Map<string, CanonicalNode[]>,
  collapsedIds: Set<string>
): Set<string> {
  const visible = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (collapsedIds.has(id)) continue;
    for (const child of childrenMap.get(id) || []) {
      visible.add(child.id);
      stack.push(child.id);
    }
  }
  return visible;
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
  sizeOf: (id: string) => { width: number; height: number },
  visibleIds: Set<string>
): Map<string, number> {
  const bandMaxWidth = new Map<string, number>();
  for (const n of nodes) {
    if (n.id === rootId) continue;
    if (!visibleIds.has(n.id)) continue;
    const side = nodeSide.get(n.id) || 'right';
    const depth = depths.get(n.id);
    if (depth === undefined) continue;
    const key = `${side}:${depth}`;
    bandMaxWidth.set(key, Math.max(bandMaxWidth.get(key) || 0, sizeOf(n.id).width));
  }
  return bandMaxWidth;
}

/** #10c support: precomputed lookups over `stabilizeAgainst`, the caller's prior layout output. */
interface AnchorContext {
  prevById: Map<string, CanonicalNode>;
  prevRootX: number;
  isFullyStable: (id: string) => boolean;
}

/**
 * A node id is "fully stable" when its own text-aware size, collapsed
 * flag, and *entire* recursive children signature (ids, order, and their
 * own signatures) are byte-identical between the current document and
 * `stabilizeAgainst`. That guarantees the whole subtree would compute out
 * geometrically identical to before, so copying its previous absolute
 * position verbatim (see `bulkCopySubtree`) is exactly equivalent to
 * recomputing it -- not an approximation.
 */
function buildAnchorContext(
  prevDoc: CanonicalDocument,
  currentNodes: CanonicalNode[],
  currentChildrenMap: Map<string, CanonicalNode[]>,
  currentSizeOf: (id: string) => { width: number; height: number },
  currentCollapsedIds: Set<string>
): AnchorContext {
  const prevById = new Map(prevDoc.nodes.map((n) => [n.id, n]));
  const prevRoot =
    prevDoc.nodes.find((n) => n.type === 'root') || prevDoc.nodes.find((n) => !n.parentId) || prevDoc.nodes[0];
  const prevChildrenMap = buildChildrenMap(prevDoc.nodes);
  const prevSizeOf = makeSizeOf(prevDoc.nodes);
  const prevCollapsedIds = new Set(prevDoc.nodes.filter((n) => n.collapsed).map((n) => n.id));
  const currentById = new Map(currentNodes.map((n) => [n.id, n]));

  function signature(
    id: string,
    childrenMap: Map<string, CanonicalNode[]>,
    sizeOf: (id: string) => { width: number; height: number },
    collapsedIds: Set<string>,
    byId: Map<string, CanonicalNode>
  ): string | null {
    const node = byId.get(id);
    if (!node) return null;
    const size = sizeOf(id);
    const collapsed = collapsedIds.has(id) ? 1 : 0;
    const children = childrenMap.get(id) || [];
    const childSigs = children.map((c) => signature(c.id, childrenMap, sizeOf, collapsedIds, byId)).join('|');
    return `${node.parentId ?? ''}:${size.width}x${size.height}:${collapsed}:[${childSigs}]`;
  }

  const stableCache = new Map<string, boolean>();
  return {
    prevById,
    prevRootX: prevRoot.geometry.x,
    isFullyStable(id: string): boolean {
      const cached = stableCache.get(id);
      if (cached !== undefined) return cached;
      const cur = signature(id, currentChildrenMap, currentSizeOf, currentCollapsedIds, currentById);
      const prev = signature(id, prevChildrenMap, prevSizeOf, prevCollapsedIds, prevById);
      const stable = cur !== null && prev !== null && cur === prev;
      stableCache.set(id, stable);
      return stable;
    },
  };
}

/**
 * PROTOTYPE A (M0 gate) -- throwaway. Not wired into production import/layout.
 *
 * "Parent-local recursive packing": the low-risk evolution of the current
 * production `layoutHorizontalChildren`. Keeps the same top-down,
 * parent-anchors-its-children shape the production engine already has, but
 * fixes its three structural bugs:
 *
 *  - Column is assigned strictly by hierarchy depth (a shared per-band x),
 *    not by a global mutable column cursor threaded across siblings -- so a
 *    sibling's deep subtree can no longer push a later sibling's own
 *    (shallower) subtree into extra fake columns (contract #1/#2/#4).
 *  - Each child's vertical slot is reserved bottom-up as the sum of its own
 *    subtree's footprint (recursive, per-child), not a fixed-row grid, so
 *    the old sqrt(children.length) row-count patch for high fan-out is
 *    gone entirely -- fan-out stays in one band and simply grows taller
 *    (contract #7).
 *  - Bilateral split is by subtree weight (`partitionBySide`), not
 *    `index % 2` (contract #6).
 *
 * What stays "parent-local" (the low-risk part): each level's children are
 * still centered on their PARENT's already-fixed Y (top-down cascade), not
 * recomputed bottom-up from the children's own natural centers the way a
 * true tidy-tree (prototype B) does. That's the main behavioural axis this
 * prototype is deliberately not changing.
 */
import { LayoutResult, PositionedEdge, PositionedNode } from './contract';
import { computeTextAwareSize } from './textAwareGeometry';
import {
  ProtoEdgeInput,
  ProtoNodeInput,
  buildChildrenMap,
  computeDepths,
  computeSubtreeWeights,
  findRoot,
  makeSizeOf,
  partitionBySide,
} from './treeUtils';

export interface PrototypeALayoutOptions {
  hGap?: number;
  vGap?: number;
}

export function layoutPrototypeA(
  nodes: ProtoNodeInput[],
  edges: ProtoEdgeInput[],
  options: PrototypeALayoutOptions = {}
): LayoutResult {
  const hGap = options.hGap ?? 60;
  const vGap = options.vGap ?? 24;

  const root = findRoot(nodes);
  const childrenMap = buildChildrenMap(nodes);
  const depths = computeDepths(root, childrenMap);
  const weights = computeSubtreeWeights(nodes, childrenMap);
  const sizes = new Map(nodes.map((n) => [n.id, computeTextAwareSize({ id: n.id, text: n.text })]));
  const sizeOf = makeSizeOf(sizes);

  // Per (side, depth) band shares one x line: the max node width seen at
  // that band decides how far the NEXT band starts, so every node at that
  // depth/side aligns on the edge facing the root regardless of its own
  // (now text-aware, so variable) width.
  const bandMaxWidth = new Map<string, number>(); // key `${side}:${depth}`
  const nodeSide = new Map<string, 'left' | 'right'>();
  nodeSide.set(root.id, 'right');

  const level1 = childrenMap.get(root.id) || [];
  const { left, right } = partitionBySide(level1, weights);
  for (const c of left) assignSideRecursive(c, 'left');
  for (const c of right) assignSideRecursive(c, 'right');
  function assignSideRecursive(node: ProtoNodeInput, side: 'left' | 'right') {
    nodeSide.set(node.id, side);
    for (const child of childrenMap.get(node.id) || []) assignSideRecursive(child, side);
  }

  for (const n of nodes) {
    if (n.id === root.id) continue;
    const side = nodeSide.get(n.id) || 'right';
    const depth = depths.get(n.id)!;
    const key = `${side}:${depth}`;
    const w = sizeOf(n.id).width;
    bandMaxWidth.set(key, Math.max(bandMaxWidth.get(key) || 0, w));
  }

  // Returns the "near edge" x for this band -- the edge facing the root
  // that edges actually connect to. For right-growing bands that's the
  // node's own left edge; for left-growing bands it's the node's own right
  // edge, so a node's stored (left-edge) x is derived by subtracting its
  // OWN width from this, not the band's max width -- otherwise narrower
  // nodes in a variable-width (text-aware) band would drift off the shared
  // line instead of lining up on the edge that faces the parent.
  function nearEdgeX(side: 'left' | 'right', depth: number, rootSize: { width: number }): number {
    let x = side === 'right' ? rootSize.width / 2 + hGap : -rootSize.width / 2 - hGap;
    for (let d = 1; d < depth; d++) {
      const bandWidth = bandMaxWidth.get(`${side}:${d}`) || 150;
      x += side === 'right' ? bandWidth + hGap : -(bandWidth + hGap);
    }
    return x;
  }

  // Bottom-up: reserved vertical footprint per node (its own height, or the
  // stacked total of its children's reserved footprints, whichever is
  // larger).
  const reserved = new Map<string, number>();
  function reservedHeightOf(id: string): number {
    const cached = reserved.get(id);
    if (cached !== undefined) return cached;
    const children = childrenMap.get(id) || [];
    const own = sizeOf(id).height;
    let total: number;
    if (children.length === 0 || isCollapsed(id)) {
      total = own;
    } else {
      const childrenTotal =
        children.reduce((sum, c) => sum + reservedHeightOf(c.id), 0) + vGap * (children.length - 1);
      total = Math.max(own, childrenTotal);
    }
    reserved.set(id, total);
    return total;
  }
  const collapsedIds = new Set(nodes.filter((n) => n.collapsed).map((n) => n.id));
  function isCollapsed(id: string) {
    return collapsedIds.has(id);
  }
  for (const n of nodes) reservedHeightOf(n.id);

  const positioned = new Map<string, PositionedNode>();
  const rootSize = sizeOf(root.id);
  positioned.set(root.id, {
    id: root.id,
    parentId: undefined,
    depth: 0,
    x: -rootSize.width / 2,
    y: -rootSize.height / 2,
    width: rootSize.width,
    height: rootSize.height,
  });

  function placeChildren(parentId: string, parentCenterY: number, side: 'left' | 'right', depth: number) {
    if (isCollapsed(parentId)) return;
    // Filtering by assigned side is a no-op below the root (a node's whole
    // subtree shares one side), but is what actually splits root's own
    // direct children into their two wings here.
    const children = (childrenMap.get(parentId) || []).filter((c) => nodeSide.get(c.id) === side);
    if (children.length === 0) return;

    const totalHeight =
      children.reduce((sum, c) => sum + reservedHeightOf(c.id), 0) + vGap * (children.length - 1);
    let cursorY = parentCenterY - totalHeight / 2;

    for (const child of children) {
      const h = reservedHeightOf(child.id);
      const childCenterY = cursorY + h / 2;
      const size = sizeOf(child.id);
      const near = nearEdgeX(side, depth, rootSize);
      const x = side === 'right' ? near : near - size.width;

      positioned.set(child.id, {
        id: child.id,
        parentId,
        depth,
        x,
        y: childCenterY - size.height / 2,
        width: size.width,
        height: size.height,
      });

      placeChildren(child.id, childCenterY, side, depth + 1);
      cursorY += h + vGap;
    }
  }

  placeChildren(root.id, positioned.get(root.id)!.y + rootSize.height / 2, 'right', 1);
  placeChildren(root.id, positioned.get(root.id)!.y + rootSize.height / 2, 'left', 1);

  const resultNodes: PositionedNode[] = nodes.map((n) => positioned.get(n.id)!).filter(Boolean);
  const resultEdges: PositionedEdge[] = edges.map((e) => ({ source: e.source, target: e.target }));

  return { nodes: resultNodes, edges: resultEdges };
}

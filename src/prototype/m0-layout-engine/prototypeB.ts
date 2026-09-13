/**
 * PROTOTYPE B (M0 gate) -- throwaway. Not wired into production import/layout.
 *
 * "Subtree-centric tidy tree", Reingold-Tilford style: unlike prototype A
 * (which is still parent-anchored top-down), B computes each subtree's own
 * natural shape bottom-up FIRST, in its own local coordinate frame, and
 * only afterwards places the parent at the true center of what its
 * children turned out to need -- rather than the parent deciding a slot
 * and children being squeezed to fit it.
 *
 * Two-pass:
 *  1. Post-order `packSubtree`: recursively pack each child's subtree in
 *     isolation (each one thinks it owns y=0), then stack the now-fixed
 *     child subtrees top-to-bottom with `vGap`, and set the parent's own y
 *     to the mean of the first and last child's y (classic R-T
 *     "mean of extremes" centering -- contract #5).
 *  2. `finalize`: a single top-down pass converts every node's
 *     parent-relative y into an absolute canvas y.
 *
 * Column assignment (x) is depth-based exactly like prototype A -- that
 * part of the contract (#1/#2/#4/#7) isn't a point of difference between
 * the two prototypes; the difference under test is purely *how the Y axis
 * is packed and balanced* (top-down slot reservation vs. bottom-up natural
 * centering).
 *
 * Known simplification vs. a "full" Reingold-Tilford/Walker's algorithm:
 * this does not merge left/right subtree *contours* to let asymmetric
 * subtrees interleave more tightly than the sum of their bounding boxes --
 * it stacks whole subtree bounding boxes. See M0_REPORT.md limitations.
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

export interface PrototypeBLayoutOptions {
  hGap?: number;
  vGap?: number;
}

interface PackedSubtree {
  id: string;
  /** This node's own y, relative to the coordinate frame this pack() call
   * was invoked in (i.e. relative to where the caller will place it). */
  y: number;
  subtreeMinY: number;
  subtreeMaxY: number;
  children: Array<{ offsetY: number; packed: PackedSubtree }>;
}

export function layoutPrototypeB(
  nodes: ProtoNodeInput[],
  edges: ProtoEdgeInput[],
  options: PrototypeBLayoutOptions = {}
): LayoutResult {
  const hGap = options.hGap ?? 60;
  const vGap = options.vGap ?? 24;

  const root = findRoot(nodes);
  const childrenMap = buildChildrenMap(nodes);
  const depths = computeDepths(root, childrenMap);
  const weights = computeSubtreeWeights(nodes, childrenMap);
  const sizes = new Map(nodes.map((n) => [n.id, computeTextAwareSize({ id: n.id, text: n.text })]));
  const sizeOf = makeSizeOf(sizes);
  const collapsedIds = new Set(nodes.filter((n) => n.collapsed).map((n) => n.id));

  const nodeSide = new Map<string, 'left' | 'right'>();
  const level1 = childrenMap.get(root.id) || [];
  const { left, right } = partitionBySide(level1, weights);
  function assignSideRecursive(node: ProtoNodeInput, side: 'left' | 'right') {
    nodeSide.set(node.id, side);
    for (const child of childrenMap.get(node.id) || []) assignSideRecursive(child, side);
  }
  for (const c of left) assignSideRecursive(c, 'left');
  for (const c of right) assignSideRecursive(c, 'right');

  // Same depth-based band/column x-assignment as prototype A: this is the
  // axis A and B share, isolating the Y-packing difference under test.
  const bandMaxWidth = new Map<string, number>();
  for (const n of nodes) {
    if (n.id === root.id) continue;
    const side = nodeSide.get(n.id) || 'right';
    const depth = depths.get(n.id)!;
    const key = `${side}:${depth}`;
    bandMaxWidth.set(key, Math.max(bandMaxWidth.get(key) || 0, sizeOf(n.id).width));
  }
  const rootSize = sizeOf(root.id);
  // See prototypeA.ts's `nearEdgeX` for why this returns the parent-facing
  // edge rather than the node's own stored (left-edge) x.
  function nearEdgeX(side: 'left' | 'right', depth: number): number {
    let x = side === 'right' ? rootSize.width / 2 + hGap : -rootSize.width / 2 - hGap;
    for (let d = 1; d < depth; d++) {
      const bandWidth = bandMaxWidth.get(`${side}:${d}`) || 150;
      x += side === 'right' ? bandWidth + hGap : -(bandWidth + hGap);
    }
    return x;
  }

  function packSubtree(node: ProtoNodeInput, side: 'left' | 'right'): PackedSubtree {
    const ownHeight = sizeOf(node.id).height;
    const children = isCollapsed(node.id) ? [] : (childrenMap.get(node.id) || []).filter((c) => nodeSide.get(c.id) === side);

    if (children.length === 0) {
      return { id: node.id, y: 0, subtreeMinY: -ownHeight / 2, subtreeMaxY: ownHeight / 2, children: [] };
    }

    const packedChildren = children.map((c) => packSubtree(c, side));
    const placed: Array<{ offsetY: number; packed: PackedSubtree }> = [];
    let cursorMax = -Infinity;
    for (const pc of packedChildren) {
      const offsetY = placed.length === 0 ? -pc.subtreeMinY : cursorMax + vGap - pc.subtreeMinY;
      placed.push({ offsetY, packed: pc });
      cursorMax = offsetY + pc.subtreeMaxY;
    }
    // Re-baseline so the first child's own reference frame starts at 0
    // (the loop above assumes the first child's minY sits at 0, matching
    // `offsetY === -pc.subtreeMinY` for index 0).
    const firstAbsY = placed[0].offsetY + placed[0].packed.y;
    const lastAbsY = placed[placed.length - 1].offsetY + placed[placed.length - 1].packed.y;
    const parentY = (firstAbsY + lastAbsY) / 2;

    let subtreeMinY = parentY - ownHeight / 2;
    let subtreeMaxY = parentY + ownHeight / 2;
    for (const p of placed) {
      subtreeMinY = Math.min(subtreeMinY, p.offsetY + p.packed.subtreeMinY);
      subtreeMaxY = Math.max(subtreeMaxY, p.offsetY + p.packed.subtreeMaxY);
    }

    return { id: node.id, y: parentY, subtreeMinY, subtreeMaxY, children: placed };
  }
  function isCollapsed(id: string) {
    return collapsedIds.has(id);
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const positioned = new Map<string, PositionedNode>();
  function finalize(node: ProtoNodeInput, packed: PackedSubtree, baseY: number, side: 'left' | 'right', depth: number) {
    const size = sizeOf(node.id);
    const absY = baseY + packed.y;
    const x = depth === 0 ? -rootSize.width / 2 : (side === 'right' ? nearEdgeX(side, depth) : nearEdgeX(side, depth) - size.width);
    positioned.set(node.id, {
      id: node.id,
      parentId: node.parentId,
      depth,
      x,
      y: absY - size.height / 2,
      width: size.width,
      height: size.height,
    });
    for (const { offsetY, packed: childPacked } of packed.children) {
      const childNode = nodeById.get(childPacked.id)!;
      const childSide = nodeSide.get(childPacked.id) || side;
      finalize(childNode, childPacked, baseY + offsetY, childSide, depth + 1);
    }
  }

  const packedRightRoot = packSubtree(root, 'right');
  const packedLeftRoot = packSubtree(root, 'left');
  // Root itself is shared between both packs (its own children were split
  // by side); take the combined children from both packs and center root
  // over the union.
  const allChildren = [...packedRightRoot.children, ...packedLeftRoot.children];
  let rootY = 0;
  if (allChildren.length > 0) {
    const ys = allChildren.map((c) => c.offsetY + c.packed.y);
    rootY = (Math.min(...ys) + Math.max(...ys)) / 2;
  }
  const combinedRootPacked: PackedSubtree = { id: root.id, y: rootY, subtreeMinY: 0, subtreeMaxY: 0, children: allChildren };

  finalize(root, combinedRootPacked, 0, 'right', 0);

  const resultNodes: PositionedNode[] = nodes.map((n) => positioned.get(n.id)).filter((n): n is PositionedNode => !!n);
  const resultEdges: PositionedEdge[] = edges.map((e) => ({ source: e.source, target: e.target }));

  return { nodes: resultNodes, edges: resultEdges };
}

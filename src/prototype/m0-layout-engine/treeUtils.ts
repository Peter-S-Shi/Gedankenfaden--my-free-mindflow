/**
 * PROTOTYPE (M0 gate) -- throwaway. Not wired into production import/layout.
 *
 * Shared, layout-algorithm-agnostic tree plumbing used by both prototype A
 * and prototype B: hierarchy maps, depth, and a footprint-weighted
 * left/right bilateral split (contract #6 -- "by subtree footprint, not
 * index", replacing the production `index % 2` alternation).
 */
import { TextAwareSize } from './textAwareGeometry';

export interface ProtoNodeInput {
  id: string;
  parentId?: string;
  text: string;
  collapsed?: boolean;
  /** Fine-tuning nudge applied on top of the computed position, mirroring
   * production's `CanonicalNode.manualOffset` -- must survive relayout
   * unchanged (M0 Corrective Gate contract extension, #10b). */
  manualOffset?: { dx: number; dy: number };
}

export interface ProtoEdgeInput {
  source: string;
  target: string;
}

export function buildChildrenMap(nodes: ProtoNodeInput[]): Map<string, ProtoNodeInput[]> {
  const map = new Map<string, ProtoNodeInput[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = map.get(n.parentId) || [];
    list.push(n);
    map.set(n.parentId, list);
  }
  return map;
}

export function findRoot(nodes: ProtoNodeInput[]): ProtoNodeInput {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const withoutParent = nodes.find((n) => !n.parentId || !byId.has(n.parentId));
  return withoutParent || nodes[0];
}

export function computeDepths(root: ProtoNodeInput, childrenMap: Map<string, ProtoNodeInput[]>): Map<string, number> {
  const depths = new Map<string, number>();
  const stack: Array<{ node: ProtoNodeInput; depth: number }> = [{ node: root, depth: 0 }];
  while (stack.length > 0) {
    const { node, depth } = stack.pop()!;
    depths.set(node.id, depth);
    for (const child of childrenMap.get(node.id) || []) {
      stack.push({ node: child, depth: depth + 1 });
    }
  }
  return depths;
}

/**
 * M0 Corrective Gate (per user draft "V2 M0 corrective patch"): the
 * original prototype gate balanced left/right by raw descendant COUNT --
 * a 1-node subtree of one long-wrapped-text node and a 30-node subtree of
 * short one-line notes counted as wildly different weight even if they'd
 * render at similar heights, and vice versa. Bilateral balance
 * (contract #6, "by subtree footprint") means *rendered* footprint, so
 * this now estimates each subtree's actual vertical footprint the same
 * way the layout itself will reserve space for it: a node's own
 * text-aware height, or -- if it has children and isn't collapsed -- the
 * larger of its own height and the stacked total of its children's own
 * footprints (bottom-up, with `vGap` between siblings). Both prototypes
 * partition sides using this SAME function, so the number that decides
 * "which side" and the number that decides "how tall this subtree
 * actually reserves" can't drift apart from each other.
 */
export function computeSubtreeFootprintWeights(
  nodes: ProtoNodeInput[],
  childrenMap: Map<string, ProtoNodeInput[]>,
  sizeOf: SizeOf,
  vGap: number
): Map<string, number> {
  const collapsedIds = new Set(nodes.filter((n) => n.collapsed).map((n) => n.id));
  const weights = new Map<string, number>();
  function weightOf(id: string): number {
    const cached = weights.get(id);
    if (cached !== undefined) return cached;
    const own = sizeOf(id).height;
    const children = childrenMap.get(id) || [];
    let w: number;
    if (children.length === 0 || collapsedIds.has(id)) {
      w = own;
    } else {
      const childrenTotal = children.reduce((sum, c) => sum + weightOf(c.id), 0) + vGap * (children.length - 1);
      w = Math.max(own, childrenTotal);
    }
    weights.set(id, w);
    return w;
  }
  for (const n of nodes) weightOf(n.id);
  return weights;
}

/**
 * Greedy longest-processing-time bin balancing: sort level-1 children by
 * descending subtree weight, always add the next one to the currently
 * lighter side. Produces a materially more even bilateral split for
 * lopsided trees (contract fixture 08) than `index % 2`, which only
 * balances *count*, not footprint.
 */
export function partitionBySide(
  level1Children: ProtoNodeInput[],
  weights: Map<string, number>
): { left: ProtoNodeInput[]; right: ProtoNodeInput[] } {
  const sorted = [...level1Children].sort((a, b) => (weights.get(b.id) || 1) - (weights.get(a.id) || 1));
  const left: ProtoNodeInput[] = [];
  const right: ProtoNodeInput[] = [];
  let leftWeight = 0;
  let rightWeight = 0;
  for (const child of sorted) {
    const w = weights.get(child.id) || 1;
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

export type SizeOf = (id: string) => TextAwareSize;

export function makeSizeOf(sizes: Map<string, TextAwareSize>): SizeOf {
  return (id: string) => sizes.get(id) || { width: 150, height: 44 };
}

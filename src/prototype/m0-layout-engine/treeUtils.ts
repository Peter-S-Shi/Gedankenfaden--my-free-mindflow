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

/** Subtree "weight" (descendant count incl. self) used purely to decide
 * bilateral side membership -- a structural proxy for pixel footprint that
 * doesn't require having laid anything out yet. */
export function computeSubtreeWeights(
  nodes: ProtoNodeInput[],
  childrenMap: Map<string, ProtoNodeInput[]>
): Map<string, number> {
  const weights = new Map<string, number>();
  function weightOf(id: string): number {
    const cached = weights.get(id);
    if (cached !== undefined) return cached;
    const children = childrenMap.get(id) || [];
    const w = 1 + children.reduce((sum, c) => sum + weightOf(c.id), 0);
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

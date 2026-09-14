/**
 * Pure visible-tree/collapse-state helpers for the M3 Behavior Correction
 * Contract's document-level structure commands (Collapse All, Expand All,
 * Expand To Level, one-level progressive reveal). Kept separate from
 * `CanvasEditor.tsx` so the actual hierarchy logic is unit-testable without
 * a React render harness -- mirrors the existing split for
 * `hierarchySelection.ts` (selection) and `deletion.ts` (delete planning).
 *
 * None of these functions touch layout/geometry; callers re-run
 * `autoLayoutDocument` (without `stabilizeAgainst` -- see CanvasEditor's
 * comment on `handleToggleFold`) after applying the returned node list.
 */
import { CanonicalNode } from './types';

/** Canonical depth of every node (root = 0), by walking `parentId`. */
export function computeCanonicalDepthMap(nodes: CanonicalNode[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depthMap = new Map<string, number>();
  const getDepth = (id: string, visited: Set<string>): number => {
    const cached = depthMap.get(id);
    if (cached !== undefined) return cached;
    const node = byId.get(id);
    if (!node || !node.parentId || node.parentId === id || visited.has(id)) {
      depthMap.set(id, 0);
      return 0;
    }
    const depth = getDepth(node.parentId, new Set(visited).add(id)) + 1;
    depthMap.set(id, depth);
    return depth;
  };
  for (const n of nodes) getDepth(n.id, new Set());
  return depthMap;
}

function idsWithChildren(nodes: CanonicalNode[]): Set<string> {
  return new Set(nodes.filter((n) => n.parentId).map((n) => n.parentId as string));
}

/**
 * Toggles `nodeId`'s own `collapsed` flag. When this *reveals* the node
 * (collapsed -> visible), its direct children that themselves have
 * children become the new collapsed frontier -- so exactly one layer is
 * revealed per call (contract 3.2/3.7), not the whole subtree at once.
 * Collapsing is unaffected: it already hides the whole subtree in one step
 * via the visible-tree computation in `adapter.ts`.
 */
export function toggleNodeFold(nodes: CanonicalNode[], nodeId: string): CanonicalNode[] {
  const target = nodes.find((n) => n.id === nodeId);
  const isRevealing = Boolean(target?.collapsed);

  let frontierIds: Set<string> | null = null;
  if (isRevealing) {
    const hasChildren = idsWithChildren(nodes);
    frontierIds = new Set(nodes.filter((n) => n.parentId === nodeId && hasChildren.has(n.id)).map((n) => n.id));
  }

  return nodes.map((n) => {
    if (n.id === nodeId) return { ...n, collapsed: !n.collapsed };
    if (frontierIds?.has(n.id) && !n.collapsed) return { ...n, collapsed: true };
    return n;
  });
}

/** Collapses every depth-1 topic (direct child of root) that has children. */
export function collapseAllTopLevelTopics(nodes: CanonicalNode[]): CanonicalNode[] {
  const depthMap = computeCanonicalDepthMap(nodes);
  const hasChildren = idsWithChildren(nodes);
  return nodes.map((n) => (depthMap.get(n.id) === 1 && hasChildren.has(n.id) ? { ...n, collapsed: true } : n));
}

/** Reveals the entire document: `collapsed: false` on every node. */
export function expandAllTopics(nodes: CanonicalNode[]): CanonicalNode[] {
  return nodes.map((n) => (n.collapsed ? { ...n, collapsed: false } : n));
}

/**
 * Makes every node at canonical depth `< level` visible and collapses the
 * depth-`level` frontier (so depth `> level` stays hidden behind it).
 * Nodes deeper than `level` are left untouched -- they're hidden either
 * way, behind the frontier collapse.
 */
export function expandToLevel(nodes: CanonicalNode[], level: number): CanonicalNode[] {
  const depthMap = computeCanonicalDepthMap(nodes);
  const hasChildren = idsWithChildren(nodes);
  return nodes.map((n) => {
    const depth = depthMap.get(n.id) ?? 0;
    if (depth < level) return n.collapsed ? { ...n, collapsed: false } : n;
    if (depth === level && hasChildren.has(n.id)) return n.collapsed ? n : { ...n, collapsed: true };
    return n;
  });
}

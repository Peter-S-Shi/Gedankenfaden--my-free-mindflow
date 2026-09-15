/**
 * Carries a dragged parent node's descendant subtree along with it (Ledger
 * F-new / #17). React Flow's onNodesChange only reports a position change
 * for the node actually dragged -- without this, a parent's children would
 * visibly detach and stay behind while it moves.
 */
import type { Node } from '@xyflow/react';

export interface PositionLike {
  x: number;
  y: number;
}

/** Builds a direct-children id lookup from a flat parentId-linked node list. */
export function buildChildrenIdsByParent(
  nodes: Array<{ id: string; parentId?: string }>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    map.set(n.parentId, [...(map.get(n.parentId) || []), n.id]);
  }
  return map;
}

export function collectDescendantIds(
  rootId: string,
  childrenIdsByParent: Map<string, string[]>
): string[] {
  const result: string[] = [];
  const walk = (id: string) => {
    for (const childId of childrenIdsByParent.get(id) || []) {
      result.push(childId);
      walk(childId);
    }
  };
  walk(rootId);
  return result;
}

/**
 * Given the node list BEFORE a set of position changes and the resulting
 * node list AFTER React Flow's own applyNodeChanges, shifts every
 * descendant of each moved node by the same delta the moved node itself
 * received -- preserving each descendant's own relative offset (including
 * one from its own prior manual drag) rather than reparenting or altering
 * canonical parentId relationships.
 */
export function carryDescendantsWithDraggedParents<T extends Node>(
  previousNodes: T[],
  nextNodes: T[],
  positionChanges: Array<{ id: string; position?: PositionLike }>,
  childrenIdsByParent: Map<string, string[]>
): T[] {
  const previousPositions = new Map(previousNodes.map((n) => [n.id, n.position]));
  let result = nextNodes;

  for (const change of positionChanges) {
    if (!change.position) continue;
    const before = previousPositions.get(change.id);
    if (!before) continue;
    const dx = change.position.x - before.x;
    const dy = change.position.y - before.y;
    if (dx === 0 && dy === 0) continue;

    const descendantIds = new Set(collectDescendantIds(change.id, childrenIdsByParent));
    if (descendantIds.size === 0) continue;

    result = result.map((n) =>
      descendantIds.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n
    );
  }

  return result;
}

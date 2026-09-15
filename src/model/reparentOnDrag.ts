/**
 * Drag-to-reparent (M3 Behavior Correction Contract, node-drag semantics):
 * dragging a Mind Map node is never a way to freely stretch/bend its
 * hierarchy edge. Two outcomes only:
 *
 * 1. The drag lands inside another node's "capture zone" -> on release the
 *    dragged node is reparented under that node; both the old and new
 *    parent's children are re-packed by the layout algorithm.
 * 2. The drag lands nowhere captured -> on release the subtree becomes a
 *    free-standing hierarchy at that drop position.
 *
 * Either way, edge geometry is never itself the thing being edited -- only
 * `parentId` changes, and a full relayout derives geometry from that.
 */
import { CanonicalEdge, CanonicalNode } from './types';
import { collectDescendantIds } from './dragSubtree';

export interface LiveNodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Expansion around a candidate node's own bounding box that still counts as "captured". */
export const REPARENT_CAPTURE_MARGIN = 40;

export interface ReparentCapture {
  parentId: string;
  side?: 'left' | 'right';
}

/**
 * Finds which node (if any) the dragged node's live position has entered
 * the capture zone of. Excludes the dragged node itself, its own
 * descendants (reparenting under one would create a cycle), and its
 * current parent (that's not a reparent, it's a no-op). The root node
 * (no parentId) can never be reparented, so it never enters this search.
 * Returns the nearest capturing candidate's id, or null.
 */
export function findReparentCapture(
  nodes: CanonicalNode[],
  draggedNodeId: string,
  liveBox: LiveNodeBox,
  childrenIdsByParent: Map<string, string[]>
): ReparentCapture | null {
  const dragged = nodes.find((n) => n.id === draggedNodeId);
  const root = nodes.find((n) => n.type === 'root') || nodes.find((n) => !n.parentId);
  if (!dragged || !root || dragged.id === root.id) return null;

  const excluded = new Set<string>([draggedNodeId, ...collectDescendantIds(draggedNodeId, childrenIdsByParent)]);
  if (dragged.parentId) excluded.add(dragged.parentId);

  const centerX = liveBox.x + liveBox.width / 2;
  const centerY = liveBox.y + liveBox.height / 2;

  let best: { id: string; distance: number } | null = null;
  for (const n of nodes) {
    if (excluded.has(n.id)) continue;
    const width = n.geometry.width ?? 150;
    const height = n.geometry.height ?? 44;
    // Capture is based on the distance between the two visible rectangles,
    // not only on whether the dragged node's centre enters a small target
    // rectangle. The old centre-only rule required users to place one topic
    // almost directly on top of another before any preview appeared, which
    // made a perfectly ordinary "move near this parent" gesture look inert.
    const horizontalGap = Math.max(
      n.geometry.x - (liveBox.x + liveBox.width),
      liveBox.x - (n.geometry.x + width),
      0
    );
    const verticalGap = Math.max(
      n.geometry.y - (liveBox.y + liveBox.height),
      liveBox.y - (n.geometry.y + height),
      0
    );
    if (horizontalGap > REPARENT_CAPTURE_MARGIN || verticalGap > REPARENT_CAPTURE_MARGIN) continue;

    const candidateCenterX = n.geometry.x + width / 2;
    const candidateCenterY = n.geometry.y + height / 2;
    const distance = Math.hypot(centerX - candidateCenterX, centerY - candidateCenterY);
    if (!best || distance < best.distance) best = { id: n.id, distance };
  }

  const rootCenterX = root.geometry.x + (root.geometry.width ?? 160) / 2;
  const dropSide: 'left' | 'right' = centerX < rootCenterX ? 'left' : 'right';
  if (best) return best.id === root.id ? { parentId: root.id, side: dropSide } : { parentId: best.id };

  // Crossing the central topic's vertical axis is itself a root capture.
  // This applies at every canonical depth: the dragged subtree becomes a
  // top-level branch on the side where the user released it.
  const originalCenterX = dragged.geometry.x + (dragged.geometry.width ?? 150) / 2;
  const originalSide: 'left' | 'right' = originalCenterX < rootCenterX ? 'left' : 'right';
  return dropSide !== originalSide ? { parentId: root.id, side: dropSide } : null;
}

/**
 * Applies a captured reparent: updates the dragged node's `parentId` and
 * clears any `manualOffset` (position becomes fully algorithm-derived
 * again -- there is nothing left for a stale manual offset to be relative
 * to). Geometry itself is left untouched; the caller re-runs
 * `autoLayoutDocument` (without `stabilizeAgainst`, same as any other
 * structural change) to place the node and re-pack both the old and new
 * parent's remaining children.
 */
export function applyReparent(nodes: CanonicalNode[], draggedNodeId: string, capture: ReparentCapture): CanonicalNode[] {
  return nodes.map((n) =>
    n.id === draggedNodeId
      ? {
          ...n,
          parentId: capture.parentId,
          mindMapSide: capture.side,
          manualOffset: undefined,
        }
      : n
  );
}

/** Detaches the whole hierarchy at `draggedNodeId`, preserving its shape at the live drop position. */
export function applyDetachedDrop(nodes: CanonicalNode[], draggedNodeId: string, liveBox: LiveNodeBox): CanonicalNode[] {
  const dragged = nodes.find((n) => n.id === draggedNodeId);
  if (!dragged || dragged.type === 'root') return nodes;
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) || []), node.id]);
  }
  const subtree = new Set([draggedNodeId, ...collectDescendantIds(draggedNodeId, children)]);
  const dx = liveBox.x - dragged.geometry.x;
  const dy = liveBox.y - dragged.geometry.y;
  return nodes.map((node) => {
    if (!subtree.has(node.id)) return node;
    if (node.id === draggedNodeId) {
      return {
        ...node,
        parentId: undefined,
        mindMapSide: undefined,
        manualOffset: undefined,
        geometry: { ...node.geometry, x: liveBox.x, y: liveBox.y },
      };
    }
    return { ...node, geometry: { ...node.geometry, x: node.geometry.x + dx, y: node.geometry.y + dy } };
  });
}

/** Repoints the single hierarchy edge owned by the old parent-child relation. */
export function updateHierarchyEdgesForReparent(
  edges: CanonicalEdge[],
  draggedNodeId: string,
  oldParentId: string | undefined,
  newParentId: string
): CanonicalEdge[] {
  let replaced = false;
  const next = edges.map((edge) =>
    edge.source === oldParentId && edge.target === draggedNodeId && !edge.isCrossLink
      ? {
          ...edge,
          id: `edge_${newParentId}_${draggedNodeId}`,
          source: newParentId,
          sourceHandle: undefined,
          targetHandle: undefined,
        }
      : edge
  );
  replaced = next.some((edge) => edge.source === newParentId && edge.target === draggedNodeId && !edge.isCrossLink);
  return replaced
    ? next
    : [...next, { id: `edge_${newParentId}_${draggedNodeId}`, source: newParentId, target: draggedNodeId, type: 'smoothstep' }];
}

/** Removes only the old parent's hierarchy edge; descendant and cross-link edges survive. */
export function removeIncomingHierarchyEdge(
  edges: CanonicalEdge[],
  draggedNodeId: string,
  oldParentId: string
): CanonicalEdge[] {
  return edges.filter(
    (edge) => !(edge.source === oldParentId && edge.target === draggedNodeId && !edge.isCrossLink)
  );
}

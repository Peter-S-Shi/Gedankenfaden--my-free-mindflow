import { CanonicalDocument, CanonicalGroup, CanonicalNode } from './types';
import { cloneDocument } from './document';

export interface GroupBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Computes the minimum bounding box enclosing all member nodes with padding.
 */
export function computeGroupBounds(
  group: CanonicalGroup,
  nodes: CanonicalNode[],
  padding = 24,
  headerHeight = 32
): GroupBounds {
  const memberNodeIds = new Set(group.nodeIds);
  const memberNodes = nodes.filter((n) => memberNodeIds.has(n.id));

  if (memberNodes.length === 0) {
    return group.bounds || { x: 100, y: 100, width: 200, height: 120 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of memberNodes) {
    const w = node.geometry.width || 140;
    const h = node.geometry.height || 44;
    minX = Math.min(minX, node.geometry.x);
    minY = Math.min(minY, node.geometry.y);
    maxX = Math.max(maxX, node.geometry.x + w);
    maxY = Math.max(maxY, node.geometry.y + h);
  }

  return {
    x: minX - padding,
    y: minY - padding - headerHeight,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2 + headerHeight,
  };
}

/**
 * Translates a group and all its enclosed member nodes collectively by (dx, dy).
 */
export function translateGroup(
  doc: CanonicalDocument,
  groupId: string,
  dx: number,
  dy: number
): CanonicalDocument {
  const nextDoc = cloneDocument(doc);
  const targetGroup = nextDoc.groups.find((g) => g.id === groupId);
  if (!targetGroup) return nextDoc;

  const memberIds = new Set(targetGroup.nodeIds);

  // Translate all member nodes
  nextDoc.nodes = nextDoc.nodes.map((node) => {
    if (memberIds.has(node.id)) {
      return {
        ...node,
        geometry: {
          ...node.geometry,
          x: node.geometry.x + dx,
          y: node.geometry.y + dy,
        },
      };
    }
    return node;
  });

  // Update group bounds if present
  if (targetGroup.bounds) {
    targetGroup.bounds = {
      ...targetGroup.bounds,
      x: targetGroup.bounds.x + dx,
      y: targetGroup.bounds.y + dy,
    };
  }

  nextDoc.updatedAt = new Date().toISOString();
  return nextDoc;
}

/**
 * Creates a new visual group container enclosing selected node IDs.
 */
export function createGroup(
  title: string,
  nodeIds: string[],
  nodes: CanonicalNode[],
  customStyle?: CanonicalGroup['style']
): CanonicalGroup {
  const group: CanonicalGroup = {
    id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title,
    nodeIds: [...nodeIds],
    style: customStyle || {
      backgroundColor: 'rgba(241, 245, 249, 0.6)',
      borderColor: '#cbd5e1',
    },
  };

  group.bounds = computeGroupBounds(group, nodes);
  return group;
}

export function addNodeToGroup(group: CanonicalGroup, nodeId: string): CanonicalGroup {
  if (group.nodeIds.includes(nodeId)) return group;
  return {
    ...group,
    nodeIds: [...group.nodeIds, nodeId],
  };
}

export function removeNodeFromGroup(group: CanonicalGroup, nodeId: string): CanonicalGroup {
  return {
    ...group,
    nodeIds: group.nodeIds.filter((id) => id !== nodeId),
  };
}

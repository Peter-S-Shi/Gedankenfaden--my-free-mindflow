import { CanonicalNode } from './types';

interface HierarchyPosition {
  depth: number;
  topLevelBranchId: string;
}

function describeHierarchyPosition(
  nodeId: string,
  nodeById: ReadonlyMap<string, CanonicalNode>
): HierarchyPosition | null {
  const visited = new Set<string>();
  let current = nodeById.get(nodeId);
  if (!current) return null;

  let depth = 0;
  let topLevelBranchId = current.id;
  while (current.parentId) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    topLevelBranchId = current.id;
    depth += 1;
    current = nodeById.get(current.parentId);
    if (!current) return null;
  }

  return { depth, topLevelBranchId };
}

/**
 * Returns every node at the selected node's canonical hierarchy depth inside
 * the same top-level branch below the Mind Map root. Cousins under different
 * immediate parents are therefore included; nodes in another root branch are
 * excluded regardless of their rendered position.
 */
export function selectSameLevelInTopLevelBranch(
  nodes: readonly CanonicalNode[],
  selectedNodeId: string
): Set<string> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const selectedPosition = describeHierarchyPosition(selectedNodeId, nodeById);
  if (!selectedPosition) return new Set();

  const selectedIds = new Set<string>();
  for (const node of nodes) {
    const position = describeHierarchyPosition(node.id, nodeById);
    if (
      position &&
      position.depth === selectedPosition.depth &&
      position.topLevelBranchId === selectedPosition.topLevelBranchId
    ) {
      selectedIds.add(node.id);
    }
  }
  return selectedIds;
}

import { CanonicalDocument, CanonicalEdge } from './types';
import { pruneOrphanAnnotations } from './annotations';

export interface DeletionPlan {
  kind: 'delete-node' | 'delete-subtree' | 'delete-node-preserve-children' | 'clear-root-branches';
  nodeIds: string[];
  title: string;
  message: string;
}

export function planDeleteNodePreservingChildren(
  doc: CanonicalDocument,
  selectedNodeId: string
): DeletionPlan | null {
  const target = doc.nodes.find((node) => node.id === selectedNodeId);
  if (!target?.parentId) return null;

  const childCount = doc.nodes.filter((node) => node.parentId === selectedNodeId).length;
  return {
    kind: 'delete-node-preserve-children',
    nodeIds: [selectedNodeId],
    title: 'Delete this topic and keep its children?',
    message: childCount > 0
      ? `${childCount} direct child${childCount === 1 ? '' : 'ren'} will be reattached to this topic's parent.`
      : 'This topic will be removed. It has no children to reattach.',
  };
}

export function planCanvasDeletion(doc: CanonicalDocument, selectedNodeId: string): DeletionPlan | null {
  const target = doc.nodes.find((node) => node.id === selectedNodeId);
  if (!target) return null;

  if (doc.mode === 'mindmap' && target.type === 'root') {
    const branchIds = doc.nodes.filter((node) => node.id !== target.id).map((node) => node.id);
    return {
      kind: 'clear-root-branches',
      nodeIds: branchIds,
      title: 'Clear all root branches?',
      message: `This will remove ${branchIds.length} branch node${branchIds.length === 1 ? '' : 's'} from the central root.`,
    };
  }

  const nodeIds = new Set([selectedNodeId]);
  if (doc.mode === 'mindmap') {
    const children = new Map<string, string[]>();
    for (const node of doc.nodes) {
      if (!node.parentId) continue;
      children.set(node.parentId, [...(children.get(node.parentId) || []), node.id]);
    }
    const collect = (parentId: string) => {
      for (const childId of children.get(parentId) || []) {
        nodeIds.add(childId);
        collect(childId);
      }
    };
    collect(selectedNodeId);
  }

  const count = nodeIds.size;
  return {
    kind: count > 1 ? 'delete-subtree' : 'delete-node',
    nodeIds: [...nodeIds],
    title: count > 1 ? `Delete subtree with ${count} nodes?` : 'Delete this node?',
    message: count > 1
      ? `The selected node and ${count - 1} descendant${count === 2 ? '' : 's'} will be removed.`
      : 'The selected node will be removed.',
  };
}

/**
 * Deletes exactly the selected node while preserving its children (Ledger
 * F-new / #16): the deleted node's direct children are reparented onto the
 * deleted node's own parent (its grandparent's grandchildren become the
 * grandparent's own children), which is the most conservative hierarchy
 * semantics supported by the existing model -- no new "become a root"
 * concept is introduced, since a reparented child's new parent is simply
 * whatever the deleted node's own parent already was.
 *
 * Only meaningful for a node that both has children and has a parent itself
 * (the true root has no parent and is handled separately by the existing
 * "clear all root branches" flow, which intentionally has different
 * semantics). Returns the document unchanged if the target node doesn't
 * exist or is the root.
 */
export function deleteNodePreservingChildren(
  doc: CanonicalDocument,
  nodeId: string
): CanonicalDocument {
  const target = doc.nodes.find((n) => n.id === nodeId);
  if (!target || !target.parentId) return doc;

  const grandparentId = target.parentId;
  const directChildren = doc.nodes.filter((n) => n.parentId === nodeId);
  const directChildIds = new Set(directChildren.map((c) => c.id));

  const nextNodes = doc.nodes
    .filter((n) => n.id !== nodeId)
    .map((n) => (directChildIds.has(n.id) ? { ...n, parentId: grandparentId } : n));

  // Drop the edge into the deleted node and every edge out of it to its
  // children; replace the latter with fresh edges from each reparented
  // child directly to the grandparent, using the same id convention as the
  // rest of the model (`${parentId}->${childId}`).
  const nextEdges: CanonicalEdge[] = doc.edges.filter(
    (e) => e.target !== nodeId && e.source !== nodeId
  );
  for (const child of directChildren) {
    nextEdges.push({
      id: `${grandparentId}->${child.id}`,
      source: grandparentId,
      target: child.id,
    });
  }

  const validNodeIds = new Set(nextNodes.map((n) => n.id));
  const nextAnnotations = pruneOrphanAnnotations(doc.annotations, validNodeIds);

  return {
    ...doc,
    nodes: nextNodes,
    edges: nextEdges,
    annotations: nextAnnotations,
    updatedAt: new Date().toISOString(),
  };
}

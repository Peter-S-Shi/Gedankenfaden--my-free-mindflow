import { CanonicalDocument } from './types';

export interface DeletionPlan {
  kind: 'delete-node' | 'delete-subtree' | 'clear-root-branches';
  nodeIds: string[];
  title: string;
  message: string;
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

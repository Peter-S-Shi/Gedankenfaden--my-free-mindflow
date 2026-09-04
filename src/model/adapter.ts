import type { Node, Edge } from '@xyflow/react';
import { CanonicalDocument, CanonicalNode, CanonicalEdge } from './types';
import { cloneDocument } from './document';

export interface CustomNodeData extends Record<string, unknown> {
  label: string;
  nodeType?: string;
  style?: CanonicalNode['style'];
  parentId?: string;
  isNewBorn?: boolean;
}

export function canonicalToReactFlow(doc: CanonicalDocument): {
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
} {
  const nodes: Node<CustomNodeData>[] = doc.nodes.map((n) => ({
    id: n.id,
    type: 'customNode',
    position: { x: n.geometry.x, y: n.geometry.y },
    data: {
      label: n.text,
      nodeType: n.type,
      style: n.style,
      parentId: n.parentId,
      ...(n.data || {}),
    },
    style: {
      width: n.geometry.width,
      height: n.geometry.height,
    },
  }));

  const edges: Edge[] = doc.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: e.type || (doc.mode === 'mindmap' ? 'smoothstep' : 'bezier'),
    animated: false,
    style: {
      stroke: e.style?.stroke || '#94a3b8',
      strokeWidth: e.style?.strokeWidth || 2,
    },
  }));

  return { nodes, edges };
}

export function reactFlowToCanonical(
  rfNodes: Node<CustomNodeData>[],
  rfEdges: Edge[],
  baseDoc: CanonicalDocument
): CanonicalDocument {
  const nextDoc = cloneDocument(baseDoc);

  // Map existing canonical nodes map for fast lookup
  const nodeMap = new Map<string, CanonicalNode>(baseDoc.nodes.map((n) => [n.id, n]));

  nextDoc.nodes = rfNodes.map((rn) => {
    const existing = nodeMap.get(rn.id);
    return {
      id: rn.id,
      text: rn.data?.label || existing?.text || 'Node',
      geometry: {
        x: rn.position.x,
        y: rn.position.y,
        width: typeof rn.style?.width === 'number' ? rn.style.width : (existing?.geometry.width || 150),
        height: typeof rn.style?.height === 'number' ? rn.style.height : (existing?.geometry.height || 44),
      },
      type: (rn.data?.nodeType as CanonicalNode['type']) || existing?.type || 'default',
      parentId: rn.data?.parentId || existing?.parentId,
      style: rn.data?.style || existing?.style,
      data: rn.data,
    };
  });

  const edgeMap = new Map<string, CanonicalEdge>(baseDoc.edges.map((e) => [e.id, e]));

  nextDoc.edges = rfEdges.map((re) => {
    const existing = edgeMap.get(re.id);
    return {
      id: re.id,
      source: re.source,
      target: re.target,
      label: typeof re.label === 'string' ? re.label : existing?.label,
      type: (re.type as CanonicalEdge['type']) || existing?.type || 'smoothstep',
      style: existing?.style,
    };
  });

  nextDoc.updatedAt = new Date().toISOString();
  return nextDoc;
}

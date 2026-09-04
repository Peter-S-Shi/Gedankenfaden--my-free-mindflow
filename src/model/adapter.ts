import type { Node, Edge } from '@xyflow/react';
import { CanonicalDocument, CanonicalNode, CanonicalEdge, NodeShape } from './types';
import { cloneDocument } from './document';
import { resolveNodeVisuals, BUILTIN_THEMES, ResolvedNodeVisuals } from './theme';
import { computeDocumentNumbering } from './numbering';

export interface CustomNodeData extends Record<string, unknown> {
  label: string;
  nodeType?: CanonicalNode['type'];
  style?: CanonicalNode['style'];
  shape?: NodeShape;
  assetRef?: string;
  collapsed?: boolean;
  manualOffset?: { dx: number; dy: number };
  parentId?: string;
  isNewBorn?: boolean;
  visuals?: ResolvedNodeVisuals;
  numberingBadge?: string;
  hasChildren?: boolean;
  childCount?: number;
  onToggleFold?: (nodeId: string) => void;
}

export function canonicalToReactFlow(
  doc: CanonicalDocument,
  callbacks?: { onToggleFold?: (nodeId: string) => void }
): {
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
} {
  const theme = doc.theme || BUILTIN_THEMES['nordic-slate'];
  const numberingMap = computeDocumentNumbering(doc);

  // Identify collapsed nodes and their descendant tree
  const collapsedNodeIds = new Set<string>();
  const childrenMap = new Map<string, string[]>();

  for (const n of doc.nodes) {
    if (n.collapsed) {
      collapsedNodeIds.add(n.id);
    }
    if (n.parentId) {
      const list = childrenMap.get(n.parentId) || [];
      list.push(n.id);
      childrenMap.set(n.parentId, list);
    }
  }

  const hiddenNodeIds = new Set<string>();
  if (collapsedNodeIds.size > 0) {
    const hideDescendants = (parentId: string) => {
      const children = childrenMap.get(parentId) || [];
      for (const childId of children) {
        hiddenNodeIds.add(childId);
        hideDescendants(childId);
      }
    };
    for (const cId of collapsedNodeIds) {
      hideDescendants(cId);
    }
  }

  const nodes: Node<CustomNodeData>[] = doc.nodes.map((n) => {
    const visuals = resolveNodeVisuals(n, theme);
    const directChildren = childrenMap.get(n.id) || [];
    const hasChildren = directChildren.length > 0;
    const isHidden = hiddenNodeIds.has(n.id);

    return {
      id: n.id,
      type: 'customNode',
      position: { x: n.geometry.x, y: n.geometry.y },
      hidden: isHidden,
      data: {
        label: n.text,
        nodeType: n.type,
        style: n.style,
        shape: n.shape || visuals.shape,
        assetRef: n.assetRef,
        collapsed: Boolean(n.collapsed),
        manualOffset: n.manualOffset,
        parentId: n.parentId,
        visuals,
        numberingBadge: numberingMap.get(n.id),
        hasChildren,
        childCount: directChildren.length,
        onToggleFold: callbacks?.onToggleFold,
        ...(n.data || {}),
      },
      style: {
        width: n.geometry.width,
        height: n.geometry.height,
      },
    };
  });

  const defaultEdgeColor = theme.edgeColor || '#94a3b8';
  const edges: Edge[] = doc.edges.map((e) => {
    const isHidden = hiddenNodeIds.has(e.source) || hiddenNodeIds.has(e.target);

    const isFlowchart = doc.mode === 'flowchart';
    const edgeType =
      e.type === 'orthogonal'
        ? 'smoothstep'
        : e.type || (isFlowchart ? theme.defaultEdgeRouting || 'smoothstep' : 'smoothstep');

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      label: e.label,
      type: edgeType,
      animated: false,
      hidden: isHidden,
      markerEnd:
        isFlowchart || e.style?.arrowEnd
          ? {
              type: 'arrowclosed' as const,
              color: e.style?.stroke || defaultEdgeColor,
              width: 16,
              height: 16,
            }
          : undefined,
      style: {
        stroke: e.style?.stroke || defaultEdgeColor,
        strokeWidth: e.style?.strokeWidth || 2,
      },
    };
  });

  return { nodes, edges };
}

export function reactFlowToCanonical(
  rfNodes: Node<CustomNodeData>[],
  rfEdges: Edge[],
  baseDoc: CanonicalDocument
): CanonicalDocument {
  const nextDoc = cloneDocument(baseDoc);

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
      shape: (rn.data?.shape as NodeShape) || existing?.shape,
      assetRef: (rn.data?.assetRef as string) || existing?.assetRef,
      collapsed: typeof rn.data?.collapsed === 'boolean' ? rn.data.collapsed : existing?.collapsed,
      manualOffset: rn.data?.manualOffset || existing?.manualOffset,
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
      sourceHandle: re.sourceHandle || existing?.sourceHandle,
      targetHandle: re.targetHandle || existing?.targetHandle,
      label: typeof re.label === 'string' ? re.label : existing?.label,
      type: (re.type as CanonicalEdge['type']) || existing?.type || 'smoothstep',
      style: existing?.style,
    };
  });

  nextDoc.updatedAt = new Date().toISOString();
  return nextDoc;
}

import type { Node, Edge } from '@xyflow/react';
import { CanonicalDocument, CanonicalNode, CanonicalEdge, DocumentMode, NodeShape } from './types';
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
  /** Document mode -- decides which resize affordance CustomNode renders: width-only for Mind Map, width+height for Flowchart. */
  mode?: DocumentMode;
  onToggleFold?: (nodeId: string) => void;
  onUpdateLabel?: (nodeId: string, label: string) => void;
  /**
   * Product Hardening: Persistent Manual Node Sizing -- Mind Map's width-only
   * resize handle only ever changes width natively; this callback lets
   * CustomNode ask the canvas to recompute and apply the text-aware auto
   * height live, on every drag frame, without touching canonical state or
   * history (see `CanvasEditor.handleLiveResizeWidth`).
   */
  onLiveResizeWidth?: (nodeId: string, height: number) => void;
  /**
   * Commits the completed native resize gesture back to the canonical model.
   * React Flow owns the live DOM/node dimensions while dragging; the canvas
   * uses this explicit gesture-end bridge to create exactly one durable
   * `manualSize` + history checkpoint.
   */
  onResizeEnd?: (nodeId: string, dimensions: { width: number; height: number }) => void;
}

const PROJECTION_ONLY_NODE_DATA_KEYS = new Set([
  'label',
  'nodeType',
  'style',
  'shape',
  'assetRef',
  'collapsed',
  'manualOffset',
  'parentId',
  'isNewBorn',
  'isDeleting',
  'visuals',
  'numberingBadge',
  'hasChildren',
  'childCount',
  'mode',
  'onToggleFold',
  'onUpdateLabel',
  'onLiveResizeWidth',
  'onResizeEnd',
]);

function preserveDomainNodeData(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const preserved = Object.fromEntries(
    Object.entries(data).filter(([key]) => !PROJECTION_ONLY_NODE_DATA_KEYS.has(key))
  );
  return Object.keys(preserved).length > 0 ? preserved : undefined;
}

export interface CanonicalToReactFlowCallbacks {
  onToggleFold?: (nodeId: string) => void;
  onUpdateLabel?: (nodeId: string, label: string) => void;
  onLiveResizeWidth?: (nodeId: string, height: number) => void;
  onResizeEnd?: (nodeId: string, dimensions: { width: number; height: number }) => void;
  selectedNodeId?: string | null;
}

export function canonicalToReactFlow(
  doc: CanonicalDocument,
  callbacks?: CanonicalToReactFlowCallbacks
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
    const isSelected = Boolean(callbacks?.selectedNodeId && n.id === callbacks.selectedNodeId);

    return {
      id: n.id,
      type: 'customNode',
      position: { x: n.geometry.x, y: n.geometry.y },
      selected: isSelected,
      hidden: isHidden,
      data: {
        ...preserveDomainNodeData(n.data),
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
        mode: doc.mode,
        onToggleFold: callbacks?.onToggleFold,
        onUpdateLabel: callbacks?.onUpdateLabel,
        onLiveResizeWidth: callbacks?.onLiveResizeWidth,
        onResizeEnd: callbacks?.onResizeEnd,
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
      className: 'signature-connect-draw',
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
        // A resize (`NodeResizeControl`/`NodeResizer`) writes the new size to
        // React Flow's own `width`/`height`/`measured` node fields, not to
        // `style` -- read those first (same precedence order React Flow's
        // own renderer uses) so a live or just-completed resize round-trips
        // into canonical geometry; `style.width/height` (what this adapter
        // itself writes on every projection) is the fallback for anything
        // that hasn't been resized.
        width:
          typeof rn.width === 'number'
            ? rn.width
            : typeof rn.measured?.width === 'number'
              ? rn.measured.width
              : typeof rn.style?.width === 'number'
                ? rn.style.width
                : existing?.geometry.width || 150,
        height:
          typeof rn.height === 'number'
            ? rn.height
            : typeof rn.measured?.height === 'number'
              ? rn.measured.height
              : typeof rn.style?.height === 'number'
                ? rn.style.height
                : existing?.geometry.height || 44,
      },
      type: (rn.data?.nodeType as CanonicalNode['type']) || existing?.type || 'default',
      parentId: rn.data?.parentId || existing?.parentId,
      shape: (rn.data?.shape as NodeShape) || existing?.shape,
      assetRef: (rn.data?.assetRef as string) || existing?.assetRef,
      collapsed: typeof rn.data?.collapsed === 'boolean' ? rn.data.collapsed : existing?.collapsed,
      manualSize: existing?.manualSize,
      manualOffset: rn.data?.manualOffset || existing?.manualOffset,
      style: rn.data?.style || existing?.style,
      data: preserveDomainNodeData(rn.data),
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

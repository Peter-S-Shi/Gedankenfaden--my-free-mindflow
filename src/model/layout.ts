import dagre from '@dagrejs/dagre';
import { CanonicalDocument, CanonicalNode } from './types';
import { cloneDocument } from './document';
import { layoutMindMapEngineV2 } from './mindMapLayoutEngine';

export interface LayoutOptions {
  preset?: 'balanced' | 'LR' | 'RL' | 'TB';
  direction?: 'LR' | 'TB' | 'RL' | 'BT';
  nodeWidth?: number;
  nodeHeight?: number;
  horizontalGap?: number;
  verticalGap?: number;
  centerCoordinates?: { x: number; y: number };
  /**
   * M1-D (#10c incremental-edit stability): the document's own prior
   * layout output, when the caller has one and this relayout is for a
   * single incremental edit (add/remove/edit a node) rather than a full
   * reset. Passed straight through to `layoutMindMapEngineV2` -- see its
   * `stabilizeAgainst` doc comment. Ignored on the flowchart and legacy
   * (LR/RL/TB) paths, which don't implement this contract.
   */
  stabilizeAgainst?: CanonicalDocument;
}

export function autoLayoutDocument(
  doc: CanonicalDocument,
  options: LayoutOptions = {}
): CanonicalDocument {
  if (doc.mode === 'flowchart') {
    return layoutFlowchartDocument(doc, options);
  }
  if (shouldUseMindMapEngineV2(options)) {
    return layoutMindMapEngineV2(doc, {
      preset: 'balanced',
      horizontalGap: options.horizontalGap,
      verticalGap: options.verticalGap,
      centerCoordinates: options.centerCoordinates,
      stabilizeAgainst: options.stabilizeAgainst,
    });
  }
  return layoutMindMapDocument(doc, options);
}

function resolveMindMapPreset(options: LayoutOptions): NonNullable<LayoutOptions['preset']> {
  return (
    options.preset ||
    (options.direction === 'LR' || options.direction === 'RL' || options.direction === 'TB'
      ? options.direction
      : 'balanced')
  );
}

function shouldUseMindMapEngineV2(options: LayoutOptions): boolean {
  return resolveMindMapPreset(options) === 'balanced';
}

/**
 * Layout engine for Directed Flowcharts (using Dagre)
 */
function layoutFlowchartDocument(
  doc: CanonicalDocument,
  options: LayoutOptions
): CanonicalDocument {
  const direction = options.direction || 'TB';
  const defaultWidth = options.nodeWidth || 160;
  const defaultHeight = options.nodeHeight || 48;
  const nodeSeparation = 50;
  const rankSeparation = 60;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: nodeSeparation,
    ranksep: rankSeparation,
    marginx: 50,
    marginy: 50,
  });
  g.setDefaultEdgeLabel(() => ({}));

  doc.nodes.forEach((node) => {
    // Flowchart nodes get independent width+height manual resize (Product
    // Hardening: Persistent Manual Node Sizing) -- `manualSize` is the
    // explicit persisted intent, honored ahead of whatever is already in
    // `geometry` so Auto Layout never silently reverts a manual resize.
    const width = node.manualSize?.width ?? node.geometry.width ?? defaultWidth;
    const height = node.manualSize?.height ?? node.geometry.height ?? defaultHeight;
    g.setNode(node.id, { width, height });
  });

  doc.edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const nextDoc = cloneDocument(doc);
  nextDoc.nodes = doc.nodes.map((node): CanonicalNode => {
    const dagreNode = g.node(node.id);
    if (!dagreNode) return node;

    const width = node.manualSize?.width ?? node.geometry.width ?? defaultWidth;
    const height = node.manualSize?.height ?? node.geometry.height ?? defaultHeight;

    let x = Math.round(dagreNode.x - width / 2);
    let y = Math.round(dagreNode.y - height / 2);

    if (node.manualOffset) {
      x += node.manualOffset.dx;
      y += node.manualOffset.dy;
    }

    return {
      ...node,
      geometry: { x, y, width, height },
    };
  });

  nextDoc.updatedAt = new Date().toISOString();
  return nextDoc;
}

/**
 * Centered Bidirectional Balanced Layout Engine for Mind Maps
 */
export function layoutMindMapDocument(
  doc: CanonicalDocument,
  options: LayoutOptions = {}
): CanonicalDocument {
  const preset = resolveMindMapPreset(options);
  const defaultWidth = options.nodeWidth || 150;
  const defaultHeight = options.nodeHeight || 44;
  const hGap = options.horizontalGap || 90;
  const vGap = options.verticalGap || 24;

  const nextDoc = cloneDocument(doc);
  if (nextDoc.nodes.length === 0) return nextDoc;

  // Locate central root node
  const rootNode = nextDoc.nodes.find((n) => n.type === 'root') || nextDoc.nodes.find((n) => !n.parentId) || nextDoc.nodes[0];
  const rootWidth = rootNode.manualSize?.width ?? rootNode.geometry.width ?? 160;
  const rootHeight = rootNode.geometry.height || 48;

  const rootX = options.centerCoordinates?.x ?? 400;
  const rootY = options.centerCoordinates?.y ?? 300;

  // Build node lookup and hierarchy maps
  const childrenMap = new Map<string, CanonicalNode[]>();

  for (const node of nextDoc.nodes) {
    if (node.parentId && node.parentId !== node.id) {
      const list = childrenMap.get(node.parentId) || [];
      list.push(node);
      childrenMap.set(node.parentId, list);
    }
  }

  // Position root node
  rootNode.geometry = {
    x: rootX,
    y: rootY,
    width: rootWidth,
    height: rootHeight,
  };
  if (rootNode.manualOffset) {
    rootNode.geometry.x += rootNode.manualOffset.dx;
    rootNode.geometry.y += rootNode.manualOffset.dy;
  }

  const rootCenterX = rootX + rootWidth / 2;

  // Get Level 1 children
  const level1Children = childrenMap.get(rootNode.id) || [];

  // Partition Level 1 children into Right and Left wings based on preset
  let rightWingChildren: CanonicalNode[] = [];
  let leftWingChildren: CanonicalNode[] = [];
  let topDownChildren: CanonicalNode[] = [];

  if (preset === 'LR') {
    rightWingChildren = [...level1Children];
  } else if (preset === 'RL') {
    leftWingChildren = [...level1Children];
  } else if (preset === 'TB') {
    topDownChildren = [...level1Children];
  } else {
    // Balanced (Centered Bidirectional)
    // Alternate or balance by height
    level1Children.forEach((child, index) => {
      if (index % 2 === 0) {
        rightWingChildren.push(child);
      } else {
        leftWingChildren.push(child);
      }
    });
  }

  const edgeHandleAssignments = new Map<string, { sourceHandle: string; targetHandle: string }>();

  function nodeHeight(node: CanonicalNode) {
    return node.geometry.height || defaultHeight;
  }

  function nodeWidth(node: CanonicalNode) {
    return node.manualSize?.width ?? node.geometry.width ?? defaultWidth;
  }

  const columnStride = Math.max(...nextDoc.nodes.map(nodeWidth)) + hGap;

  function layoutHorizontalChildren(
    parentNode: CanonicalNode,
    side: 'right' | 'left',
    firstColumn: number,
    children = childrenMap.get(parentNode.id) || []
  ): number {
    if (parentNode.collapsed || children.length === 0) return firstColumn;

    const largestChildHeight = Math.max(...children.map(nodeHeight));
    const siblingPitch = largestChildHeight + vGap;
    const localityBudget = Math.max(nodeHeight(parentNode), largestChildHeight) + siblingPitch;
    const heightBasedRows = Math.floor(localityBudget / siblingPitch);
    // For an extreme fan-out (many direct children under one node), rows based
    // purely on height stay ~constant, forcing children.length / rowsPerColumn
    // columns -- a linearly widening strip that pushes far children thousands
    // of pixels from the parent. Scale rows with sqrt(children.length) so the
    // group grows into a roughly square block instead, bounding the distance
    // from parent to its farthest child. floor(sqrt(n)) stays <=2 for n<9, so
    // ordinary/modest fan-outs keep their existing compact behavior unchanged.
    const fanoutRows = Math.floor(Math.sqrt(children.length));
    const rowsPerColumn = Math.max(2, heightBasedRows, fanoutRows);
    const parentCenterY = parentNode.geometry.y + nodeHeight(parentNode) / 2;
    let nextColumn = firstColumn;

    for (let groupStart = 0; groupStart < children.length; groupStart += rowsPerColumn) {
      const group = children.slice(groupStart, groupStart + rowsPerColumn);
      group.forEach((child, row) => {
        const cWidth = nodeWidth(child);
        const cHeight = nodeHeight(child);
        const centerY = parentCenterY + (row - (group.length - 1) / 2) * siblingPitch;
        const cX = side === 'right'
          ? rootX + rootWidth + hGap + (nextColumn - 1) * columnStride
          : rootX - cWidth - hGap - (nextColumn - 1) * columnStride;
        const cY = centerY - cHeight / 2;

        child.geometry = {
          x: Math.round(cX),
          y: Math.round(cY),
          width: cWidth,
          height: cHeight,
        };

        if (child.manualOffset) {
          child.geometry.x += child.manualOffset.dx;
          child.geometry.y += child.manualOffset.dy;
        }

        edgeHandleAssignments.set(`${parentNode.id}->${child.id}`, {
          sourceHandle: side,
          targetHandle: side === 'right' ? 'left' : 'right',
        });
      });

      let descendantColumn = nextColumn + 1;
      group.forEach((child) => {
        descendantColumn = layoutHorizontalChildren(child, side, descendantColumn);
      });
      nextColumn = descendantColumn;
    }
    return nextColumn;
  }

  // Top-to-Bottom preset layout
  if (topDownChildren.length > 0) {
    let totalWidth = 0;
    topDownChildren.forEach((child, idx) => {
      const w = nodeWidth(child);
      totalWidth += w;
      if (idx > 0) totalWidth += hGap;
    });

    let currentX = rootCenterX - totalWidth / 2;
    topDownChildren.forEach((child) => {
      const cWidth = nodeWidth(child);
      const cHeight = nodeHeight(child);
      const cX = currentX;
      const cY = rootY + rootHeight + vGap * 2;

      child.geometry = {
        x: Math.round(cX),
        y: Math.round(cY),
        width: cWidth,
        height: cHeight,
      };

      edgeHandleAssignments.set(`${rootNode.id}->${child.id}`, {
        sourceHandle: 'bottom',
        targetHandle: 'top',
      });

      currentX += cWidth + hGap;
    });
  } else {
    // Execute Right and Left wings
    layoutHorizontalChildren(rootNode, 'right', 1, rightWingChildren);
    layoutHorizontalChildren(rootNode, 'left', 1, leftWingChildren);
  }

  // Update edges with clean handles
  nextDoc.edges = nextDoc.edges.map((edge) => {
    const handleKey = `${edge.source}->${edge.target}`;
    const handles = edgeHandleAssignments.get(handleKey);
    if (handles) {
      return {
        ...edge,
        sourceHandle: handles.sourceHandle,
        targetHandle: handles.targetHandle,
        type: 'smoothstep',
      };
    }
    return edge;
  });

  nextDoc.updatedAt = new Date().toISOString();
  return nextDoc;
}

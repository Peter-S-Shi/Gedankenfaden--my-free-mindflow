import dagre from '@dagrejs/dagre';
import { CanonicalDocument, CanonicalNode } from './types';
import { cloneDocument } from './document';

export interface LayoutOptions {
  preset?: 'balanced' | 'LR' | 'RL' | 'TB';
  direction?: 'LR' | 'TB' | 'RL' | 'BT';
  nodeWidth?: number;
  nodeHeight?: number;
  horizontalGap?: number;
  verticalGap?: number;
  centerCoordinates?: { x: number; y: number };
}

interface SubtreeMetrics {
  height: number;
  nodeCount: number;
}

export function autoLayoutDocument(
  doc: CanonicalDocument,
  options: LayoutOptions = {}
): CanonicalDocument {
  if (doc.mode === 'flowchart') {
    return layoutFlowchartDocument(doc, options);
  }
  return layoutMindMapDocument(doc, options);
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
    const width = node.geometry.width || defaultWidth;
    const height = node.geometry.height || defaultHeight;
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

    const width = node.geometry.width || defaultWidth;
    const height = node.geometry.height || defaultHeight;

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
  const preset =
    options.preset ||
    (options.direction === 'LR' || options.direction === 'RL' || options.direction === 'TB'
      ? options.direction
      : 'balanced');
  const defaultWidth = options.nodeWidth || 150;
  const defaultHeight = options.nodeHeight || 44;
  const hGap = options.horizontalGap || 90;
  const vGap = options.verticalGap || 24;

  const nextDoc = cloneDocument(doc);
  if (nextDoc.nodes.length === 0) return nextDoc;

  // Locate central root node
  const rootNode = nextDoc.nodes.find((n) => n.type === 'root') || nextDoc.nodes.find((n) => !n.parentId) || nextDoc.nodes[0];
  const rootWidth = rootNode.geometry.width || 160;
  const rootHeight = rootNode.geometry.height || 48;

  const rootX = options.centerCoordinates?.x ?? 400;
  const rootY = options.centerCoordinates?.y ?? 300;

  // Build node lookup and hierarchy maps
  const nodeMap = new Map<string, CanonicalNode>(nextDoc.nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, CanonicalNode[]>();

  for (const node of nextDoc.nodes) {
    if (node.parentId && node.parentId !== node.id) {
      const list = childrenMap.get(node.parentId) || [];
      list.push(node);
      childrenMap.set(node.parentId, list);
    }
  }

  // Calculate subtree vertical metrics recursively
  const metricsCache = new Map<string, SubtreeMetrics>();

  function calculateSubtreeMetrics(nodeId: string): SubtreeMetrics {
    if (metricsCache.has(nodeId)) {
      return metricsCache.get(nodeId)!;
    }

    const node = nodeMap.get(nodeId);
    const nHeight = node?.geometry.height || defaultHeight;
    const children = childrenMap.get(nodeId) || [];

    // If node is collapsed, children do not contribute to layout span
    if (!node || node.collapsed || children.length === 0) {
      const metrics = { height: nHeight, nodeCount: 1 };
      metricsCache.set(nodeId, metrics);
      return metrics;
    }

    let totalChildrenHeight = 0;
    let totalCount = 1;

    children.forEach((child, idx) => {
      const childMetrics = calculateSubtreeMetrics(child.id);
      totalChildrenHeight += childMetrics.height;
      totalCount += childMetrics.nodeCount;
      if (idx > 0) totalChildrenHeight += vGap;
    });

    const metrics = {
      height: Math.max(nHeight, totalChildrenHeight),
      nodeCount: totalCount,
    };
    metricsCache.set(nodeId, metrics);
    return metrics;
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

  const rootCenterY = rootY + rootHeight / 2;
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

  // Helper to layout a horizontal wing (Right or Left)
  function layoutHorizontalWing(
    wingList: CanonicalNode[],
    side: 'right' | 'left'
  ) {
    if (wingList.length === 0) return;

    let totalWingHeight = 0;
    wingList.forEach((child, idx) => {
      totalWingHeight += calculateSubtreeMetrics(child.id).height;
      if (idx > 0) totalWingHeight += vGap;
    });

    let currentY = rootCenterY - totalWingHeight / 2;

    wingList.forEach((level1Node) => {
      const subtreeMetrics = calculateSubtreeMetrics(level1Node.id);
      const subtreeY = currentY;
      const centerY = subtreeY + subtreeMetrics.height / 2;

      const nWidth = level1Node.geometry.width || defaultWidth;
      const nHeight = level1Node.geometry.height || defaultHeight;

      const nX =
        side === 'right'
          ? rootX + rootWidth + hGap
          : rootX - nWidth - hGap;
      const nY = centerY - nHeight / 2;

      level1Node.geometry = {
        x: Math.round(nX),
        y: Math.round(nY),
        width: nWidth,
        height: nHeight,
      };

      if (level1Node.manualOffset) {
        level1Node.geometry.x += level1Node.manualOffset.dx;
        level1Node.geometry.y += level1Node.manualOffset.dy;
      }

      // Root to Level 1 edge handles
      edgeHandleAssignments.set(`${rootNode.id}->${level1Node.id}`, {
        sourceHandle: side,
        targetHandle: side === 'right' ? 'left' : 'right',
      });

      // Layout descendants recursively
      layoutSubtreeChildren(level1Node, side, subtreeY);

      currentY += subtreeMetrics.height + vGap;
    });
  }

  function layoutSubtreeChildren(
    parentNode: CanonicalNode,
    side: 'right' | 'left',
    topBoundY: number
  ) {
    if (parentNode.collapsed) return;

    const children = childrenMap.get(parentNode.id) || [];
    if (children.length === 0) return;

    let currentY = topBoundY;

    children.forEach((child) => {
      const childMetrics = calculateSubtreeMetrics(child.id);
      const centerY = currentY + childMetrics.height / 2;

      const cWidth = child.geometry.width || defaultWidth;
      const cHeight = child.geometry.height || defaultHeight;

      const pX = parentNode.geometry.x;
      const pWidth = parentNode.geometry.width || defaultWidth;

      const cX =
        side === 'right'
          ? pX + pWidth + hGap
          : pX - cWidth - hGap;
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

      layoutSubtreeChildren(child, side, currentY);

      currentY += childMetrics.height + vGap;
    });
  }

  // Top-to-Bottom preset layout
  if (topDownChildren.length > 0) {
    let totalWidth = 0;
    topDownChildren.forEach((child, idx) => {
      const w = child.geometry.width || defaultWidth;
      totalWidth += w;
      if (idx > 0) totalWidth += hGap;
    });

    let currentX = rootCenterX - totalWidth / 2;
    topDownChildren.forEach((child) => {
      const cWidth = child.geometry.width || defaultWidth;
      const cHeight = child.geometry.height || defaultHeight;
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
    layoutHorizontalWing(rightWingChildren, 'right');
    layoutHorizontalWing(leftWingChildren, 'left');
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

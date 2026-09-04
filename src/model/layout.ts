import dagre from '@dagrejs/dagre';
import { CanonicalDocument, CanonicalNode } from './types';
import { cloneDocument } from './document';

export interface LayoutOptions {
  direction?: 'LR' | 'TB' | 'RL' | 'BT';
  nodeWidth?: number;
  nodeHeight?: number;
  nodeSeparation?: number;
  rankSeparation?: number;
}

export function autoLayoutDocument(
  doc: CanonicalDocument,
  options: LayoutOptions = {}
): CanonicalDocument {
  const direction = options.direction || (doc.mode === 'mindmap' ? 'LR' : 'TB');
  const defaultWidth = options.nodeWidth || 160;
  const defaultHeight = options.nodeHeight || 48;
  const nodeSeparation = options.nodeSeparation || (doc.mode === 'mindmap' ? 30 : 50);
  const rankSeparation = options.rankSeparation || (doc.mode === 'mindmap' ? 80 : 60);

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: nodeSeparation,
    ranksep: rankSeparation,
    marginx: 50,
    marginy: 50,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes to dagre
  doc.nodes.forEach((node) => {
    const width = node.geometry.width || defaultWidth;
    const height = node.geometry.height || defaultHeight;
    g.setNode(node.id, { width, height });
  });

  // Add edges to dagre
  doc.edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  // Run layout
  dagre.layout(g);

  const nextDoc = cloneDocument(doc);
  nextDoc.nodes = doc.nodes.map((node): CanonicalNode => {
    const dagreNode = g.node(node.id);
    if (!dagreNode) return node;

    const width = node.geometry.width || defaultWidth;
    const height = node.geometry.height || defaultHeight;

    // Dagre returns node center coordinates; convert to top-left for standard canvas coordinates
    return {
      ...node,
      geometry: {
        x: Math.round(dagreNode.x - width / 2),
        y: Math.round(dagreNode.y - height / 2),
        width,
        height,
      },
    };
  });

  nextDoc.updatedAt = new Date().toISOString();
  return nextDoc;
}

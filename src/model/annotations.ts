import {
  CanonicalNode,
  MindMapAnnotation,
  BoundaryAnnotation,
  BraceAnnotation,
  RelationshipLineAnnotation,
  BoundaryStyle,
  BraceStyle,
  RelationshipLineStyle,
} from './types';

/**
 * Collects all descendant node IDs of the given anchor nodes recursively.
 */
export function collectSubtreeNodeIds(
  anchorNodeIds: string[],
  nodes: CanonicalNode[],
  options?: { visibleOnly?: boolean }
): string[] {
  const nodeMap = new Map<string, CanonicalNode>(nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, string[]>();

  for (const node of nodes) {
    if (node.parentId) {
      const list = childrenMap.get(node.parentId) || [];
      list.push(node.id);
      childrenMap.set(node.parentId, list);
    }
  }

  const result = new Set<string>();

  function traverse(nodeId: string) {
    result.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (options?.visibleOnly && node?.collapsed) {
      // Descendants of collapsed nodes are hidden
      return;
    }
    const children = childrenMap.get(nodeId) || [];
    for (const childId of children) {
      traverse(childId);
    }
  }

  for (const id of anchorNodeIds) {
    if (nodeMap.has(id)) {
      traverse(id);
    }
  }

  return Array.from(result);
}

/**
 * Groups selected nodes for Boundary annotation creation.
 * Strict contiguity rule:
 * - Group by parentId.
 * - For each parent, sort selected nodes according to sibling order in document.
 * - Split into contiguous runs: non-contiguous siblings form separate boundaries.
 * - Nodes under different parents form separate boundaries.
 * - Root nodes (no parentId) each form their own boundary.
 */
export function groupNodesForBoundary(
  selectedNodeIds: string[],
  nodes: CanonicalNode[]
): string[][] {
  if (!selectedNodeIds.length || !nodes.length) return [];

  const nodeMap = new Map<string, CanonicalNode>(nodes.map((n) => [n.id, n]));

  // Build parent -> ordered children map based on document node order
  const parentChildrenMap = new Map<string, string[]>();
  for (const node of nodes) {
    const pId = node.parentId || '__root__';
    const list = parentChildrenMap.get(pId) || [];
    list.push(node.id);
    parentChildrenMap.set(pId, list);
  }

  const boundaryGroups: string[][] = [];

  // Group selected nodes by parentId
  const parentSelectedMap = new Map<string, string[]>();
  for (const id of selectedNodeIds) {
    const node = nodeMap.get(id);
    if (!node) continue;
    const pId = node.parentId || '__root__';
    const list = parentSelectedMap.get(pId) || [];
    list.push(id);
    parentSelectedMap.set(pId, list);
  }

  for (const [pId, selectedList] of parentSelectedMap.entries()) {
    if (pId === '__root__') {
      // Each root gets its own boundary
      for (const rootId of selectedList) {
        boundaryGroups.push([rootId]);
      }
      continue;
    }

    const allChildren = parentChildrenMap.get(pId) || [];
    // Map each selected node to its child index
    const indexPairs = selectedList
      .map((id) => ({ id, idx: allChildren.indexOf(id) }))
      .filter((p) => p.idx !== -1)
      .sort((a, b) => a.idx - b.idx);

    if (indexPairs.length === 0) continue;

    let currentRun: string[] = [indexPairs[0].id];
    let prevIdx = indexPairs[0].idx;

    for (let i = 1; i < indexPairs.length; i++) {
      const { id, idx } = indexPairs[i];
      if (idx === prevIdx + 1) {
        // Contiguous sibling
        currentRun.push(id);
      } else {
        // Discontinuity -> start new boundary group
        boundaryGroups.push(currentRun);
        currentRun = [id];
      }
      prevIdx = idx;
    }
    boundaryGroups.push(currentRun);
  }

  return boundaryGroups;
}

/**
 * Creates BoundaryAnnotation objects from selected node IDs.
 */
export function createBoundaryAnnotations(
  selectedNodeIds: string[],
  nodes: CanonicalNode[],
  defaultStyle?: BoundaryStyle
): BoundaryAnnotation[] {
  const groups = groupNodesForBoundary(selectedNodeIds, nodes);
  return groups.map((nodeIds, idx) => ({
    id: `boundary_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${idx}`,
    kind: 'boundary',
    title: 'Boundary',
    nodeIds,
    style: {
      borderColor: '#3b82f6',
      borderWidth: 1.5,
      borderStyle: 'dashed',
      fillColor: '#3b82f6',
      fillOpacity: 0.06,
      borderRadius: 12,
      ...defaultStyle,
    },
  }));
}

/**
 * Groups selected nodes for Brace annotation creation.
 * Sibling grouping rule:
 * - Group by parentId.
 * - All selected nodes under the same parent share ONE brace regardless of contiguity.
 * - Nodes under different parents split into separate braces.
 * - Root nodes each get their own brace.
 */
export function groupNodesForBrace(
  selectedNodeIds: string[],
  nodes: CanonicalNode[]
): { parentId?: string; nodeIds: string[] }[] {
  if (!selectedNodeIds.length || !nodes.length) return [];

  const nodeMap = new Map<string, CanonicalNode>(nodes.map((n) => [n.id, n]));
  const parentSelectedMap = new Map<string, string[]>();

  for (const id of selectedNodeIds) {
    const node = nodeMap.get(id);
    if (!node) continue;
    const pId = node.parentId || '__root__';
    const list = parentSelectedMap.get(pId) || [];
    list.push(id);
    parentSelectedMap.set(pId, list);
  }

  const braceGroups: { parentId?: string; nodeIds: string[] }[] = [];

  for (const [pId, list] of parentSelectedMap.entries()) {
    if (pId === '__root__') {
      for (const rootId of list) {
        braceGroups.push({ parentId: undefined, nodeIds: [rootId] });
      }
    } else {
      braceGroups.push({ parentId: pId, nodeIds: list });
    }
  }

  return braceGroups;
}

/**
 * Creates BraceAnnotation objects from selected node IDs.
 */
export function createBraceAnnotations(
  selectedNodeIds: string[],
  nodes: CanonicalNode[],
  defaultStyle?: BraceStyle
): BraceAnnotation[] {
  const groups = groupNodesForBrace(selectedNodeIds, nodes);
  return groups.map((g, idx) => ({
    id: `brace_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${idx}`,
    kind: 'brace',
    parentId: g.parentId,
    nodeIds: g.nodeIds,
    label: 'Summary',
    style: {
      color: '#64748b',
      strokeWidth: 2,
      braceStyle: 'curly',
      ...defaultStyle,
    },
  }));
}

/**
 * Creates a RelationshipLineAnnotation between two nodes.
 */
export function createRelationshipLineAnnotation(
  sourceNodeId: string,
  targetNodeId: string,
  defaultStyle?: RelationshipLineStyle
): RelationshipLineAnnotation | null {
  if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
    return null;
  }

  return {
    id: `rel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind: 'relationshipLine',
    sourceNodeId,
    targetNodeId,
    label: '',
    style: {
      stroke: '#f59e0b',
      strokeWidth: 2,
      lineStyle: 'dashed',
      arrowEnd: true,
      arrowStart: false,
      ...defaultStyle,
    },
  };
}

export interface BoundaryBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Computes the pixel bounding box for a boundary annotation given current node geometries.
 */
export function computeBoundaryBox(
  annotation: BoundaryAnnotation,
  nodes: CanonicalNode[],
  padding = 16
): BoundaryBoundingBox | null {
  if (!annotation.nodeIds.length) return null;

  const nodeMap = new Map<string, CanonicalNode>(nodes.map((n) => [n.id, n]));
  const allSubtreeIds = collectSubtreeNodeIds(annotation.nodeIds, nodes, { visibleOnly: true });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = 0;

  for (const id of allSubtreeIds) {
    const node = nodeMap.get(id);
    if (!node || !node.geometry) continue;
    const w = node.geometry.width || 120;
    const h = node.geometry.height || 40;
    minX = Math.min(minX, node.geometry.x);
    minY = Math.min(minY, node.geometry.y);
    maxX = Math.max(maxX, node.geometry.x + w);
    maxY = Math.max(maxY, node.geometry.y + h);
    found++;
  }

  if (found === 0) return null;

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + 2 * padding,
    height: maxY - minY + 2 * padding,
  };
}

export interface BraceGeometry {
  side: 'left' | 'right';
  x: number;
  topY: number;
  bottomY: number;
  midY: number;
  pathD: string;
  labelPosition: { x: number; y: number };
}

/**
 * Computes the geometric curly brace SVG path and summary label placement for a BraceAnnotation.
 */
export function computeBraceGeometry(
  annotation: BraceAnnotation,
  nodes: CanonicalNode[],
  padding = 16
): BraceGeometry | null {
  if (!annotation.nodeIds.length) return null;

  const nodeMap = new Map<string, CanonicalNode>(nodes.map((n) => [n.id, n]));
  const allSubtreeIds = collectSubtreeNodeIds(annotation.nodeIds, nodes, { visibleOnly: true });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = 0;
  let leftCount = 0;
  let rightCount = 0;

  for (const id of allSubtreeIds) {
    const node = nodeMap.get(id);
    if (!node || !node.geometry) continue;
    const w = node.geometry.width || 120;
    const h = node.geometry.height || 40;
    minX = Math.min(minX, node.geometry.x);
    minY = Math.min(minY, node.geometry.y);
    maxX = Math.max(maxX, node.geometry.x + w);
    maxY = Math.max(maxY, node.geometry.y + h);
    found++;

    if (node.mindMapSide === 'left') {
      leftCount++;
    } else {
      rightCount++;
    }
  }

  if (found === 0) return null;

  const side: 'left' | 'right' = leftCount > rightCount ? 'left' : 'right';
  const midY = (minY + maxY) / 2;
  const braceWidth = 14;
  const cornerR = Math.min(10, Math.max(4, (maxY - minY) / 6));

  let outerX: number;
  let pathD: string;
  let labelPosition: { x: number; y: number };

  if (side === 'right') {
    outerX = maxX + padding;
    pathD = [
      `M ${outerX} ${minY}`,
      `Q ${outerX + braceWidth * 0.6} ${minY} ${outerX + braceWidth * 0.6} ${minY + cornerR}`,
      `L ${outerX + braceWidth * 0.6} ${midY - cornerR}`,
      `Q ${outerX + braceWidth * 0.6} ${midY} ${outerX + braceWidth} ${midY}`,
      `Q ${outerX + braceWidth * 0.6} ${midY} ${outerX + braceWidth * 0.6} ${midY + cornerR}`,
      `L ${outerX + braceWidth * 0.6} ${maxY - cornerR}`,
      `Q ${outerX + braceWidth * 0.6} ${maxY} ${outerX} ${maxY}`,
    ].join(' ');

    labelPosition = {
      x: outerX + braceWidth + 10,
      y: midY,
    };
  } else {
    outerX = minX - padding;
    pathD = [
      `M ${outerX} ${minY}`,
      `Q ${outerX - braceWidth * 0.6} ${minY} ${outerX - braceWidth * 0.6} ${minY + cornerR}`,
      `L ${outerX - braceWidth * 0.6} ${midY - cornerR}`,
      `Q ${outerX - braceWidth * 0.6} ${midY} ${outerX - braceWidth} ${midY}`,
      `Q ${outerX - braceWidth * 0.6} ${midY} ${outerX - braceWidth * 0.6} ${midY + cornerR}`,
      `L ${outerX - braceWidth * 0.6} ${maxY - cornerR}`,
      `Q ${outerX - braceWidth * 0.6} ${maxY} ${outerX} ${maxY}`,
    ].join(' ');

    labelPosition = {
      x: outerX - braceWidth - 10,
      y: midY,
    };
  }

  return {
    side,
    x: outerX,
    topY: minY,
    bottomY: maxY,
    midY,
    pathD,
    labelPosition,
  };
}

export interface RelationshipCurveGeometry {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  c1: { x: number; y: number };
  c2: { x: number; y: number };
  pathD: string;
  midPoint: { x: number; y: number };
}

/**
 * Computes cubic Bezier curve endpoints and control points for a RelationshipLineAnnotation.
 */
export function computeRelationshipCurve(
  annotation: RelationshipLineAnnotation,
  nodes: CanonicalNode[]
): RelationshipCurveGeometry | null {
  const nodeMap = new Map<string, CanonicalNode>(nodes.map((n) => [n.id, n]));
  const src = nodeMap.get(annotation.sourceNodeId);
  const tgt = nodeMap.get(annotation.targetNodeId);

  if (!src || !tgt || !src.geometry || !tgt.geometry) return null;

  const srcW = src.geometry.width || 120;
  const srcH = src.geometry.height || 40;
  const tgtW = tgt.geometry.width || 120;
  const tgtH = tgt.geometry.height || 40;

  const srcCenter = { x: src.geometry.x + srcW / 2, y: src.geometry.y + srcH / 2 };
  const tgtCenter = { x: tgt.geometry.x + tgtW / 2, y: tgt.geometry.y + tgtH / 2 };

  // 4 candidate face anchor points for source and target
  const srcAnchors = [
    { x: src.geometry.x + srcW, y: srcCenter.y, dir: { x: 1, y: 0 } },
    { x: src.geometry.x, y: srcCenter.y, dir: { x: -1, y: 0 } },
    { x: srcCenter.x, y: src.geometry.y + srcH, dir: { x: 0, y: 1 } },
    { x: srcCenter.x, y: src.geometry.y, dir: { x: 0, y: -1 } },
  ];

  const tgtAnchors = [
    { x: tgt.geometry.x, y: tgtCenter.y, dir: { x: -1, y: 0 } },
    { x: tgt.geometry.x + tgtW, y: tgtCenter.y, dir: { x: 1, y: 0 } },
    { x: tgtCenter.x, y: tgt.geometry.y, dir: { x: 0, y: -1 } },
    { x: tgtCenter.x, y: tgt.geometry.y + tgtH, dir: { x: 0, y: 1 } },
  ];

  let bestP1 = srcAnchors[0];
  let bestP2 = tgtAnchors[0];
  let bestScore = Infinity;

  for (const a1 of srcAnchors) {
    for (const a2 of tgtAnchors) {
      const vx = a2.x - a1.x;
      const vy = a2.y - a1.y;
      const d = Math.hypot(vx, vy);
      if (d === 0) continue;
      const ux = vx / d;
      const uy = vy / d;
      const align1 = a1.dir.x * ux + a1.dir.y * uy;
      const align2 = a2.dir.x * (-ux) + a2.dir.y * (-uy);
      const score = d - 50 * (align1 + align2);
      if (score < bestScore) {
        bestScore = score;
        bestP1 = a1;
        bestP2 = a2;
      }
    }
  }

  const p1 = { x: bestP1.x, y: bestP1.y };
  const p2 = { x: bestP2.x, y: bestP2.y };

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy);

  const curvatureFactor = annotation.style?.curvature ?? 1;

  if (curvatureFactor === 0) {
    const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    return {
      p1,
      p2,
      c1: p1,
      c2: p2,
      pathD: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`,
      midPoint,
    };
  }

  const baseCurvature = Math.max(25, Math.min(100, dist * 0.3));

  let c1Base = {
    x: p1.x + bestP1.dir.x * baseCurvature,
    y: p1.y + bestP1.dir.y * baseCurvature,
  };
  let c2Base = {
    x: p2.x + bestP2.dir.x * baseCurvature,
    y: p2.y + bestP2.dir.y * baseCurvature,
  };

  if (curvatureFactor !== 1 && dist > 0) {
    const ux = dx / dist;
    const uy = dy / dist;
    const nx = -uy;
    const ny = ux;

    const transformControlPoint = (pt: { x: number; y: number }) => {
      const vx = pt.x - p1.x;
      const vy = pt.y - p1.y;
      const vPara = vx * ux + vy * uy;
      const vPerp = vx * nx + vy * ny;
      const basePerp = Math.abs(vPerp) < 1e-3 ? baseCurvature * 0.5 : vPerp;
      const newPerp = basePerp * curvatureFactor;
      return {
        x: p1.x + vPara * ux + newPerp * nx,
        y: p1.y + vPara * uy + newPerp * ny,
      };
    };

    c1Base = transformControlPoint(c1Base);
    c2Base = transformControlPoint(c2Base);
  } else if (dist > 0 && Math.hypot(c1Base.x - p1.x, c1Base.y - p1.y) > 0) {
    // When curvatureFactor === 1 (default), if collinear, also give a clean default subtle bow
    const ux = dx / dist;
    const uy = dy / dist;
    const nx = -uy;
    const ny = ux;
    const vx1 = c1Base.x - p1.x;
    const vy1 = c1Base.y - p1.y;
    const vPerp1 = vx1 * nx + vy1 * ny;
    if (Math.abs(vPerp1) < 1e-3) {
      c1Base = { x: c1Base.x + nx * (baseCurvature * 0.4), y: c1Base.y + ny * (baseCurvature * 0.4) };
      c2Base = { x: c2Base.x + nx * (baseCurvature * 0.4), y: c2Base.y + ny * (baseCurvature * 0.4) };
    }
  }

  const c1 = {
    x: c1Base.x + (annotation.route?.c1Offset?.dx || 0),
    y: c1Base.y + (annotation.route?.c1Offset?.dy || 0),
  };

  const c2 = {
    x: c2Base.x + (annotation.route?.c2Offset?.dx || 0),
    y: c2Base.y + (annotation.route?.c2Offset?.dy || 0),
  };

  const pathD = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;

  // Cubic Bezier midpoint formula at t = 0.5
  // B(0.5) = 0.125*p1 + 0.375*c1 + 0.375*c2 + 0.125*p2
  const midPoint = {
    x: 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x,
    y: 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y,
  };

  return {
    p1,
    p2,
    c1,
    c2,
    pathD,
    midPoint,
  };
}

/**
 * Prunes orphaned annotations when anchor nodes are deleted.
 */
export function pruneOrphanAnnotations(
  annotations: MindMapAnnotation[] | undefined,
  validNodeIds: Set<string>
): MindMapAnnotation[] {
  if (!annotations || !annotations.length) return [];

  const next: MindMapAnnotation[] = [];

  for (const ann of annotations) {
    if (ann.kind === 'boundary') {
      const remainingNodeIds = ann.nodeIds.filter((id) => validNodeIds.has(id));
      if (remainingNodeIds.length > 0) {
        next.push({ ...ann, nodeIds: remainingNodeIds });
      }
    } else if (ann.kind === 'brace') {
      const remainingNodeIds = ann.nodeIds.filter((id) => validNodeIds.has(id));
      if (remainingNodeIds.length > 0) {
        next.push({ ...ann, nodeIds: remainingNodeIds });
      }
    } else if (ann.kind === 'relationshipLine') {
      if (validNodeIds.has(ann.sourceNodeId) && validNodeIds.has(ann.targetNodeId)) {
        next.push(ann);
      }
    }
  }

  return next;
}

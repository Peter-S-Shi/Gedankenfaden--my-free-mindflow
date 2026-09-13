/**
 * PROTOTYPE (M0 gate) -- throwaway. Not wired into production import/layout.
 *
 * Runs the *current production* `layoutMindMapDocument()` on the same
 * hierarchy and converts its output into the same `LayoutResult` shape the
 * contract metrics understand, so the baseline (what ships today) can sit
 * in the same comparison table as prototypes A and B.
 */
import { layoutMindMapDocument } from '../../model/layout';
import { CanonicalDocument, CanonicalNode, CanonicalEdge } from '../../model/types';
import { getDefaultTheme } from '../../model/theme';
import { LayoutResult, PositionedEdge, PositionedNode } from './contract';
import { computeDepths, buildChildrenMap, findRoot, ProtoEdgeInput, ProtoNodeInput } from './treeUtils';
import { computeTextAwareSize } from './textAwareGeometry';

export function layoutBaseline(
  nodes: ProtoNodeInput[],
  edges: ProtoEdgeInput[],
  options: { textAware?: boolean } = {}
): LayoutResult {
  const root = findRoot(nodes);
  const childrenMap = buildChildrenMap(nodes);
  const depths = computeDepths(root, childrenMap);

  const canonicalNodes: CanonicalNode[] = nodes.map((n) => ({
    id: n.id,
    text: n.text,
    type: n.id === root.id ? 'root' : 'default',
    parentId: n.parentId,
    collapsed: n.collapsed,
    // Current production behaviour: fixed geometry regardless of text,
    // UNLESS the caller explicitly opts into text-aware sizing (to isolate
    // "what does the baseline algorithm do if you only fix its geometry
    // input" from "what does the baseline algorithm do as shipped").
    geometry: options.textAware
      ? { x: 0, y: 0, ...computeTextAwareSize({ id: n.id, text: n.text }) }
      : { x: 0, y: 0, width: n.id === root.id ? 160 : 150, height: n.id === root.id ? 48 : 44 },
  }));

  const canonicalEdges: CanonicalEdge[] = edges.map((e) => ({
    id: `${e.source}->${e.target}`,
    source: e.source,
    target: e.target,
  }));

  const doc: CanonicalDocument = {
    schemaVersion: '1.0',
    id: 'proto_baseline',
    title: 'Baseline',
    mode: 'mindmap',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    theme: getDefaultTheme('mindmap'),
    nodes: canonicalNodes,
    edges: canonicalEdges,
    groups: [],
  };

  const laidOut = layoutMindMapDocument(doc, { preset: 'balanced', horizontalGap: 60, verticalGap: 24 });

  const resultNodes: PositionedNode[] = laidOut.nodes.map((n) => ({
    id: n.id,
    parentId: n.parentId,
    depth: depths.get(n.id) ?? 0,
    x: n.geometry.x,
    y: n.geometry.y,
    width: n.geometry.width || 150,
    height: n.geometry.height || 44,
  }));
  const resultEdges: PositionedEdge[] = laidOut.edges.map((e) => ({ source: e.source, target: e.target }));

  return { nodes: resultNodes, edges: resultEdges };
}

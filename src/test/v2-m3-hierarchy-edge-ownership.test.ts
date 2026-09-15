import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { canonicalToReactFlow, reactFlowToCanonical } from '../model/adapter';
import { autoLayoutDocument } from '../model/layout';
import { allowsManualConnections, edgeInteractionFlags, filterEdgeChangesForMode } from '../model/connectionPolicy';
import { CanonicalDocument, CanonicalNode } from '../model/types';

function addNode(doc: CanonicalDocument, id: string, parentId: string, text = id) {
  const node: CanonicalNode = { id, text, parentId, geometry: { x: 0, y: 0, width: 120, height: 44 } };
  doc.nodes.push(node);
  doc.edges.push({ id: `${parentId}->${id}`, source: parentId, target: id });
}

function buildFixture(mode: 'mindmap' | 'flowchart'): CanonicalDocument {
  const doc = createEmptyDocument('Edge ownership fixture', mode);
  const rootId = doc.nodes[0].id;
  addNode(doc, 'A', rootId);
  addNode(doc, 'B', rootId);
  return doc;
}

describe('M3: edgeInteractionFlags -- Mind Map hierarchy edges are not interaction objects', () => {
  it('locks every interaction flag for Mind Map edges', () => {
    expect(edgeInteractionFlags('mindmap')).toEqual({
      selectable: false,
      deletable: false,
      reconnectable: false,
      focusable: false,
      interactionWidth: 0,
    });
  });

  it('leaves Flowchart edges with no overrides (React Flow defaults -- selectable/deletable/reconnectable -- apply)', () => {
    expect(edgeInteractionFlags('flowchart')).toEqual({});
  });
});

describe('M3: canonicalToReactFlow projects locked edges in Mind Map, free edges in Flowchart', () => {
  it('every Mind Map edge is unselectable, undeletable, unreconnectable, unfocusable, with zero click-catch width', () => {
    const doc = buildFixture('mindmap');
    const { edges } = canonicalToReactFlow(doc);
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(edge.selectable).toBe(false);
      expect(edge.deletable).toBe(false);
      expect(edge.reconnectable).toBe(false);
      expect(edge.focusable).toBe(false);
      expect(edge.interactionWidth).toBe(0);
    }
  });

  it('Flowchart edges are left fully interactive (no restrictive flags forced)', () => {
    const doc = buildFixture('flowchart');
    const { edges } = canonicalToReactFlow(doc);
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(edge.selectable).toBeUndefined();
      expect(edge.deletable).toBeUndefined();
      expect(edge.reconnectable).toBeUndefined();
      expect(edge.focusable).toBeUndefined();
      expect(edge.interactionWidth).toBeUndefined();
    }
  });

  it('locked flags survive Auto Layout (every relayout re-derives them, not just first render)', () => {
    const doc = buildFixture('mindmap');
    const layouted = autoLayoutDocument(doc, { preset: 'balanced' });
    const { edges } = canonicalToReactFlow(layouted);
    for (const edge of edges) {
      expect(edge.selectable).toBe(false);
      expect(edge.deletable).toBe(false);
    }
  });
});

describe('M3: onEdgesChange defense in depth -- filterEdgeChangesForMode', () => {
  it('drops select and remove changes in Mind Map mode', () => {
    const changes = [
      { type: 'select' as const, id: 'e1', selected: true },
      { type: 'remove' as const, id: 'e2' },
      { type: 'add' as const, item: { id: 'e3' } as any },
    ];
    const filtered = filterEdgeChangesForMode(changes, 'mindmap');
    expect(filtered.map((c) => c.type)).toEqual(['add']);
  });

  it('passes every change through unchanged in Flowchart mode', () => {
    const changes = [
      { type: 'select' as const, id: 'e1', selected: true },
      { type: 'remove' as const, id: 'e2' },
    ];
    const filtered = filterEdgeChangesForMode(changes, 'flowchart');
    expect(filtered).toEqual(changes);
  });
});

describe('M3: hierarchy edges cannot be mutated through simulated edge events, in Mind Map', () => {
  it('an attempted edge selection never reaches canonical state (reactFlowToCanonical sees an edge that was never actually selectable)', () => {
    const doc = buildFixture('mindmap');
    const { nodes, edges } = canonicalToReactFlow(doc);
    // Even if some path forced `selected: true` onto the projected edge
    // object (bypassing the `selectable:false` UI gate entirely), the
    // hierarchy itself -- what reactFlowToCanonical persists -- must be
    // unaffected: no bend/path data, same source/target/handles.
    const tampered = edges.map((e) => ({ ...e, selected: true }));
    const roundTripped = reactFlowToCanonical(nodes, tampered, doc);
    expect(roundTripped.edges).toHaveLength(doc.edges.length);
    for (const edge of roundTripped.edges) {
      expect(edge).not.toHaveProperty('selected');
      expect(edge).not.toHaveProperty('data');
    }
  });

  it('a simulated remove change for a hierarchy edge is dropped before it can reach canonical state', () => {
    const doc = buildFixture('mindmap');
    const { edges } = canonicalToReactFlow(doc);
    const removeChange = { type: 'remove' as const, id: edges[0].id };
    const filtered = filterEdgeChangesForMode([removeChange], 'mindmap');
    expect(filtered).toEqual([]);
  });

  it('onConnect-style manual edge creation is refused in Mind Map (allowsManualConnections gate)', () => {
    expect(allowsManualConnections('mindmap')).toBe(false);
  });
});

describe('M3: Flowchart edge interaction remains fully intact', () => {
  it('a remove change for a Flowchart edge is preserved (deletable)', () => {
    const removeChange = { type: 'remove' as const, id: 'e1' };
    expect(filterEdgeChangesForMode([removeChange], 'flowchart')).toEqual([removeChange]);
  });

  it('manual connections remain allowed', () => {
    expect(allowsManualConnections('flowchart')).toBe(true);
  });
});

describe('M3: node movement still causes automatic edge re-routing regardless of edge lock', () => {
  it('moving a Mind Map node (manualOffset) still regenerates its edge from the resulting geometry', () => {
    const doc = buildFixture('mindmap');
    const baseline = autoLayoutDocument(doc, { preset: 'balanced' });
    const moved: CanonicalDocument = {
      ...baseline,
      nodes: baseline.nodes.map((n) => (n.id === 'A' ? { ...n, manualOffset: { dx: 60, dy: -30 } } : n)),
    };
    const relayouted = autoLayoutDocument(moved, { preset: 'balanced' });
    const edge = relayouted.edges.find((e) => e.target === 'A')!;
    expect(['left', 'right']).toContain(edge.sourceHandle);
    expect(['left', 'right']).toContain(edge.targetHandle);
    // Still locked after the move-triggered relayout.
    const { edges } = canonicalToReactFlow(relayouted);
    expect(edges.find((e) => e.target === 'A')?.selectable).toBe(false);
  });

  it('resizing a Mind Map node still regenerates its edge geometry and stays locked', () => {
    const doc = buildFixture('mindmap');
    const baseline = autoLayoutDocument(doc, { preset: 'balanced' });
    // Simulates CanvasEditor.handleResizeEnd: a manualSize is recorded and
    // the document is re-laid-out from it, same as a real resize gesture.
    const resized: CanonicalDocument = {
      ...baseline,
      nodes: baseline.nodes.map((n) => (n.id === 'A' ? { ...n, manualSize: { width: 320 } } : n)),
    };
    const relayouted = autoLayoutDocument(resized, { preset: 'balanced' });
    const nodeA = relayouted.nodes.find((n) => n.id === 'A')!;
    expect(nodeA.geometry.width).toBe(320);
    const edge = relayouted.edges.find((e) => e.target === 'A')!;
    expect(['left', 'right']).toContain(edge.sourceHandle);
    const { edges } = canonicalToReactFlow(relayouted);
    expect(edges.find((e) => e.target === 'A')?.selectable).toBe(false);
  });

  it('collapsing/expanding a Mind Map branch hides/reveals its edges and both states stay locked', () => {
    const doc = createEmptyDocument('Collapse edge fixture', 'mindmap');
    const rootId = doc.nodes[0].id;
    addNode(doc, 'A', rootId);
    addNode(doc, 'a1', 'A');
    const baseline = autoLayoutDocument(doc, { preset: 'balanced' });

    const collapsed: CanonicalDocument = {
      ...baseline,
      nodes: baseline.nodes.map((n) => (n.id === 'A' ? { ...n, collapsed: true } : n)),
    };
    const collapsedProjection = canonicalToReactFlow(collapsed);
    const hiddenEdge = collapsedProjection.edges.find((e) => e.source === 'A' && e.target === 'a1')!;
    expect(hiddenEdge.hidden).toBe(true);
    expect(hiddenEdge.selectable).toBe(false);

    const expanded: CanonicalDocument = {
      ...collapsed,
      nodes: collapsed.nodes.map((n) => (n.id === 'A' ? { ...n, collapsed: false } : n)),
    };
    const relayouted = autoLayoutDocument(expanded, { preset: 'balanced' });
    const expandedProjection = canonicalToReactFlow(relayouted);
    const revealedEdge = expandedProjection.edges.find((e) => e.source === 'A' && e.target === 'a1')!;
    expect(revealedEdge.hidden).toBe(false);
    expect(revealedEdge.selectable).toBe(false);
  });

  it('a layout orientation change still regenerates edge handles and keeps edges locked', () => {
    const doc = buildFixture('mindmap');
    const balanced = autoLayoutDocument(doc, { preset: 'balanced' });
    const balancedEdge = balanced.edges.find((e) => e.target === 'A')!;
    expect(['left', 'right']).toContain(balancedEdge.sourceHandle);

    const topDown = autoLayoutDocument(doc, { preset: 'TB' });
    const topDownEdge = topDown.edges.find((e) => e.target === 'A')!;
    expect(topDownEdge.sourceHandle).toBe('bottom');
    expect(topDownEdge.targetHandle).toBe('top');

    const { edges } = canonicalToReactFlow(topDown);
    expect(edges.find((e) => e.target === 'A')?.selectable).toBe(false);
  });
});

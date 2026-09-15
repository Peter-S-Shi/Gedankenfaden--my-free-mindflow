import { describe, it, expect } from 'vitest';
import { createEmptyDocument, serializeDocument, deserializeDocument, cloneDocument } from '../model/document';
import { getDefaultTheme } from '../model/theme';
import {
  canonicalToReactFlow,
  reactFlowToCanonical,
} from '../model/adapter';
import { CanonicalDocument } from '../model/types';

describe('Flowchart PH Bug F4: CanonicalEdge.isCrossLink Preservation', () => {
  it('preserves isCrossLink: true across canonicalToReactFlow -> reactFlowToCanonical round-trip', () => {
    const doc = createEmptyDocument('CrossLink Flowchart', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'Canto I', geometry: { x: 100, y: 100, width: 140, height: 44 } },
      { id: 'n2', text: 'Canto II', geometry: { x: 300, y: 100, width: 140, height: 44 } },
    ];
    doc.edges = [
      {
        id: 'e_cross_1',
        source: 'n1',
        target: 'n2',
        type: 'bezier',
        isCrossLink: true,
        style: { stroke: '#e63946', strokeWidth: 2, dashed: true },
      },
    ];

    const projected = canonicalToReactFlow(doc);
    const roundTripped = reactFlowToCanonical(projected.nodes, projected.edges, doc);

    expect(roundTripped.edges).toHaveLength(1);
    expect(roundTripped.edges[0].id).toBe('e_cross_1');
    expect(roundTripped.edges[0].isCrossLink).toBe(true);
    expect(roundTripped.edges[0].type).toBe('bezier');
    expect(roundTripped.edges[0].style).toEqual({ stroke: '#e63946', strokeWidth: 2, dashed: true });
  });

  it('preserves isCrossLink: false and undefined without inventing or defaulting cross-link flags', () => {
    const doc = createEmptyDocument('Normal Edges Flowchart', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'Node 1', geometry: { x: 100, y: 100, width: 140, height: 44 } },
      { id: 'n2', text: 'Node 2', geometry: { x: 300, y: 100, width: 140, height: 44 } },
      { id: 'n3', text: 'Node 3', geometry: { x: 500, y: 100, width: 140, height: 44 } },
    ];
    doc.edges = [
      {
        id: 'e_undefined',
        source: 'n1',
        target: 'n2',
        type: 'orthogonal',
        // isCrossLink explicitly omitted/undefined
      },
      {
        id: 'e_false',
        source: 'n2',
        target: 'n3',
        type: 'smoothstep',
        isCrossLink: false,
      },
    ];

    const projected = canonicalToReactFlow(doc);
    const roundTripped = reactFlowToCanonical(projected.nodes, projected.edges, doc);

    const edgeUndefined = roundTripped.edges.find((e) => e.id === 'e_undefined')!;
    const edgeFalse = roundTripped.edges.find((e) => e.id === 'e_false')!;

    expect(edgeUndefined.isCrossLink).toBeUndefined();
    expect(edgeFalse.isCrossLink).toBe(false);
  });

  it('preserves mixed normal + cross-link edges with diverse routing types in one Flowchart document', () => {
    const doc: CanonicalDocument = {
      schemaVersion: '1.0',
      id: 'doc_orlando_flowchart',
      title: 'Orlando Furioso Narrative Flow',
      mode: 'flowchart',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      viewport: { x: 0, y: 0, zoom: 1 },
      theme: getDefaultTheme('flowchart'),
      nodes: [
        { id: 'c1_hero', text: 'Orlando Leaves Paris', geometry: { x: 100, y: 100, width: 160, height: 48 } },
        { id: 'c1_next', text: 'Encounter with Angelica', geometry: { x: 100, y: 220, width: 160, height: 48 } },
        { id: 'c2_saracen', text: 'Rodomonte Assault', geometry: { x: 400, y: 100, width: 160, height: 48 } },
        { id: 'c2_clash', text: 'Battle at the Gate', geometry: { x: 400, y: 220, width: 160, height: 48 } },
      ],
      edges: [
        // Standard structural/narrative flow edges
        { id: 'e_seq_1', source: 'c1_hero', target: 'c1_next', type: 'orthogonal' },
        { id: 'e_seq_2', source: 'c2_saracen', target: 'c2_clash', type: 'straight' },
        // Cross-cutting narrative thread (cross-link across episodes)
        {
          id: 'e_cross_thread',
          source: 'c1_next',
          target: 'c2_saracen',
          type: 'bezier',
          isCrossLink: true,
          label: 'Intertwined Fate',
          style: { stroke: '#7209b7', strokeWidth: 2, dashed: true },
        },
        // Edge with dashed style but NOT a cross link (must NOT infer cross-link from style)
        {
          id: 'e_dashed_normal',
          source: 'c1_hero',
          target: 'c2_clash',
          type: 'smoothstep',
          isCrossLink: false,
          style: { stroke: '#94a3b8', strokeWidth: 1, dashed: true },
        },
      ],
      groups: [
        { id: 'g_canto1', title: 'Canto I', nodeIds: ['c1_hero', 'c1_next'], bounds: { x: 80, y: 80, width: 200, height: 220 } },
        { id: 'g_canto2', title: 'Canto II', nodeIds: ['c2_saracen', 'c2_clash'], bounds: { x: 380, y: 80, width: 200, height: 220 } },
      ],
    };

    const projected = canonicalToReactFlow(doc);
    const roundTripped = reactFlowToCanonical(projected.nodes, projected.edges, doc);

    expect(roundTripped.edges).toHaveLength(4);

    const seq1 = roundTripped.edges.find((e) => e.id === 'e_seq_1')!;
    const seq2 = roundTripped.edges.find((e) => e.id === 'e_seq_2')!;
    const crossThread = roundTripped.edges.find((e) => e.id === 'e_cross_thread')!;
    const dashedNormal = roundTripped.edges.find((e) => e.id === 'e_dashed_normal')!;

    expect(seq1.isCrossLink).toBeUndefined();
    expect(seq1.type).toBe('orthogonal');

    expect(seq2.isCrossLink).toBeUndefined();
    expect(seq2.type).toBe('straight');

    expect(crossThread.isCrossLink).toBe(true);
    expect(crossThread.type).toBe('bezier');
    expect(crossThread.label).toBe('Intertwined Fate');
    expect(crossThread.style?.dashed).toBe(true);

    expect(dashedNormal.isCrossLink).toBe(false);
    expect(dashedNormal.type).toBe('smoothstep');
    expect(dashedNormal.style?.dashed).toBe(true);
  });

  it('preserves isCrossLink across document serialization, deserialization, and cloning', () => {
    const doc = createEmptyDocument('Persistence Flowchart', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'Start', geometry: { x: 100, y: 100, width: 140, height: 44 } },
      { id: 'n2', text: 'End', geometry: { x: 300, y: 100, width: 140, height: 44 } },
    ];
    doc.edges = [
      { id: 'e1', source: 'n1', target: 'n2', type: 'bezier', isCrossLink: true },
    ];

    const json = serializeDocument(doc);
    const loaded = deserializeDocument(json);
    expect(loaded.edges[0].isCrossLink).toBe(true);

    const cloned = cloneDocument(loaded);
    expect(cloned.edges[0].isCrossLink).toBe(true);
  });

  it('preserves isCrossLink during unrelated node moves and group edits', () => {
    const doc = createEmptyDocument('Interaction Flowchart', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'Start', geometry: { x: 100, y: 100, width: 140, height: 44 } },
      { id: 'n2', text: 'End', geometry: { x: 300, y: 100, width: 140, height: 44 } },
    ];
    doc.edges = [
      { id: 'e1', source: 'n1', target: 'n2', type: 'bezier', isCrossLink: true },
    ];

    const projected = canonicalToReactFlow(doc);
    // Simulate user moving node n1
    const movedNodes = projected.nodes.map((n) =>
      n.id === 'n1' ? { ...n, position: { x: 150, y: 120 } } : n
    );

    const synced = reactFlowToCanonical(movedNodes, projected.edges, doc);
    expect(synced.nodes.find((n) => n.id === 'n1')?.geometry.x).toBe(150);
    expect(synced.edges[0].isCrossLink).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEmptyDocument } from '../model/document';
import {
  canonicalToReactFlow,
  reactFlowToCanonical,
  canonicalEdgeTypeToReactFlow,
  reactFlowEdgeTypeToCanonical,
} from '../model/adapter';

describe('Flowchart PH Bug F3: Routing-Type Fidelity & Round-Trip', () => {
  it('maps all four canonical routing types to distinct React Flow renderer types', () => {
    expect(canonicalEdgeTypeToReactFlow('orthogonal')).toBe('step');
    expect(canonicalEdgeTypeToReactFlow('smoothstep')).toBe('smoothstep');
    expect(canonicalEdgeTypeToReactFlow('bezier')).toBe('bezier');
    expect(canonicalEdgeTypeToReactFlow('straight')).toBe('straight');
    expect(canonicalEdgeTypeToReactFlow(undefined, 'orthogonal')).toBe('step');
    expect(canonicalEdgeTypeToReactFlow(undefined, 'bezier')).toBe('bezier');
  });

  it('projects canonical edges in a document to distinct React Flow edge types without collapsing orthogonal', () => {
    const doc = createEmptyDocument('Multi-Routing Flowchart', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'Start', geometry: { x: 100, y: 100, width: 140, height: 44 } },
      { id: 'n2', text: 'Step 2', geometry: { x: 300, y: 100, width: 140, height: 44 } },
      { id: 'n3', text: 'Decision', geometry: { x: 500, y: 100, width: 140, height: 44 } },
      { id: 'n4', text: 'End', geometry: { x: 700, y: 100, width: 140, height: 44 } },
      { id: 'n5', text: 'Side', geometry: { x: 300, y: 250, width: 140, height: 44 } },
    ];
    doc.edges = [
      { id: 'e_ortho', source: 'n1', target: 'n2', type: 'orthogonal', label: 'Orthogonal Edge' },
      { id: 'e_smooth', source: 'n2', target: 'n3', type: 'smoothstep', label: 'Smoothstep Edge' },
      { id: 'e_bezier', source: 'n3', target: 'n4', type: 'bezier', label: 'Bezier Edge' },
      { id: 'e_straight', source: 'n1', target: 'n5', type: 'straight', label: 'Straight Edge' },
    ];

    const projected = canonicalToReactFlow(doc);
    const orthoEdge = projected.edges.find((e) => e.id === 'e_ortho')!;
    const smoothEdge = projected.edges.find((e) => e.id === 'e_smooth')!;
    const bezierEdge = projected.edges.find((e) => e.id === 'e_bezier')!;
    const straightEdge = projected.edges.find((e) => e.id === 'e_straight')!;

    // Must be distinct and faithfully mapped
    expect(orthoEdge.type).toBe('step');
    expect(smoothEdge.type).toBe('smoothstep');
    expect(bezierEdge.type).toBe('bezier');
    expect(straightEdge.type).toBe('straight');

    // Edge properties must remain intact
    expect(orthoEdge.label).toBe('Orthogonal Edge');
    expect(smoothEdge.label).toBe('Smoothstep Edge');
  });

  it('guarantees round-trip fidelity: reactFlowToCanonical preserves original canonical edge types without renderer leakage', () => {
    const baseDoc = createEmptyDocument('Roundtrip Test', 'flowchart');
    baseDoc.nodes = [
      { id: 'n1', text: 'A', geometry: { x: 0, y: 0, width: 100, height: 40 } },
      { id: 'n2', text: 'B', geometry: { x: 200, y: 0, width: 100, height: 40 } },
      { id: 'n3', text: 'C', geometry: { x: 400, y: 0, width: 100, height: 40 } },
      { id: 'n4', text: 'D', geometry: { x: 600, y: 0, width: 100, height: 40 } },
    ];
    baseDoc.edges = [
      { id: 'e1', source: 'n1', target: 'n2', type: 'orthogonal', style: { stroke: '#40916c', strokeWidth: 2, dashed: true } },
      { id: 'e2', source: 'n2', target: 'n3', type: 'smoothstep' },
      { id: 'e3', source: 'n3', target: 'n4', type: 'bezier' },
      { id: 'e4', source: 'n1', target: 'n4', type: 'straight' },
    ];

    // Canonical -> React Flow
    const projected = canonicalToReactFlow(baseDoc);
    expect(projected.edges.map((e) => e.type)).toEqual(['step', 'smoothstep', 'bezier', 'straight']);

    // React Flow -> Canonical
    const recovered = reactFlowToCanonical(projected.nodes, projected.edges, baseDoc);
    expect(recovered.edges.map((e) => e.type)).toEqual(['orthogonal', 'smoothstep', 'bezier', 'straight']);

    // Styles preserved
    expect(recovered.edges[0].style).toEqual({ stroke: '#40916c', strokeWidth: 2, dashed: true });
  });

  it('converts newly created React Flow edges to valid canonical types', () => {
    expect(reactFlowEdgeTypeToCanonical('step')).toBe('orthogonal');
    expect(reactFlowEdgeTypeToCanonical('smoothstep')).toBe('smoothstep');
    expect(reactFlowEdgeTypeToCanonical('bezier')).toBe('bezier');
    expect(reactFlowEdgeTypeToCanonical('default')).toBe('bezier');
    expect(reactFlowEdgeTypeToCanonical('straight')).toBe('straight');
  });

  it('CanvasEditor registers bezier edge renderer and respects default routing policy in onConnect', () => {
    const canvasSource = readFileSync(new URL('../components/CanvasEditor.tsx', import.meta.url), 'utf8');
    expect(canvasSource).toContain('edgeTypes');
    expect(canvasSource).toContain('BezierEdge');
    expect(canvasSource).toContain('canonicalEdgeTypeToReactFlow');
  });
});

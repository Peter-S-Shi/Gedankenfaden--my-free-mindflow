import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { validateDocumentInvariants } from '../model/validator';
import { calculateOrthogonalPath } from '../model/routing';
import { canonicalToReactFlow, reactFlowToCanonical } from '../model/adapter';
import { CanonicalNode } from '../model/types';
import { resolveNodeVisuals } from '../model/theme';

describe('Milestone 3: Flowchart Shape Family & Visual Resolution', () => {
  it.each(['rectangle', 'rounded', 'pill', 'diamond', 'parallelogram', 'circle'] as const)(
    'keeps canonical %s shape authoritative over stale projection data across roundtrip',
    (shape) => {
      const doc = createEmptyDocument('Shape authority', 'flowchart');
      doc.nodes[0] = {
        ...doc.nodes[0],
        type: 'process',
        shape,
        style: { shape },
        data: {
          label: 'Stale label',
          shape: 'rounded',
          style: { shape: 'rounded' },
          visuals: { shape: 'rounded' },
        },
      };

      const projected = canonicalToReactFlow(doc);
      expect(projected.nodes[0].data.label).toBe(doc.nodes[0].text);
      expect(projected.nodes[0].data.shape).toBe(shape);
      expect(projected.nodes[0].data.visuals?.shape).toBe(shape);

      const restored = reactFlowToCanonical(projected.nodes, projected.edges, doc);
      expect(restored.nodes[0].shape).toBe(shape);
      const persistedData = restored.nodes[0].data || {};
      expect(persistedData).not.toHaveProperty('label');
      expect(persistedData).not.toHaveProperty('shape');
      expect(persistedData).not.toHaveProperty('style');
      expect(persistedData).not.toHaveProperty('visuals');
    }
  );

  it('resolves visual styling and shapes across all standard diagramming elements', () => {

    const terminalNode: CanonicalNode = {
      id: 'n_term',
      text: 'Start Process',
      type: 'terminal',
      geometry: { x: 100, y: 50, width: 140, height: 44 },
    };

    const processNode: CanonicalNode = {
      id: 'n_proc',
      text: 'Execute Step',
      type: 'process',
      geometry: { x: 100, y: 150, width: 140, height: 44 },
    };

    const decisionNode: CanonicalNode = {
      id: 'n_dec',
      text: 'Threshold Met?',
      type: 'decision',
      geometry: { x: 100, y: 250, width: 150, height: 50 },
    };

    const dataNode: CanonicalNode = {
      id: 'n_data',
      text: 'Input Stream',
      type: 'data',
      shape: 'parallelogram',
      geometry: { x: 100, y: 350, width: 140, height: 44 },
    };

    const termVisuals = resolveNodeVisuals(terminalNode, { paletteId: 'nordic-slate', canvasBackground: 'dots', fontFamily: 'sans', defaultEdgeRouting: 'smoothstep' });
    const procVisuals = resolveNodeVisuals(processNode, { paletteId: 'nordic-slate', canvasBackground: 'dots', fontFamily: 'sans', defaultEdgeRouting: 'smoothstep' });
    const decVisuals = resolveNodeVisuals(decisionNode, { paletteId: 'nordic-slate', canvasBackground: 'dots', fontFamily: 'sans', defaultEdgeRouting: 'smoothstep' });
    const dataVisuals = resolveNodeVisuals(dataNode, { paletteId: 'nordic-slate', canvasBackground: 'dots', fontFamily: 'sans', defaultEdgeRouting: 'smoothstep' });

    expect(termVisuals.shape).toBe('pill');
    expect(procVisuals.shape).toBe('rounded');
    expect(decVisuals.shape).toBe('diamond');
    expect(dataVisuals.shape).toBe('parallelogram');
  });

  it('permits cyclic feedback loops in Flowchart mode without invariant violations', () => {
    const doc = createEmptyDocument('Cyclic Feedback Loop', 'flowchart');

    // Create a 3-step loop: A -> B -> C -> A
    doc.nodes.push(
      { id: 'step_a', text: 'Step A', type: 'process', geometry: { x: 100, y: 100 } },
      { id: 'step_b', text: 'Step B', type: 'decision', geometry: { x: 100, y: 200 } },
      { id: 'step_c', text: 'Step C (Retry)', type: 'process', geometry: { x: 300, y: 150 } }
    );

    doc.edges.push(
      { id: 'e_ab', source: 'step_a', target: 'step_b' },
      { id: 'e_bc', source: 'step_b', target: 'step_c', label: 'Fail / Retry' },
      { id: 'e_ca', source: 'step_c', target: 'step_a', label: 'Loop Back' }
    );

    const validation = validateDocumentInvariants(doc);
    expect(validation.isValid).toBe(true);
    expect(validation.errors.length).toBe(0);
  });
});

describe('Milestone 3: Orthogonal Edge Routing Engine', () => {
  it('calculates right-angled path coordinates and centered label position', () => {
    const source = { x: 100, y: 100 };
    const target = { x: 300, y: 300 };

    const route = calculateOrthogonalPath(source, target, 'bottom', 'top', 8);

    expect(route.path).toMatch(/^M 100 100/);
    expect(route.points.length).toBeGreaterThanOrEqual(4);

    // Midpoint label position should lie between source and target coordinates
    expect(route.labelPosition.x).toBeGreaterThanOrEqual(100);
    expect(route.labelPosition.x).toBeLessThanOrEqual(300);
    expect(route.labelPosition.y).toBeGreaterThanOrEqual(100);
    expect(route.labelPosition.y).toBeLessThanOrEqual(300);
  });

  it('routes loopback paths when target is placed upstream of source', () => {
    const source = { x: 200, y: 400 };
    const target = { x: 200, y: 100 }; // Target is above source!

    const route = calculateOrthogonalPath(source, target, 'bottom', 'top', 8);

    // Loopback path requires detour points around the nodes
    expect(route.points.length).toBeGreaterThanOrEqual(5);
    const detourPoint = route.points.find((p) => p.x > 200);
    expect(detourPoint).toBeDefined();
  });

  it('projects directional arrowheads on flowchart edges in React Flow adapter', () => {
    const doc = createEmptyDocument('Arrowhead Spec', 'flowchart');
    doc.nodes = [
      { id: 'fc1', text: 'Step 1', type: 'process', geometry: { x: 100, y: 100 } },
      { id: 'fc2', text: 'Step 2', type: 'process', geometry: { x: 100, y: 250 } },
    ];
    doc.edges = [{ id: 'e1', source: 'fc1', target: 'fc2' }];

    const projected = canonicalToReactFlow(doc);
    expect(projected.edges.length).toBe(1);

    const edge = projected.edges[0];
    expect(edge.markerEnd).toBeDefined();
    expect((edge.markerEnd as any).type).toBe('arrowclosed');
  });
});

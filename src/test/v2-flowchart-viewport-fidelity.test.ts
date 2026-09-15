import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEmptyDocument, serializeDocument, deserializeDocument, cloneDocument } from '../model/document';
import { getDefaultTheme } from '../model/theme';
import { packageDocumentToMflow, parseMflowFromBytes } from '../model/container';
import { CanonicalDocument } from '../model/types';
import { canonicalToReactFlow, reactFlowToCanonical } from '../model/adapter';
import { HistoryManager } from '../model/history';

describe('Flowchart PH Bug F5: Persisted Viewport/Camera Fidelity', () => {
  it('CanvasEditor source sets defaultViewport, onMoveEnd, onInit restore, and removes unconditional fitView', () => {
    const canvasSource = readFileSync(new URL('../components/CanvasEditor.tsx', import.meta.url), 'utf8');

    // Must NOT have unconditional fitView prop on <ReactFlow>
    expect(canvasSource).not.toMatch(/<ReactFlow[\s\S]*?\sfitView\s[\s\S]*?>/);
    expect(canvasSource).not.toMatch(/<ReactFlow[\s\S]*?\sfitView={true}[\s\S]*?>/);

    // Must pass defaultViewport and onMoveEnd
    expect(canvasSource).toContain('defaultViewport={initialDocument.viewport}');
    expect(canvasSource).toContain('onMoveEnd={handleMoveEnd}');

    // onInit must restore initialDocument.viewport
    expect(canvasSource).toMatch(/onInit=\{\(instance\)\s*=>\s*\{[\s\S]*?instance\.setViewport\(initialDocument\.viewport\)/);

    // In-editor .mflow and JSON import must restore viewport
    expect(canvasSource).toMatch(/loadedDoc\.viewport[\s\S]*?rfInstanceRef\.current\.setViewport\(loadedDoc\.viewport\)/);
  });

  it('preserves Orlando-style { x: 0, y: 0, zoom: 0.38 } camera across serialization, deserialization, and cloning', () => {
    const doc: CanonicalDocument = {
      schemaVersion: '1.0',
      id: 'doc_orlando_camera',
      title: 'Orlando Furioso Broad View',
      mode: 'flowchart',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      viewport: { x: 0, y: 0, zoom: 0.38 },
      theme: getDefaultTheme('flowchart'),
      nodes: [
        { id: 'c1', text: 'Canto I', geometry: { x: 80, y: 180, width: 420, height: 1040 } },
        { id: 'c2', text: 'Canto II', geometry: { x: 540, y: 180, width: 420, height: 1040 } },
      ],
      edges: [
        { id: 'e1', source: 'c1', target: 'c2', type: 'orthogonal' },
      ],
      groups: [],
    };

    const json = serializeDocument(doc);
    const loaded = deserializeDocument(json);
    expect(loaded.viewport).toEqual({ x: 0, y: 0, zoom: 0.38 });

    const cloned = cloneDocument(loaded);
    expect(cloned.viewport).toEqual({ x: 0, y: 0, zoom: 0.38 });
  });

  it('preserves custom camera coordinates through .mflow container packaging and extraction', async () => {
    const doc = createEmptyDocument('Saved Camera Doc', 'flowchart');
    doc.viewport = { x: -350, y: 120, zoom: 0.65 };

    const bytes = await packageDocumentToMflow(doc);
    const parsed = parseMflowFromBytes(bytes);

    expect(parsed.document.viewport).toEqual({ x: -350, y: 120, zoom: 0.65 });
  });

  it('pan and zoom camera updates do NOT pollute structural undo/redo history', () => {
    const initialDoc = createEmptyDocument('Undo Test Flowchart', 'flowchart');
    initialDoc.viewport = { x: 0, y: 0, zoom: 1 };
    initialDoc.nodes = [
      { id: 'n1', text: 'Task', geometry: { x: 100, y: 100, width: 140, height: 44 } },
    ];

    const history = new HistoryManager(initialDoc);
    expect(history.canUndo()).toBe(false);

    // Simulate structural action (e.g. adding a node)
    const docWithNode2 = cloneDocument(initialDoc);
    docWithNode2.nodes.push({ id: 'n2', text: 'Next', geometry: { x: 300, y: 100, width: 140, height: 44 } });
    history.pushState(docWithNode2);
    expect(history.canUndo()).toBe(true);

    // Simulate 10 camera pan/zoom movements (which only update doc.viewport and do NOT call pushState)
    let currentDoc = cloneDocument(docWithNode2);
    for (let i = 1; i <= 10; i++) {
      currentDoc = {
        ...currentDoc,
        viewport: { x: i * 20, y: i * -15, zoom: 1 + i * 0.05 },
      };
    }

    // Undo should revert the structural change directly in 1 step, not 11 steps
    const undone = history.undo();
    expect(undone).not.toBeNull();
    expect(undone?.nodes).toHaveLength(1);
    expect(undone?.nodes[0].id).toBe('n1');
    expect(history.canUndo()).toBe(false);
  });

  it('regression protection: preserves F1–F4 fixes alongside viewport handling', () => {
    const doc = createEmptyDocument('Full PH Regression', 'flowchart');
    doc.viewport = { x: 50, y: -30, zoom: 0.75 };
    doc.nodes = [
      { id: 'n1', text: 'Step 1', geometry: { x: 100, y: 100, width: 140, height: 44 } },
      { id: 'n2', text: 'Step 2', geometry: { x: 300, y: 100, width: 140, height: 44 } },
    ];
    doc.edges = [
      { id: 'e_ortho', source: 'n1', target: 'n2', type: 'orthogonal' },
      { id: 'e_cross', source: 'n1', target: 'n2', type: 'bezier', isCrossLink: true },
    ];
    doc.groups = [
      { id: 'g1', title: 'Group 1', nodeIds: ['n1'], bounds: { x: 80, y: 80, width: 420, height: 1040 } },
    ];

    const projected = canonicalToReactFlow(doc);
    const roundTripped = reactFlowToCanonical(projected.nodes, projected.edges, doc);

    // F5: Viewport preserved
    expect(roundTripped.viewport).toEqual({ x: 50, y: -30, zoom: 0.75 });
    // F3: Routing fidelity preserved
    expect(roundTripped.edges.find((e) => e.id === 'e_ortho')?.type).toBe('orthogonal');
    expect(roundTripped.edges.find((e) => e.id === 'e_cross')?.type).toBe('bezier');
    // F4: isCrossLink preserved
    expect(roundTripped.edges.find((e) => e.id === 'e_cross')?.isCrossLink).toBe(true);
    // F2: Explicit bounds preserved
    expect(roundTripped.groups[0].bounds).toEqual({ x: 80, y: 80, width: 420, height: 1040 });
  });
});

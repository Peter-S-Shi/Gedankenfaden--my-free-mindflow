import { describe, it, expect } from 'vitest';
import {
  createEmptyDocument,
  serializeDocument,
  deserializeDocument,
  cloneDocument,
} from '../model/document';
import { HistoryManager } from '../model/history';
import { autoLayoutDocument } from '../model/layout';
import { canonicalToReactFlow, reactFlowToCanonical } from '../model/adapter';
import { exportToJSON, exportToSVG } from '../export/exporter';
import { CanonicalDocument } from '../model/types';

describe('Proof Track A: Canonical Document Model & History', () => {
  it('creates clean canonical documents independent of UI framework', () => {
    const mmDoc = createEmptyDocument('MindMap Test', 'mindmap');
    expect(mmDoc.schemaVersion).toBe('1.0');
    expect(mmDoc.mode).toBe('mindmap');
    expect(mmDoc.nodes.length).toBeGreaterThan(0);
    expect(mmDoc.nodes[0].type).toBe('root');

    const fcDoc = createEmptyDocument('Flowchart Test', 'flowchart');
    expect(fcDoc.mode).toBe('flowchart');
    expect(fcDoc.edges.length).toBeGreaterThan(0);
  });

  it('serializes and deserializes losslessly without UI dependencies', () => {
    const doc = createEmptyDocument('Serialization Test', 'mindmap');
    doc.nodes.push({
      id: 'node_custom',
      text: 'Custom Idea',
      geometry: { x: 500, y: 300, width: 150, height: 44 },
      parentId: doc.nodes[0].id,
      style: { backgroundColor: '#f59e0b', textColor: '#ffffff' },
    });
    doc.edges.push({
      id: 'edge_custom',
      source: doc.nodes[0].id,
      target: 'node_custom',
    });

    const json = serializeDocument(doc);
    const restored = deserializeDocument(json);

    expect(restored.id).toBe(doc.id);
    expect(restored.nodes.length).toBe(doc.nodes.length);
    expect(restored.nodes[1].text).toBe('Custom Idea');
    expect(restored.nodes[1].parentId).toBe(doc.nodes[0].id);
    expect(restored.edges.length).toBe(doc.edges.length);
  });

  it('supports undo and redo commands on canonical documents', () => {
    const initialDoc = createEmptyDocument('Undo Test', 'mindmap');
    const history = new HistoryManager(initialDoc);

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    const docState2 = cloneDocument(initialDoc);
    docState2.title = 'Title Updated';
    history.pushState(docState2);

    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    // Undo
    const undone = history.undo();
    expect(undone).not.toBeNull();
    expect(undone!.title).toBe('Undo Test');
    expect(history.canRedo()).toBe(true);

    // Redo
    const redone = history.redo();
    expect(redone).not.toBeNull();
    expect(redone!.title).toBe('Title Updated');
  });

  it('runs Dagre auto-layout and updates node coordinates', () => {
    const doc = createEmptyDocument('Layout Test', 'mindmap');
    doc.nodes.push(
      {
        id: 'child_1',
        text: 'Child 1',
        geometry: { x: 0, y: 0, width: 140, height: 40 },
        parentId: doc.nodes[0].id,
      },
      {
        id: 'child_2',
        text: 'Child 2',
        geometry: { x: 0, y: 0, width: 140, height: 40 },
        parentId: doc.nodes[0].id,
      }
    );
    doc.edges.push(
      { id: 'e1', source: doc.nodes[0].id, target: 'child_1' },
      { id: 'e2', source: doc.nodes[0].id, target: 'child_2' }
    );

    const layouted = autoLayoutDocument(doc, { direction: 'LR' });
    expect(layouted.nodes.length).toBe(3);

    const rootNode = layouted.nodes.find((n) => n.id === doc.nodes[0].id)!;
    const c1 = layouted.nodes.find((n) => n.id === 'child_1')!;
    const c2 = layouted.nodes.find((n) => n.id === 'child_2')!;

    // In LR direction, children should be placed to the right of root
    expect(c1.geometry.x).toBeGreaterThan(rootNode.geometry.x);
    expect(c2.geometry.x).toBeGreaterThan(rootNode.geometry.x);
    // Children should have different vertical offsets
    expect(c1.geometry.y).not.toBe(c2.geometry.y);
  });

  it('projects bi-directionally between Canonical Document and React Flow', () => {
    const doc: CanonicalDocument = createEmptyDocument('Projection Test', 'mindmap');
    const { nodes: rfNodes, edges: rfEdges } = canonicalToReactFlow(doc);

    expect(rfNodes.length).toBe(doc.nodes.length);
    expect(rfNodes[0].id).toBe(doc.nodes[0].id);
    expect(rfNodes[0].data.label).toBe(doc.nodes[0].text);

    // Simulate node drag in editor
    const draggedNodes = rfNodes.map((n) => ({
      ...n,
      position: { x: 888, y: 999 },
    }));

    const nextCanonical = reactFlowToCanonical(draggedNodes, rfEdges, doc);
    expect(nextCanonical.nodes[0].geometry.x).toBe(888);
    expect(nextCanonical.nodes[0].geometry.y).toBe(999);
  });
});

describe('Proof Track D: Exporters', () => {
  it('exports lossless JSON', () => {
    const doc = createEmptyDocument('Export JSON', 'flowchart');
    const json = exportToJSON(doc);
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(parsed.title).toBe('Export JSON');
    expect(parsed.mode).toBe('flowchart');
  });

  it('exports valid vector SVG with XML headers, paths and text', () => {
    const doc = createEmptyDocument('Export SVG', 'mindmap');
    const svg = exportToSVG(doc);

    expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('Central Idea');
    expect(svg).toContain('</svg>');
  });
});

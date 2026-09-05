import { describe, it, expect } from 'vitest';
import { createEmptyDocument, cloneDocument } from '../model/document';
import { HistoryManager } from '../model/history';
import { canonicalToReactFlow, reactFlowToCanonical } from '../model/adapter';
import { BUILTIN_THEMES } from '../model/theme';
import { CanonicalNode } from '../model/types';

describe('Milestone 1: History Engine with Compound Transactions', () => {
  it('groups multiple document mutations into a single undoable compound transaction', () => {
    const doc = createEmptyDocument('Transaction Test', 'mindmap');
    const history = new HistoryManager(doc);

    expect(history.canUndo()).toBe(false);

    // Begin compound transaction (e.g. batch adding multiple nodes)
    history.beginTransaction();
    expect(history.isTransactionActive()).toBe(true);

    const step1 = cloneDocument(doc);
    step1.nodes.push({
      id: 'batch_node_1',
      text: 'Batch 1',
      geometry: { x: 100, y: 100, width: 100, height: 40 },
    });
    history.pushState(step1);

    const step2 = cloneDocument(step1);
    step2.nodes.push({
      id: 'batch_node_2',
      text: 'Batch 2',
      geometry: { x: 200, y: 100, width: 100, height: 40 },
    });
    history.pushState(step2);

    // Commit transaction
    history.commitTransaction();
    expect(history.isTransactionActive()).toBe(false);
    expect(history.getCurrent().nodes.length).toBe(3); // root + 2 added

    // Undo should revert all batch changes in a single operation
    expect(history.canUndo()).toBe(true);
    const undone = history.undo();
    expect(undone).not.toBeNull();
    expect(undone!.nodes.length).toBe(1); // Back to root only!

    // Redo should restore all batch changes in a single operation
    const redone = history.redo();
    expect(redone).not.toBeNull();
    expect(redone!.nodes.length).toBe(3);
  });

  it('supports rolling back aborted transactions without polluting history', () => {
    const doc = createEmptyDocument('Rollback Test', 'mindmap');
    const history = new HistoryManager(doc);

    history.beginTransaction();
    const mutated = cloneDocument(doc);
    mutated.title = 'Should Be Reverted';
    history.pushState(mutated);

    // Rollback
    const reverted = history.rollbackTransaction();
    expect(reverted).not.toBeNull();
    expect(reverted!.title).toBe('Rollback Test');
    expect(history.getCurrent().title).toBe('Rollback Test');
    expect(history.canUndo()).toBe(false);
  });

  it('executes batchTransaction helper seamlessly', () => {
    const doc = createEmptyDocument('Helper Test', 'flowchart');
    const history = new HistoryManager(doc);

    let workingDoc = cloneDocument(doc);
    history.batchTransaction(
      () => {
        workingDoc.title = 'Batch Changed';
        workingDoc.nodes.push({
          id: 'new_flow_step',
          text: 'Process Step',
          geometry: { x: 0, y: 0, width: 120, height: 44 },
        });
      },
      () => workingDoc
    );

    expect(history.getCurrent().title).toBe('Batch Changed');
    expect(history.getCurrent().nodes.length).toBe(doc.nodes.length + 1);

    // Single undo reverts both title and added node
    const undone = history.undo();
    expect(undone!.title).toBe('Helper Test');
    expect(undone!.nodes.length).toBe(doc.nodes.length);
  });
});

describe('Milestone 1: Adapter Theme Projection & Attribute Preservation', () => {
  it('projects document theme and resolved visuals into React Flow nodes and edges', () => {
    const doc = createEmptyDocument('Theme Projection', 'mindmap');
    doc.theme = {
      paletteId: 'deep-midnight',
      canvasBackground: 'dots',
      fontFamily: 'sans',
      defaultEdgeRouting: 'smoothstep',
      name: 'Deep Midnight',
      edgeColor: BUILTIN_THEMES['deep-midnight'].edgeColor,
    };

    const customizedNode: CanonicalNode = {
      id: 'custom_styled_node',
      text: 'Night Idea',
      geometry: { x: 300, y: 150, width: 160, height: 50 },
      type: 'default',
      shape: 'pill',
      style: {
        backgroundColor: '#7c3aed',
        borderColor: '#a78bfa',
      },
    };
    doc.nodes.push(customizedNode);
    doc.edges.push({
      id: 'edge_1',
      source: doc.nodes[0].id,
      target: customizedNode.id,
    });

    const projected = canonicalToReactFlow(doc);
    expect(projected.nodes.length).toBe(2);
    expect(projected.edges.length).toBe(1);

    const rfCustomNode = projected.nodes.find((n) => n.id === customizedNode.id)!;
    expect(rfCustomNode.data.shape).toBe('pill');
    expect(rfCustomNode.data.visuals?.shape).toBe('pill');
    expect(rfCustomNode.data.visuals?.backgroundColor).toBe('#7c3aed');
    expect(rfCustomNode.data.visuals?.borderColor).toBe('#a78bfa');

    // Edge adopts theme edge color
    expect(projected.edges[0].style?.stroke).toBe(doc.theme.edgeColor);

    // Roundtrip back to CanonicalDocument
    const restoredDoc = reactFlowToCanonical(projected.nodes, projected.edges, doc);
    expect(restoredDoc.nodes.length).toBe(2);
    const restoredNode = restoredDoc.nodes.find((n) => n.id === customizedNode.id)!;
    expect(restoredNode.shape).toBe('pill');
    expect(restoredNode.style?.backgroundColor).toBe('#7c3aed');
  });
});

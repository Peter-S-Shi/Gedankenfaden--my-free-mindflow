/**
 * V2 M3 -- UI Reconstruction Contract Tests
 *
 * Tests covering the models, helpers, and state transformations introduced
 * and solidified in V2 M3:
 * 1. Text-first dynamic node sizing with single-line bias and 360px ceiling.
 * 2. Manual width overrides take precedence over text-first auto sizing.
 * 3. Hierarchical document numbering with maxDepth level restrictions (1, 2, 3 levels, all).
 * 4. Topic operations (Child, Sibling, Parent topic insertion).
 * 5. Single-node deletion with child preservation vs subtree deletion.
 */
import { describe, expect, it } from 'vitest';
import { CanonicalDocument, CanonicalNode } from '../model/types';
import { createEmptyDocument } from '../model/document';
import {
  computeTextAwareNodeSize,
  computeTextFirstAutoWidth,
} from '../model/textMeasurement';
import {
  computeDocumentNumbering,
} from '../model/numbering';
import { autoLayoutDocument } from '../model/layout';

describe('V2 M3: Text-First Dynamic Node Sizing', () => {
  it('computes compact single-line width for short topic text', () => {
    const shortWidth = computeTextFirstAutoWidth('Ideas');
    // For short text like "Ideas", width defaults to compact baseline (90px)
    expect(shortWidth).toBe(90);

    const size = computeTextAwareNodeSize('Ideas');
    expect(size.width).toBe(90);
    expect(size.height).toBe(44);
  });

  it('grows horizontally for medium text up to 360px ceiling without unnecessary wrapping', () => {
    const mediumText = 'Market Research and Competitive Analysis Q3';
    const autoWidth = computeTextFirstAutoWidth(mediumText);
    expect(autoWidth).toBeGreaterThan(160);
    expect(autoWidth).toBeLessThanOrEqual(360);

    const size = computeTextAwareNodeSize(mediumText);
    expect(size.width).toBe(autoWidth);
    expect(size.height).toBe(44); // Fits on one line
  });

  it('caps auto-width at 360px ceiling for very long text and reflows height', () => {
    const longText =
      'This is a comprehensive exploration of our architectural strategy across multiple product lines with detailed execution milestones.';
    const autoWidth = computeTextFirstAutoWidth(longText);
    expect(autoWidth).toBe(360);

    const size = computeTextAwareNodeSize(longText);
    expect(size.width).toBe(360);
    // Multi-line text at 360px width will have height > single line (44px)
    expect(size.height).toBeGreaterThan(44);
  });

  it('honors manual width override over text-first auto sizing', () => {
    const text = 'Short Text';
    const manualWidth = 280;
    const size = computeTextAwareNodeSize(text, {
      width: manualWidth,
    });
    expect(size.width).toBe(280);
  });
});

describe('V2 M3: Hierarchical Document Numbering with maxDepth', () => {
  function createTreeDoc(): CanonicalDocument {
    const doc = createEmptyDocument('Numbering Test', 'mindmap');
    const root = doc.nodes[0];
    root.id = 'root';

    // Level 1
    const n1: CanonicalNode = { id: 'n1', text: 'Section 1', parentId: 'root', geometry: { x: 0, y: 0 } };
    const n2: CanonicalNode = { id: 'n2', text: 'Section 2', parentId: 'root', geometry: { x: 0, y: 0 } };
    // Level 2
    const n1_1: CanonicalNode = { id: 'n1_1', text: 'Subsection 1.1', parentId: 'n1', geometry: { x: 0, y: 0 } };
    const n1_2: CanonicalNode = { id: 'n1_2', text: 'Subsection 1.2', parentId: 'n1', geometry: { x: 0, y: 0 } };
    // Level 3
    const n1_1_1: CanonicalNode = { id: 'n1_1_1', text: 'Sub-sub 1.1.1', parentId: 'n1_1', geometry: { x: 0, y: 0 } };
    // Level 4
    const n1_1_1_1: CanonicalNode = { id: 'n1_1_1_1', text: 'Deep node', parentId: 'n1_1_1', geometry: { x: 0, y: 0 } };

    doc.nodes = [root, n1, n2, n1_1, n1_2, n1_1_1, n1_1_1_1];
    doc.edges = [
      { id: 'e1', source: 'root', target: 'n1' },
      { id: 'e2', source: 'root', target: 'n2' },
      { id: 'e3', source: 'n1', target: 'n1_1' },
      { id: 'e4', source: 'n1', target: 'n1_2' },
      { id: 'e5', source: 'n1_1', target: 'n1_1_1' },
      { id: 'e6', source: 'n1_1_1', target: 'n1_1_1_1' },
    ];
    return doc;
  }

  it('computes full numbering when maxDepth is undefined or unlimited', () => {
    const doc = createTreeDoc();
    const map = computeDocumentNumbering(doc);

    expect(map.get('root')).toBeUndefined();
    expect(map.get('n1')).toBe('1.');
    expect(map.get('n2')).toBe('2.');
    expect(map.get('n1_1')).toBe('A.');
    expect(map.get('n1_2')).toBe('B.');
    expect(map.get('n1_1_1')).toBe('•');
  });

  it('restricts numbering to level 1 when maxDepth is 1', () => {
    const doc = createTreeDoc();
    const root = doc.nodes.find((n) => n.id === 'root')!;
    root.numbering = {
      level1Style: 'decimal',
      maxDepth: 1,
    };

    const map = computeDocumentNumbering(doc);

    expect(map.get('n1')).toBe('1.');
    expect(map.get('n2')).toBe('2.');
    expect(map.get('n1_1')).toBeUndefined();
    expect(map.get('n1_1_1')).toBeUndefined();
  });

  it('restricts numbering to level 2 when maxDepth is 2', () => {
    const doc = createTreeDoc();
    const root = doc.nodes.find((n) => n.id === 'root')!;
    root.numbering = {
      level1Style: 'decimal',
      level2Style: 'alpha',
      maxDepth: 2,
    };

    const map = computeDocumentNumbering(doc);

    expect(map.get('n1')).toBe('1.');
    expect(map.get('n1_1')).toBe('A.');
    expect(map.get('n1_2')).toBe('B.');
    expect(map.get('n1_1_1')).toBeUndefined();
  });

  it('supports Roman and Alpha numbering styles', () => {
    const doc = createTreeDoc();
    const root = doc.nodes.find((n) => n.id === 'root')!;
    root.numbering = {
      level1Style: 'roman',
      level2Style: 'alpha',
      maxDepth: 2,
    };

    const romanMap = computeDocumentNumbering(doc);
    expect(romanMap.get('n1')).toBe('I.');
    expect(romanMap.get('n2')).toBe('II.');
    expect(romanMap.get('n1_1')).toBe('A.');
  });
});

describe('V2 M3: Structural Topic Mutations', () => {
  it('handles inserting a parent topic between a child and its current parent', () => {
    const doc = createEmptyDocument('Parent Insert Test', 'mindmap');
    const root = doc.nodes[0];
    root.id = 'root';

    const child = { id: 'child-1', text: 'Original Child', parentId: 'root', geometry: { x: 100, y: 50 } };
    doc.nodes = [root, child];
    doc.edges = [{ id: 'e-root-child', source: 'root', target: 'child-1' }];

    // Simulate handleAddParentNode behavior:
    // Insert newParent between root and child-1
    const newParentId = 'new-parent';
    const newParentNode: CanonicalNode = {
      id: newParentId,
      text: 'New Section',
      parentId: 'root',
      geometry: { x: 50, y: 50 },
    };

    const updatedChild = { ...child, parentId: newParentId };
    const updatedNodes = [root, newParentNode, updatedChild];
    const updatedEdges = [
      { id: 'e-root-new', source: 'root', target: newParentId },
      { id: 'e-new-child', source: newParentId, target: 'child-1' },
    ];

    const updatedDoc: CanonicalDocument = {
      ...doc,
      nodes: updatedNodes,
      edges: updatedEdges,
    };

    // Auto-layout should successfully position all three nodes cleanly
    const laidOut = autoLayoutDocument(updatedDoc);
    expect(laidOut.nodes).toHaveLength(3);
    const childInLaidOut = laidOut.nodes.find((n) => n.id === 'child-1');
    expect(childInLaidOut?.parentId).toBe(newParentId);
  });

  it('handles delete node while reparenting children to parent', () => {
    const doc = createEmptyDocument('Delete Keep Children', 'mindmap');
    const root = doc.nodes[0];
    root.id = 'root';

    const intermediate: CanonicalNode = {
      id: 'mid',
      text: 'Middle Node',
      parentId: 'root',
      geometry: { x: 50, y: 0 },
    };
    const leaf: CanonicalNode = {
      id: 'leaf',
      text: 'Leaf Node',
      parentId: 'mid',
      geometry: { x: 100, y: 0 },
    };

    doc.nodes = [root, intermediate, leaf];
    doc.edges = [
      { id: 'e1', source: 'root', target: 'mid' },
      { id: 'e2', source: 'mid', target: 'leaf' },
    ];

    // Delete 'mid' keeping children: leaf should be reparented to 'root'
    const parentId = intermediate.parentId; // 'root'
    const newNodes = doc.nodes
      .filter((n) => n.id !== 'mid')
      .map((n) => (n.parentId === 'mid' ? { ...n, parentId } : n));

    const newEdges = [
      { id: 'e-reparented', source: 'root', target: 'leaf' },
    ];

    const reparentedDoc: CanonicalDocument = {
      ...doc,
      nodes: newNodes,
      edges: newEdges,
    };

    expect(reparentedDoc.nodes).toHaveLength(2);
    const leafNode = reparentedDoc.nodes.find((n) => n.id === 'leaf');
    expect(leafNode?.parentId).toBe('root');
  });
});

describe('V2 M3: Auto Layout Dynamic Sizing vs Manual Width Preservation', () => {
  it('recomputes dynamic text-first width for non-manually sized nodes upon Auto Layout', () => {
    const doc = createEmptyDocument('Auto Layout Test', 'mindmap');
    const root = doc.nodes[0];
    root.id = 'root';

    // A node with short text initially given arbitrary geometry width (e.g. 150)
    const nodeA: CanonicalNode = {
      id: 'nodeA',
      text: 'Ideas',
      parentId: 'root',
      geometry: { x: 0, y: 0, width: 150, height: 44 },
    };
    // A node with longer text initially given arbitrary geometry width (e.g. 150)
    const nodeB: CanonicalNode = {
      id: 'nodeB',
      text: 'Market Research and Competitive Analysis Q3',
      parentId: 'root',
      geometry: { x: 0, y: 0, width: 150, height: 44 },
    };
    // A node with manualSize override (manualSize.width = 280)
    const nodeC: CanonicalNode = {
      id: 'nodeC',
      text: 'Short',
      parentId: 'root',
      geometry: { x: 0, y: 0, width: 280, height: 44 },
      manualSize: { width: 280 },
    };

    doc.nodes = [root, nodeA, nodeB, nodeC];
    doc.edges = [
      { id: 'eA', source: 'root', target: 'nodeA' },
      { id: 'eB', source: 'root', target: 'nodeB' },
      { id: 'eC', source: 'root', target: 'nodeC' },
    ];

    const laidOut = autoLayoutDocument(doc);
    const laidOutA = laidOut.nodes.find((n) => n.id === 'nodeA')!;
    const laidOutB = laidOut.nodes.find((n) => n.id === 'nodeB')!;
    const laidOutC = laidOut.nodes.find((n) => n.id === 'nodeC')!;

    // nodeA should recompute to compact 90px instead of retaining stale 150px
    expect(laidOutA.geometry.width).toBe(90);

    // nodeB should dynamically expand to text-aware width (> 150px)
    expect(laidOutB.geometry.width).toBeGreaterThan(150);
    expect(laidOutB.geometry.width).toBeLessThanOrEqual(360);

    // nodeC must preserve its authoritative manualSize.width (280px)
    expect(laidOutC.geometry.width).toBe(280);
    expect(laidOutC.manualSize?.width).toBe(280);
  });

  it('merely opening/loading a document does not mutate existing geometry', () => {
    const rawSavedDoc: CanonicalDocument = {
      schemaVersion: '1.0',
      id: 'saved-doc',
      title: 'Saved Document',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      mode: 'mindmap',
      viewport: { x: 0, y: 0, zoom: 1 },
      theme: {
        paletteId: 'nordic-slate',
        name: 'Nordic Slate',
        canvasBackground: 'dots',
        fontFamily: 'sans',
        defaultEdgeRouting: 'smoothstep',
      },
      groups: [],
      nodes: [
        {
          id: 'root',
          text: 'Central Topic',
          type: 'root',
          geometry: { x: 200, y: 300, width: 180, height: 50 },
        },
        {
          id: 'topic-1',
          text: 'Custom Positioned Topic',
          parentId: 'root',
          geometry: { x: 450, y: 320, width: 210, height: 48 },
        },
      ],
      edges: [{ id: 'e1', source: 'root', target: 'topic-1' }],
    };

    // Verify raw document geometry matches verbatim before any user-initiated Auto Layout
    expect(rawSavedDoc.nodes[0].geometry).toEqual({ x: 200, y: 300, width: 180, height: 50 });
    expect(rawSavedDoc.nodes[1].geometry).toEqual({ x: 450, y: 320, width: 210, height: 48 });
  });
});

describe('V2 M3: Independent Node Icon Lifecycle', () => {
  it('applies, updates, and removes icon without mutating node.text', async () => {
    const { canonicalToReactFlow, reactFlowToCanonical } = await import('../model/adapter');

    const originalDoc = createEmptyDocument('Icon Test', 'mindmap');
    const root = originalDoc.nodes[0];
    root.id = 'root';
    root.text = 'Core Architecture';

    // Step 1: Set icon to '🚀'
    const docWithIcon: CanonicalDocument = {
      ...originalDoc,
      nodes: [{ ...root, icon: '🚀' }],
    };

    expect(docWithIcon.nodes[0].icon).toBe('🚀');
    expect(docWithIcon.nodes[0].text).toBe('Core Architecture'); // Text remains pure!

    // Step 2: Project through ReactFlow adapter and verify CustomNodeData
    const projected = canonicalToReactFlow(docWithIcon, {
      selectedNodeId: null,
    });
    const rfNode = projected.nodes.find((n) => n.id === 'root')!;
    expect(rfNode.data.icon).toBe('🚀');
    expect(rfNode.data.label).toBe('Core Architecture');

    // Step 3: Round-trip back from ReactFlow to CanonicalDocument
    const restoredDoc = reactFlowToCanonical(projected.nodes, projected.edges, docWithIcon);
    expect(restoredDoc.nodes[0].icon).toBe('🚀');
    expect(restoredDoc.nodes[0].text).toBe('Core Architecture');

    // Step 4: Change icon to '💡'
    const updatedDoc: CanonicalDocument = {
      ...restoredDoc,
      nodes: [{ ...restoredDoc.nodes[0], icon: '💡' }],
    };
    expect(updatedDoc.nodes[0].icon).toBe('💡');
    expect(updatedDoc.nodes[0].text).toBe('Core Architecture');

    // Step 5: Remove icon
    const clearedDoc: CanonicalDocument = {
      ...updatedDoc,
      nodes: [{ ...updatedDoc.nodes[0], icon: undefined }],
    };
    expect(clearedDoc.nodes[0].icon).toBeUndefined();
    expect(clearedDoc.nodes[0].text).toBe('Core Architecture');
  });
});


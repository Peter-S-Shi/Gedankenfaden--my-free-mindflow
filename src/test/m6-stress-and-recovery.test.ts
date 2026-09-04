import { describe, it, expect } from 'vitest';
import { CanonicalNode, CanonicalEdge } from '../model/types';
import { createEmptyDocument, cloneDocument } from '../model/document';
import { autoLayoutDocument } from '../model/layout';
import { packageDocumentToMflow, parseMflowFromBytes } from '../model/container';
import { validateDocumentInvariants } from '../model/validator';
import { HistoryManager } from '../model/history';
import { computeGroupBounds, createGroup } from '../model/groups';
import { saveRollingSnapshot, getRecentSnapshots, restoreDocumentFromSnapshot, detectCrashOrUnsaved, markSessionActive, markSessionClean } from '../model/recovery';
import { MemoryMockNativeBridge } from '../platform/tauriBridge';

describe('M6 Representative Large-Document Stress Tests', () => {
  it('handles 1,000-node document lifecycle through layout, container packaging, and validation without data loss', async () => {
    const doc = createEmptyDocument('Extreme Stress 1000', 'mindmap');
    const nodes: CanonicalNode[] = [
      {
        id: 'root',
        text: 'Master Root Node',
        type: 'root',
        geometry: { x: 0, y: 0, width: 180, height: 50 },
      },
    ];
    const edges: CanonicalEdge[] = [];

    // Create a 10-level deep hierarchy with 1,000 total nodes
    let currentId = 1;
    let parents = ['root'];

    while (currentId < 1000) {
      const nextParents: string[] = [];
      for (const parentId of parents) {
        if (currentId >= 1000) break;
        const branchCount = Math.min(3, 1000 - currentId);
        for (let b = 0; b < branchCount; b++) {
          const childId = `node_${currentId++}`;
          nodes.push({
            id: childId,
            parentId,
            text: `Deep Branch Node ${childId}\nMultiline description line 2`,
            type: 'default',
            geometry: { x: 0, y: 0, width: 150, height: 44 },
            style: b % 2 === 0 ? { backgroundColor: '#f1f5f9', fontSize: 13 } : undefined,
          });
          edges.push({
            id: `edge_${parentId}_${childId}`,
            source: parentId,
            target: childId,
          });
          nextParents.push(childId);
        }
      }
      parents = nextParents.length > 0 ? nextParents : ['root'];
    }

    doc.nodes = nodes;
    doc.edges = edges;
    expect(doc.nodes.length).toBe(1000);

    // 1. Layout computation stress
    const layouted = autoLayoutDocument(doc, { preset: 'balanced' });
    expect(layouted.nodes.length).toBe(1000);
    // Ensure all node coordinates are valid non-NaN finite numbers
    for (const n of layouted.nodes) {
      expect(Number.isFinite(n.geometry.x)).toBe(true);
      expect(Number.isFinite(n.geometry.y)).toBe(true);
      expect(n.geometry.width).toBeGreaterThan(0);
      expect(n.geometry.height).toBeGreaterThan(0);
    }

    // 2. Invariant validation
    const validation = validateDocumentInvariants(layouted);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // 3. Packaging into .mflow container
    const mflowBytes = await packageDocumentToMflow(layouted);
    expect(mflowBytes.byteLength).toBeGreaterThan(15000);

    // 4. Deserialization and integrity verification
    const parsed = await parseMflowFromBytes(mflowBytes);
    expect(parsed.document.nodes.length).toBe(1000);
    expect(parsed.document.edges.length).toBe(999);
    expect(parsed.document.nodes[0].id).toBe('root');
    expect(parsed.document.nodes[999].text).toContain('Deep Branch Node');
  });

  it('stress tests rapid consecutive undo/redo operations across 150 transactions', () => {
    const initialDoc = createEmptyDocument('Undo Redo Stress', 'mindmap');
    const history = new HistoryManager(initialDoc, 200);

    let currentDoc = initialDoc;

    // Perform 150 rapid mutations
    for (let i = 1; i <= 150; i++) {
      currentDoc = cloneDocument(currentDoc);
      const newNode: CanonicalNode = {
        id: `node_${i}`,
        parentId: i === 1 ? 'root' : `node_${Math.floor(i / 2)}`,
        text: `Rapid Mutation Step ${i}`,
        type: 'default',
        geometry: { x: i * 20, y: i * 10, width: 140, height: 40 },
      };
      currentDoc.nodes.push(newNode);
      currentDoc.edges.push({
        id: `edge_${newNode.parentId}_${newNode.id}`,
        source: newNode.parentId!,
        target: newNode.id,
      });
      history.pushState(currentDoc);
    }

    expect(currentDoc.nodes.length).toBe(151);
    expect(history.canUndo()).toBe(true);

    // Rapidly undo all 150 operations back to the initial state
    for (let i = 150; i >= 1; i--) {
      expect(history.canUndo()).toBe(true);
      const undone = history.undo();
      expect(undone).not.toBeNull();
      expect(undone!.nodes.length).toBe(i);
    }

    // Now at initial state
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    // Rapidly redo all 150 operations back to final state
    for (let i = 1; i <= 150; i++) {
      expect(history.canRedo()).toBe(true);
      const redone = history.redo();
      expect(redone).not.toBeNull();
      expect(redone!.nodes.length).toBe(i + 1);
    }

    expect(history.canRedo()).toBe(false);
  });

  it('handles extreme coordinate spaces and extreme zoom bounds calculations stably', () => {
    const doc = createEmptyDocument('Extreme Geometry', 'flowchart');
    const farNegativeNode: CanonicalNode = {
      id: 'far_neg',
      text: 'Far Negative Coordinate',
      type: 'default',
      geometry: { x: -50000, y: -45000, width: 200, height: 60 },
    };
    const farPositiveNode: CanonicalNode = {
      id: 'far_pos',
      text: 'Far Positive Coordinate',
      type: 'default',
      geometry: { x: 50000, y: 45000, width: 200, height: 60 },
    };
    doc.nodes.push(farNegativeNode, farPositiveNode);

    // Visual group spanning extreme coordinates
    const extremeGroup = createGroup('Universe Group', ['far_neg', 'far_pos'], doc.nodes);
    const bounds = computeGroupBounds(extremeGroup, doc.nodes);

    expect(bounds.x).toBe(-50024);
    expect(bounds.y).toBe(-45056);
    expect(bounds.width).toBe(100248);
    expect(bounds.height).toBe(90140);

    // Verify extreme zoom scales (0.05x zoom-out and 5.0x zoom-in)
    const minZoom = 0.05;
    const maxZoom = 5.0;

    const scaledWidthMin = bounds.width * minZoom;
    const scaledWidthMax = bounds.width * maxZoom;

    expect(Number.isFinite(scaledWidthMin)).toBe(true);
    expect(Number.isFinite(scaledWidthMax)).toBe(true);
    expect(scaledWidthMin).toBeGreaterThan(0);
    expect(scaledWidthMax).toBeGreaterThan(scaledWidthMin);
  });

  it('verifies rolling snapshot and crash recovery integrity under rapid dirty state cycles', async () => {
    const mockBridge = new MemoryMockNativeBridge();
    const doc = createEmptyDocument('Recovery Stress', 'mindmap');
    doc.id = 'stress_recovery_doc';

    // Simulate 5 rolling snapshot saves
    for (let v = 1; v <= 5; v++) {
      const snapDoc = cloneDocument(doc);
      snapDoc.title = `Snapshot Version ${v}`;
      await saveRollingSnapshot(snapDoc, 'autosave', 5, mockBridge);
    }

    // Retrieve snapshots
    const snapshots = await getRecentSnapshots('stress_recovery_doc', mockBridge);
    expect(snapshots.length).toBe(5);
    expect(snapshots[0].docTitle).toBe('Snapshot Version 5');

    // Restore from snapshot
    const restored = await restoreDocumentFromSnapshot(snapshots[0]);
    expect(restored).not.toBeNull();
    expect(restored.title).toBe('Snapshot Version 5');

    // Mark session active (unclean by default)
    await markSessionActive('stress_recovery_doc', 'Recovery Stress', mockBridge);
    const crashStatus = await detectCrashOrUnsaved(mockBridge);
    expect(crashStatus.hasUnsavedOrCrash).toBe(true);
    expect(crashStatus.uncleanSession?.activeDocId).toBe('stress_recovery_doc');
    expect(crashStatus.latestSnapshot?.docTitle).toBe('Snapshot Version 5');

    // Mark session clean
    await markSessionClean(mockBridge);
    const cleanStatus = await detectCrashOrUnsaved(mockBridge);
    expect(cleanStatus.hasUnsavedOrCrash).toBe(false);
  });
});

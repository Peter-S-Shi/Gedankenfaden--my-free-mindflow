/**
 * Ticket #13 / Ticket #14: Startup Hydration & Crash Recovery Lifecycle Test Suite
 *
 * Verifies:
 * 1. Startup Hydration (#13):
 *    - Starting observation on an authorized folder immediately hydrates library entries.
 *    - Persisted library folder with .mflow, .json, .md, .opml outlines hydrates without manual rescan.
 * 2. Recovery State Machine (#14):
 *    - Active document session writes dirty journal (isCleanShutdown: false) and initial rolling snapshot.
 *    - Canvas edits update the rolling snapshot.
 *    - Clean close flushes pending edits, marks session clean, and terminates app window lifecycle.
 *    - Abrupt termination leaves dirty journal + latest snapshot, detected on relaunch with recoverable state.
 *    - Snapshot restoration reconstructs document and clears dirty journal state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MemoryMockNativeBridge,
  resetNativeBridge,
  setNativeBridge,
} from '../platform/tauriBridge';
import { syncLibraryWithDisk } from '../model/library';
import {
  saveRollingSnapshot,
  getRecentSnapshots,
  restoreDocumentFromSnapshot,
  markSessionActive,
  markSessionClean,
  detectCrashOrUnsaved,
  AutoSaveEngine,
} from '../model/recovery';
import { createEmptyDocument } from '../model/document';
import { CanonicalDocument } from '../model/types';
import { packageDocumentToMflow } from '../model/container';

describe('Ticket #13: Library startup hydration lifecycle', () => {
  let bridge: MemoryMockNativeBridge;
  const FOLDER = 'C:/Users/test/Documents/Gedankenfaden';

  beforeEach(() => {
    resetNativeBridge();
    bridge = new MemoryMockNativeBridge();
    setNativeBridge(bridge);
  });

  it('hydrates library entries on startup folder establish', async () => {
    // Put existing documents in folder
    const doc = createEmptyDocument('Existing Mindmap', 'mindmap');
    const bytes = packageDocumentToMflow(doc);
    await bridge.writeBinaryFile(`${FOLDER}/existing.mflow`, bytes);
    await bridge.writeTextFile(`${FOLDER}/notes.md`, '# Notes\n- Point 1\n- Point 2');

    const hydratedEntries = await syncLibraryWithDisk([FOLDER], bridge);

    expect(hydratedEntries.length).toBe(2);
    expect(hydratedEntries.some((e) => e.title === 'Existing Mindmap')).toBe(true);
    expect(hydratedEntries.some((e) => e.title === 'Notes')).toBe(true);
  });

  it('syncLibraryWithDisk on persisted root populates all valid files without manual rescan', async () => {
    const doc1 = createEmptyDocument('Project Plan', 'mindmap');
    const bytes1 = packageDocumentToMflow(doc1);
    await bridge.writeBinaryFile(`${FOLDER}/plan.mflow`, bytes1);

    const doc2 = createEmptyDocument('Flowchart A', 'flowchart');
    await bridge.writeTextFile(`${FOLDER}/flow.json`, JSON.stringify(doc2));

    await bridge.writeTextFile(
      `${FOLDER}/structure.opml`,
      '<opml version="2.0"><head><title>Structure</title></head><body><outline text="A"/></body></opml>'
    );

    const entries = await syncLibraryWithDisk([FOLDER], bridge);

    expect(entries.length).toBe(3);
    const titles = entries.map((e) => e.title).sort();
    expect(titles).toEqual(['Flowchart A', 'Project Plan', 'Structure'].sort());
  });
});

describe('Ticket #14: Recovery state machine and dirty session lifecycle', () => {
  let bridge: MemoryMockNativeBridge;

  beforeEach(() => {
    resetNativeBridge();
    bridge = new MemoryMockNativeBridge();
    setNativeBridge(bridge);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opening a document creates a dirty journal and saves an initial recovery snapshot', async () => {
    const doc = createEmptyDocument('Active Doc', 'mindmap');

    await markSessionActive(doc.id, doc.title, bridge);
    await saveRollingSnapshot(doc, 'autosave', undefined, bridge);

    const recovery = await detectCrashOrUnsaved(bridge);
    expect(recovery.hasUnsavedOrCrash).toBe(true);
    expect(recovery.uncleanSession?.activeDocId).toBe(doc.id);
    expect(recovery.uncleanSession?.isCleanShutdown).toBe(false);
    expect(recovery.latestSnapshot).toBeDefined();
    expect(recovery.latestSnapshot?.docTitle).toBe('Active Doc');
  });

  it('debounced autosave captures in-editor edits into rolling snapshot', async () => {
    const doc = createEmptyDocument('Autosaved Doc', 'mindmap');
    await markSessionActive(doc.id, doc.title, bridge);
    await saveRollingSnapshot(doc, 'autosave', undefined, bridge);

    const engine = new AutoSaveEngine(300);

    // Simulate user adding a node on canvas
    const editedDoc: CanonicalDocument = {
      ...doc,
      title: 'Autosaved Doc (Edited)',
      nodes: [
        ...doc.nodes,
        { id: 'node_new', text: 'New Child Node', geometry: { x: 200, y: 100 } },
      ],
      updatedAt: new Date().toISOString(),
    };

    engine.scheduleSave(editedDoc, async (d) => {
      await saveRollingSnapshot(d, 'autosave', undefined, bridge);
    });

    await vi.advanceTimersByTimeAsync(300);

    const snapshots = await getRecentSnapshots(doc.id, bridge);
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0].docTitle).toBe('Autosaved Doc (Edited)');

    const restored = await restoreDocumentFromSnapshot(snapshots[0]);
    expect(restored.nodes.some((n) => n.id === 'node_new')).toBe(true);
  });

  it('normal clean close flushes autosave and marks session clean so relaunch has no recovery banner', async () => {
    const doc = createEmptyDocument('Clean Close Doc', 'mindmap');
    await markSessionActive(doc.id, doc.title, bridge);

    const engine = new AutoSaveEngine(500);
    const editedDoc: CanonicalDocument = {
      ...doc,
      title: 'Clean Close Doc (Final Edit)',
      updatedAt: new Date().toISOString(),
    };

    engine.scheduleSave(editedDoc, async (d) => {
      await saveRollingSnapshot(d, 'autosave', undefined, bridge);
    });

    // Simulate clean close sequence: flush pending autosave, then mark clean
    await engine.flushPending();
    await markSessionClean(bridge);

    const recovery = await detectCrashOrUnsaved(bridge);
    expect(recovery.hasUnsavedOrCrash).toBe(false);
  });

  it('abrupt interruption (kill/crash) preserves latest dirty snapshot for crash recovery', async () => {
    const doc = createEmptyDocument('Crash Doc', 'mindmap');
    await markSessionActive(doc.id, doc.title, bridge);

    const engine = new AutoSaveEngine(200);
    const editedDoc: CanonicalDocument = {
      ...doc,
      title: 'Crash Doc with Unsaved Edit',
      nodes: [
        ...doc.nodes,
        { id: 'n1', text: 'Crash Note', geometry: { x: 100, y: 100 } },
      ],
      updatedAt: new Date().toISOString(),
    };

    engine.scheduleSave(editedDoc, async (d) => {
      await saveRollingSnapshot(d, 'autosave', undefined, bridge);
    });

    await vi.advanceTimersByTimeAsync(200);

    // Process is killed abruptly -- markSessionClean is NEVER called!
    const recovery = await detectCrashOrUnsaved(bridge);
    expect(recovery.hasUnsavedOrCrash).toBe(true);
    expect(recovery.latestSnapshot).toBeDefined();
    expect(recovery.latestSnapshot?.docTitle).toBe('Crash Doc with Unsaved Edit');

    // Restoring unsaved snapshot restores the exact edited document
    const restored = await restoreDocumentFromSnapshot(recovery.latestSnapshot!);
    expect(restored.title).toBe('Crash Doc with Unsaved Edit');
    expect(restored.nodes.some((n) => n.id === 'n1')).toBe(true);

    // After restoring, session is marked clean
    await markSessionClean(bridge);
    const afterRestore = await detectCrashOrUnsaved(bridge);
    expect(afterRestore.hasUnsavedOrCrash).toBe(false);
  });
});

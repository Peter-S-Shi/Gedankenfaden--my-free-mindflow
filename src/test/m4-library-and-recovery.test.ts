import { describe, it, expect, beforeEach } from 'vitest';
import { createEmptyDocument } from '../model/document';
import {
  AutoSaveEngine,
  atomicWriteTextFile,
  atomicWriteBinaryFile,
  saveRollingSnapshot,
  getRecentSnapshots,
  restoreDocumentFromSnapshot,
  markSessionActive,
  markSessionClean,
  detectCrashOrUnsaved,
} from '../model/recovery';
import {
  loadLibraryCache,
  saveLibraryCache,
  scanDirectoryForDocuments,
  syncLibraryWithDisk,
  createDocumentInLibrary,
  deleteDocumentFromLibrary,
  LibraryEntry,
} from '../model/library';
import { MemoryMockNativeBridge, setNativeBridge } from '../platform/tauriBridge';

describe('Milestone 4: Invisible Reliability & Crash Recovery Engine', () => {
  let bridge: MemoryMockNativeBridge;

  beforeEach(() => {
    bridge = new MemoryMockNativeBridge();
    setNativeBridge(bridge);
  });

  it('debounces autosaves and flushes pending writes on request', async () => {
    const engine = new AutoSaveEngine(100);
    const doc = createEmptyDocument('Autosave Probe', 'mindmap');
    let saveCount = 0;

    const saveHandler = async (_d: typeof doc) => {
      saveCount++;
    };

    engine.scheduleSave(doc, saveHandler);
    expect(engine.isPending()).toBe(true);

    // Flush immediately
    await engine.flushPending();
    expect(saveCount).toBe(1);
    expect(engine.isPending()).toBe(false);
  });

  it('atomically writes text and binary files via temporary swap', async () => {
    const textPath = '/documents/atomic_test.json';
    await atomicWriteTextFile(textPath, JSON.stringify({ hello: 'world' }), bridge);

    expect(await bridge.exists(textPath)).toBe(true);
    expect(await bridge.exists(`${textPath}.tmp`)).toBe(false);
    const content = await bridge.readTextFile(textPath);
    expect(JSON.parse(content).hello).toBe('world');

    const binPath = '/documents/atomic_test.bin';
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await atomicWriteBinaryFile(binPath, bytes, bridge);
    expect(await bridge.exists(binPath)).toBe(true);
    expect(await bridge.exists(`${binPath}.tmp`)).toBe(false);
    const readBytes = await bridge.readBinaryFile(binPath);
    expect(readBytes.length).toBe(5);
  });

  it('maintains bounded rolling snapshots and evicts oldest past limit', async () => {
    const doc = createEmptyDocument('Snapshot Doc', 'flowchart');
    const LIMIT = 3;

    for (let i = 1; i <= 5; i++) {
      doc.title = `Snapshot Version ${i}`;
      await saveRollingSnapshot(doc, 'autosave', LIMIT, bridge);
    }

    const snapshots = await getRecentSnapshots(doc.id, bridge);
    expect(snapshots.length).toBe(LIMIT);
    expect(snapshots[0].docTitle).toBe('Snapshot Version 5');
    expect(snapshots[snapshots.length - 1].docTitle).toBe('Snapshot Version 3');

    // Restore from latest snapshot
    const restored = await restoreDocumentFromSnapshot(snapshots[0]);
    expect(restored.id).toBe(doc.id);
    expect(restored.title).toBe('Snapshot Version 5');
  });

  it('detects crash/unclean shutdown and provides latest snapshot for recovery', async () => {
    const doc = createEmptyDocument('Crash Recovery Target', 'mindmap');
    await saveRollingSnapshot(doc, 'crash_backup', 5, bridge);

    // Mark active session without clean shutdown
    await markSessionActive(doc.id, doc.title, bridge);

    const check1 = await detectCrashOrUnsaved(bridge);
    expect(check1.hasUnsavedOrCrash).toBe(true);
    expect(check1.uncleanSession?.activeDocId).toBe(doc.id);
    expect(check1.latestSnapshot).toBeDefined();
    expect(check1.latestSnapshot?.docTitle).toBe('Crash Recovery Target');

    // Now mark clean shutdown
    await markSessionClean(bridge);
    const check2 = await detectCrashOrUnsaved(bridge);
    expect(check2.hasUnsavedOrCrash).toBe(false);
  });
});

describe('Milestone 4: Hybrid Library & Local Disk Catalog', () => {
  let bridge: MemoryMockNativeBridge;

  beforeEach(() => {
    bridge = new MemoryMockNativeBridge();
    setNativeBridge(bridge);
  });

  it('saves and fast-loads metadata cache without disk scanning', async () => {
    const entries: LibraryEntry[] = [
      {
        id: 'doc_1',
        title: 'Cached Document 1',
        mode: 'mindmap',
        filePath: '/documents/doc1.mflow',
        fileFormat: 'mflow',
        updatedAt: new Date().toISOString(),
        nodeCount: 5,
        edgeCount: 4,
      },
    ];

    await saveLibraryCache(entries, bridge);
    const loaded = await loadLibraryCache(bridge);

    expect(loaded.length).toBe(1);
    expect(loaded[0].title).toBe('Cached Document 1');
  });

  it('scans directory for real documents and synchronizes hybrid cache', async () => {
    const targetDir = '/documents/work';
    await bridge.createDir(targetDir, { recursive: true });

    // Create 1 mflow document and 1 json document in target folder
    const created1 = await createDocumentInLibrary('Project Strategy', 'mindmap', 'mflow', targetDir, bridge);
    const created2 = await createDocumentInLibrary('Deployment Pipeline', 'flowchart', 'json', targetDir, bridge);

    expect(await bridge.exists(created1.entry.filePath)).toBe(true);
    expect(await bridge.exists(created2.entry.filePath)).toBe(true);

    // Scan directory
    const scanned = await scanDirectoryForDocuments(targetDir, bridge);
    expect(scanned.length).toBe(2);

    // Synchronize cache
    const synced = await syncLibraryWithDisk([targetDir], bridge);
    expect(synced.length).toBe(2);

    // Delete one document
    await deleteDocumentFromLibrary(created1.entry, bridge);
    expect(await bridge.exists(created1.entry.filePath)).toBe(false);

    // Verify cache updated
    const afterDelete = await loadLibraryCache(bridge);
    expect(afterDelete.length).toBe(1);
    expect(afterDelete[0].title).toBe('Deployment Pipeline');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryMockNativeBridge, resetNativeBridge, setNativeBridge } from '../platform/tauriBridge';
import {
  scanDirectoryForDocuments,
  syncLibraryWithDisk,
  loadLibraryCache,
  createDocumentInLibrary,
  deleteDocumentFromLibrary,
  loadDocumentFromFile,
} from '../model/library';
import { packageDocumentToMflow } from '../model/container';
import { createEmptyDocument } from '../model/document';

describe('Milestone 7: Real Filesystem Library & Disk Catalog Sync', () => {
  let bridge: MemoryMockNativeBridge;
  const docsFolder = 'C:/Users/test/Documents/Gedankenfaden';

  beforeEach(() => {
    resetNativeBridge();
    bridge = new MemoryMockNativeBridge();
    setNativeBridge(bridge);
  });

  it('scans filesystem directory for .mflow and .json documents, ignoring other extensions', async () => {
    // Create a .mflow file
    const doc1 = createEmptyDocument('Sprint Planning Mind Map', 'mindmap');
    const bytes1 = await packageDocumentToMflow(doc1);
    await bridge.writeBinaryFile(`${docsFolder}/planning.mflow`, bytes1);

    // Create a .json file
    const doc2 = createEmptyDocument('Release Pipeline Flowchart', 'flowchart');
    await bridge.writeTextFile(`${docsFolder}/release.json`, JSON.stringify(doc2));

    // Create unrelated non-graph files
    await bridge.writeTextFile(`${docsFolder}/notes.txt`, 'Meeting notes');
    await bridge.writeBinaryFile(`${docsFolder}/logo.png`, new Uint8Array([1, 2, 3]));

    const scanned = await scanDirectoryForDocuments(docsFolder, bridge);
    expect(scanned.length).toBe(2);

    const titles = scanned.map((s) => s.title);
    expect(titles).toContain('Sprint Planning Mind Map');
    expect(titles).toContain('Release Pipeline Flowchart');
  });

  it('synchronizes disk state with fast metadata cache (library.json)', async () => {
    const doc = createEmptyDocument('Initial Document', 'mindmap');
    const bytes = await packageDocumentToMflow(doc);
    await bridge.writeBinaryFile(`${docsFolder}/doc1.mflow`, bytes);

    const synced = await syncLibraryWithDisk([docsFolder], bridge);
    expect(synced.length).toBe(1);
    expect(synced[0].title).toBe('Initial Document');

    // Verify cache in AppData
    const cached = await loadLibraryCache(bridge);
    expect(cached.length).toBe(1);
    expect(cached[0].id).toBe(doc.id);

    // Now remove file from disk and resync -> cache must prune missing files
    await bridge.removeFile(`${docsFolder}/doc1.mflow`);
    const afterDelete = await syncLibraryWithDisk([docsFolder], bridge);
    expect(afterDelete.length).toBe(0);

    const cachedAfter = await loadLibraryCache(bridge);
    expect(cachedAfter.length).toBe(0);
  });

  it('creates new documents directly on disk and updates catalog', async () => {
    const { doc, entry } = await createDocumentInLibrary(
      'Quarterly OKRs',
      'mindmap',
      'mflow',
      docsFolder,
      bridge
    );

    expect(doc.title).toBe('Quarterly OKRs');
    expect(entry.filePath).toContain('quarterly_okrs');
    expect(await bridge.exists(entry.filePath)).toBe(true);

    // Read back and verify
    const loaded = await loadDocumentFromFile(entry.filePath, bridge);
    expect(loaded).not.toBeNull();
    expect(loaded?.title).toBe('Quarterly OKRs');

    const cached = await loadLibraryCache(bridge);
    expect(cached.some((c) => c.id === doc.id)).toBe(true);
  });

  it('deletes document via OS trash / recycle bin and updates cache', async () => {
    const { entry } = await createDocumentInLibrary(
      'To Be Deleted',
      'flowchart',
      'mflow',
      docsFolder,
      bridge
    );

    expect(await bridge.exists(entry.filePath)).toBe(true);

    // Trigger non-destructive deletion
    await deleteDocumentFromLibrary(entry, bridge);

    // Path should no longer exist in active documents directory
    expect(await bridge.exists(entry.filePath)).toBe(false);

    // Cache should no longer have this entry
    const cached = await loadLibraryCache(bridge);
    expect(cached.some((c) => c.filePath === entry.filePath)).toBe(false);
  });
});

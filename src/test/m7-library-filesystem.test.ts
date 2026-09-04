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

  it('Gate B: loads and parses Markdown (.md) hierarchy into CanonicalDocument without modifying source', async () => {
    const mdPath = 'C:/Users/test/Documents/External/architecture.md';
    const mdContent = `# Project Gedankenfaden
## User Interface
### Canvas Editor
### Library Home
## Native Shell
### Tauri v2
### WebView2`;

    await bridge.writeTextFile(mdPath, mdContent);

    const doc = await loadDocumentFromFile(mdPath, bridge);
    expect(doc).not.toBeNull();
    expect(doc?.title).toBe('Project Gedankenfaden');
    expect(doc?.nodes.length).toBeGreaterThanOrEqual(5);
    expect(doc?.edges.length).toBeGreaterThanOrEqual(4);

    // Verify source file was strictly NOT modified
    const untouched = await bridge.readTextFile(mdPath);
    expect(untouched).toBe(mdContent);
  });

  it('Gate B: loads and parses OPML (.opml) hierarchy into CanonicalDocument without modifying source', async () => {
    const opmlPath = 'C:/Users/test/Documents/External/outline.opml';
    const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Product Strategy</title>
  </head>
  <body>
    <outline text="Core Goals">
      <outline text="Local First Architecture" />
      <outline text="Keyboard Centric Mind Mapping" />
    </outline>
  </body>
</opml>`;

    await bridge.writeTextFile(opmlPath, opmlContent);

    const doc = await loadDocumentFromFile(opmlPath, bridge);
    expect(doc).not.toBeNull();
    expect(doc?.title).toBe('Product Strategy');
    expect(doc?.nodes.length).toBeGreaterThanOrEqual(3);

    // Verify source file was strictly NOT modified
    const untouched = await bridge.readTextFile(opmlPath);
    expect(untouched).toBe(opmlContent);
  });

  it('Gate B: packages imported outline and saves to active library as a normal user-owned .mflow', async () => {
    const mdPath = 'C:/Users/test/Documents/External/imported_notes.md';
    const mdContent = `# Team Retrospective
## What went well
### High velocity
## What can improve
### Better test automation`;

    await bridge.writeTextFile(mdPath, mdContent);
    const doc = await loadDocumentFromFile(mdPath, bridge);
    expect(doc).not.toBeNull();

    // Package to user library .mflow
    const mflowPath = `${docsFolder}/team_retrospective.mflow`;
    const bytes = await packageDocumentToMflow(doc!);
    await bridge.writeBinaryFile(mflowPath, bytes);

    // Rescan library and verify discovery
    const scanned = await scanDirectoryForDocuments(docsFolder, bridge);
    const found = scanned.find((s) => s.filePath === mflowPath);
    expect(found).toBeDefined();
    expect(found?.title).toBe('Team Retrospective');
    expect(found?.fileFormat).toBe('mflow');

    // Read back and confirm full canonical round-trip
    const reloaded = await loadDocumentFromFile(mflowPath, bridge);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.title).toBe('Team Retrospective');
    expect(reloaded?.nodes.length).toBe(doc?.nodes.length);
  });

  it('Gate C: clean or empty library folder remains truthfully empty with zero auto-seeded demo files', async () => {
    const cleanEmptyFolder = 'C:/Users/test/Documents/EmptyLibrary';
    await bridge.createDir(cleanEmptyFolder, { recursive: true });

    // Synchronize disk state with empty folder
    const synced = await syncLibraryWithDisk([cleanEmptyFolder], bridge);

    // Must be completely empty
    expect(synced.length).toBe(0);

    // Scanned directory must also be strictly empty
    const diskItems = await scanDirectoryForDocuments(cleanEmptyFolder, bridge);
    expect(diskItems.length).toBe(0);

    // Direct filesystem check: directory must have zero entries
    const dirEntries = await bridge.readDir(cleanEmptyFolder);
    expect(dirEntries.length).toBe(0);
  });
});

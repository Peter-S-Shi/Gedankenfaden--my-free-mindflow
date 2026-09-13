/**
 * Ticket #13 (F09) reopened: real-user acceptance evidence showed Rescan Disk
 * failing to discover all appropriate files when a .md/.opml outline is placed
 * directly in the active Library folder -- the scanner only recognized
 * .mflow/.json, even though "Import File" already accepts .md/.markdown/.opml.
 * This is a truthfulness gap between what the product tells users it supports
 * importing and what Rescan/watcher-driven discovery actually finds.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryMockNativeBridge, resetNativeBridge, setNativeBridge } from '../platform/tauriBridge';
import { syncLibraryWithDisk, scanDirectoryForDocuments } from '../model/library';

describe('F13/F09 Library scan discovers importable outline formats already supported by Import File', () => {
  let bridge: MemoryMockNativeBridge;
  const docsFolder = 'C:/Users/test/Documents/Gedankenfaden';

  beforeEach(() => {
    resetNativeBridge();
    bridge = new MemoryMockNativeBridge();
    setNativeBridge(bridge);
  });

  it('discovers a .md outline dropped directly in the Library folder without manual Import File', async () => {
    const mdContent = `# Sample Outline Topic\n## 焦点议题\n### 子议题一\n### 子议题二`;
    await bridge.writeTextFile(`${docsFolder}/policy-outline.md`, mdContent);

    const synced = await syncLibraryWithDisk([docsFolder], bridge);

    expect(synced.length).toBe(1);
    expect(synced[0].title).toBe('Sample Outline Topic');
    // Auto-discovered outlines become normal owned .mflow documents so they are
    // fully editable/savable like any other Library entry.
    expect(synced[0].fileFormat).toBe('mflow');

    // The original source file is left untouched, not deleted or overwritten.
    expect(await bridge.exists(`${docsFolder}/policy-outline.md`)).toBe(true);
  });

  it('discovers a .opml outline dropped directly in the Library folder', async () => {
    const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>Roadmap</title></head><body><outline text="Phase 1"><outline text="Discovery" /></outline></body></opml>`;
    await bridge.writeTextFile(`${docsFolder}/roadmap.opml`, opmlContent);

    const synced = await syncLibraryWithDisk([docsFolder], bridge);

    expect(synced.length).toBe(1);
    expect(synced[0].title).toBe('Roadmap');
  });

  it('does not duplicate an already-discovered outline on repeated Rescan Disk calls', async () => {
    await bridge.writeTextFile(
      `${docsFolder}/notes.md`,
      `# Meeting Notes\n## Action Items`
    );

    const first = await syncLibraryWithDisk([docsFolder], bridge);
    expect(first.length).toBe(1);

    const second = await syncLibraryWithDisk([docsFolder], bridge);
    const third = await syncLibraryWithDisk([docsFolder], bridge);

    expect(second.length).toBe(1);
    expect(third.length).toBe(1);
    expect(second[0].filePath).toBe(first[0].filePath);
  });

  it('leaves an unrelated .txt/.png file ignored, as before', async () => {
    await bridge.writeTextFile(`${docsFolder}/notes.txt`, 'plain notes');
    await bridge.writeBinaryFile(`${docsFolder}/logo.png`, new Uint8Array([1, 2, 3]));

    const scanned = await scanDirectoryForDocuments(docsFolder, bridge);
    expect(scanned.length).toBe(0);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryMockNativeBridge, resetNativeBridge, setNativeBridge } from '../platform/tauriBridge';
import { syncLibraryWithDisk } from '../model/library';
import { packageDocumentToMflow } from '../model/container';
import { createEmptyDocument } from '../model/document';

/**
 * RC governance defect: switching the Active Library Folder must scope the
 * visible Library strictly to the currently active root. syncLibraryWithDisk
 * merges new scan results into the FULL persisted cache and only prunes
 * entries whose file no longer exists anywhere on disk -- it never prunes
 * entries that simply fall outside the folder(s) being scanned. Since
 * switching folders (App.tsx handleChangeFolder) never deletes the
 * previous folder's files, its entries survive the "still exists" check
 * forever and leak into every subsequent single-root sync, including after
 * switching back to the original folder.
 */
describe('RC governance: Active Library Folder cross-root cache isolation', () => {
  let bridge: MemoryMockNativeBridge;
  const folderA = 'C:/Users/test/Documents/LibraryA';
  const folderB = 'C:/Users/test/Documents/LibraryB';

  beforeEach(async () => {
    resetNativeBridge();
    bridge = new MemoryMockNativeBridge();
    setNativeBridge(bridge);

    const docA = createEmptyDocument('Folder A Document', 'mindmap');
    await bridge.writeBinaryFile(`${folderA}/doc-a.mflow`, await packageDocumentToMflow(docA));

    const docB = createEmptyDocument('Folder B Document', 'mindmap');
    await bridge.writeBinaryFile(`${folderB}/doc-b.mflow`, await packageDocumentToMflow(docB));
  });

  it('does not leak Folder B entries into Folder A after switching A -> B -> A', async () => {
    const initialA = await syncLibraryWithDisk([folderA], bridge);
    expect(initialA.map((e) => e.title)).toEqual(['Folder A Document']);

    const afterSwitchToB = await syncLibraryWithDisk([folderB], bridge);
    expect(afterSwitchToB.map((e) => e.title)).toEqual(['Folder B Document']);

    const afterSwitchBackToA = await syncLibraryWithDisk([folderA], bridge);
    expect(afterSwitchBackToA.map((e) => e.title)).toEqual(['Folder A Document']);
  });
});

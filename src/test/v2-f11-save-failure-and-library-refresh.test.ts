/**
 * Ticket #15 / Ledger F11 — Surface save failures and refresh Library metadata
 * after save.
 *
 * Exercises both halves the acceptance criteria call for: the native
 * persistence outcome (saveDocumentToLibrary) and the resulting Library UI
 * state (the LibraryEntry it hands back for merging into the visible list).
 */
import { describe, it, expect } from 'vitest';
import { MemoryMockNativeBridge } from '../platform/tauriBridge';
import { saveDocumentToLibrary, deriveLibraryEntry, LibraryEntry } from '../model/library';
import { createEmptyDocument } from '../model/document';

class WriteFailingBridge extends MemoryMockNativeBridge {
  async writeTextFile(): Promise<void> {
    throw new Error('Disk is full');
  }
}

const FILE_PATH = 'C:/Users/test/Documents/Gedankenfaden/plan.json';

describe('Ticket #15 (F11): save failure is reported, not swallowed', () => {
  it('returns a clear failure result on a controlled native write failure', async () => {
    const bridge = new WriteFailingBridge();
    const doc = createEmptyDocument('Plan', 'mindmap');

    const result = await saveDocumentToLibrary(doc, FILE_PATH, bridge);

    expect(result.success).toBe(false);
    expect(result.message).toBeTruthy();
    expect(result.entry).toBeUndefined();
  });

  it('does not leave the file looking written after a failed save', async () => {
    const bridge = new WriteFailingBridge();
    const doc = createEmptyDocument('Plan', 'mindmap');

    await saveDocumentToLibrary(doc, FILE_PATH, bridge);

    expect(await bridge.exists(FILE_PATH)).toBe(false);
  });
});

describe('Ticket #15 (F11): a successful save refreshes visible Library metadata', () => {
  it('returns fresh Library metadata reflecting the just-saved document, without a rescan', async () => {
    const bridge = new MemoryMockNativeBridge();
    const doc = createEmptyDocument('Quarterly Plan', 'mindmap');
    doc.nodes.push(
      { id: 'n2', text: 'Extra node', geometry: { x: 0, y: 0, width: 10, height: 10 } } as any
    );
    doc.updatedAt = '2026-05-01T12:00:00.000Z';

    const result = await saveDocumentToLibrary(doc, FILE_PATH, bridge);

    expect(result.success).toBe(true);
    expect(result.entry).toEqual<LibraryEntry>({
      id: doc.id,
      title: 'Quarterly Plan',
      mode: 'mindmap',
      filePath: FILE_PATH,
      fileFormat: 'json',
      updatedAt: '2026-05-01T12:00:00.000Z',
      nodeCount: doc.nodes.length,
      edgeCount: doc.edges.length,
      isPinned: undefined,
      tags: undefined,
    });
  });

  it('preserves pinning and tags carried over from the existing Library entry', async () => {
    const bridge = new MemoryMockNativeBridge();
    const doc = createEmptyDocument('Pinned Doc', 'mindmap');
    const existing = { isPinned: true, tags: ['work'] };

    const result = await saveDocumentToLibrary(doc, FILE_PATH, bridge, existing);

    expect(result.entry?.isPinned).toBe(true);
    expect(result.entry?.tags).toEqual(['work']);
  });

  it('merges the derived entry into an existing Library list by file path (App-level UI state)', () => {
    const existingEntries: LibraryEntry[] = [
      {
        id: 'doc_other',
        title: 'Other Doc',
        mode: 'mindmap',
        filePath: 'C:/Users/test/Documents/Gedankenfaden/other.json',
        fileFormat: 'json',
        updatedAt: '2026-01-01T00:00:00.000Z',
        nodeCount: 1,
        edgeCount: 0,
      },
      {
        id: 'doc_plan',
        title: 'Plan (stale)',
        mode: 'mindmap',
        filePath: FILE_PATH,
        fileFormat: 'json',
        updatedAt: '2026-01-01T00:00:00.000Z',
        nodeCount: 1,
        edgeCount: 0,
      },
    ];

    const doc = createEmptyDocument('Plan (fresh)', 'mindmap');
    doc.updatedAt = '2026-06-01T00:00:00.000Z';
    const freshEntry = deriveLibraryEntry(doc, FILE_PATH);

    // The same merge-by-filePath logic App.tsx's handleSaveDoc applies to libraryEntries.
    const idx = existingEntries.findIndex((e) => e.filePath === FILE_PATH);
    const merged = [...existingEntries];
    merged[idx] = freshEntry;

    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.filePath === FILE_PATH)?.title).toBe('Plan (fresh)');
    expect(merged.find((e) => e.filePath === FILE_PATH)?.updatedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(merged.find((e) => e.id === 'doc_other')?.title).toBe('Other Doc');
  });

  it('is a no-op success for a path with no recognized document extension', async () => {
    const bridge = new MemoryMockNativeBridge();
    const doc = createEmptyDocument('Untracked', 'mindmap');

    const result = await saveDocumentToLibrary(doc, 'C:/Users/test/Desktop/notes.txt', bridge);

    expect(result.success).toBe(true);
    expect(result.entry).toBeUndefined();
  });
});

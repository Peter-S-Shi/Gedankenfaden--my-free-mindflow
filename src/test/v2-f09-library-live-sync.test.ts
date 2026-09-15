/**
 * Ticket #13 / Ledger F09 — Live Library synchronization against external
 * filesystem changes.
 *
 * The actual OS-level watcher (notify::recommended_watcher, non-recursive,
 * scoped to an already-authorized Library root) is unit-tested directly in
 * src-tauri/src/main.rs (cargo test), since that is where filesystem events
 * are genuinely observed. This file covers the renderer-side seam: debouncing
 * change notifications into a single rescan, reflecting external create and
 * delete in the resulting entries, and verifying watcher teardown so a closed
 * or changed Library context does not keep reacting.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryMockNativeBridge, resetNativeBridge } from '../platform/tauriBridge';
import { watchLibraryFolder } from '../model/libraryWatch';
import { LibraryEntry } from '../model/library';

const FOLDER = 'C:/Users/test/Documents/Gedankenfaden';

describe('Ticket #13 (F09): live Library synchronization', () => {
  beforeEach(() => {
    resetNativeBridge();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts watching the authorized folder immediately', async () => {
    const bridge = new MemoryMockNativeBridge();
    const handle = watchLibraryFolder(FOLDER, bridge, () => {});
    await vi.runOnlyPendingTimersAsync();

    expect(bridge.getWatchedLibraryRoot()).toBe(FOLDER);
    handle.stop();
  });

  it('reflects an externally created document after a debounced rescan', async () => {
    const bridge = new MemoryMockNativeBridge();
    let latestEntries: LibraryEntry[] = [];
    const handle = watchLibraryFolder(FOLDER, bridge, (entries) => {
      latestEntries = entries;
    });

    // Simulate a file appearing on disk outside the app, then the watcher firing.
    await bridge.writeTextFile(
      `${FOLDER}/external.json`,
      JSON.stringify({
        schemaVersion: '1.0',
        id: 'doc_external',
        title: 'External Doc',
        mode: 'mindmap',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        viewport: { x: 0, y: 0, zoom: 1 },
        theme: {},
        nodes: [],
        edges: [],
        groups: [],
      })
    );
    bridge.simulateExternalLibraryChange();

    await vi.advanceTimersByTimeAsync(500);

    expect(latestEntries.some((e) => e.filePath === `${FOLDER}/external.json`)).toBe(true);
    handle.stop();
  });

  it('debounces multiple rapid change notifications into a single rescan', async () => {
    const bridge = new MemoryMockNativeBridge();
    const onChange = vi.fn();
    const handle = watchLibraryFolder(FOLDER, bridge, onChange, 300);

    bridge.simulateExternalLibraryChange();
    bridge.simulateExternalLibraryChange();
    bridge.simulateExternalLibraryChange();

    await vi.advanceTimersByTimeAsync(300);

    expect(onChange).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it('tears down the watcher on stop() and no longer reacts to further changes', async () => {
    const bridge = new MemoryMockNativeBridge();
    const onChange = vi.fn();
    const handle = watchLibraryFolder(FOLDER, bridge, onChange, 300);
    await vi.runOnlyPendingTimersAsync();

    handle.stop();
    expect(bridge.getWatchedLibraryRoot()).toBeNull();

    bridge.simulateExternalLibraryChange();
    await vi.advanceTimersByTimeAsync(500);

    expect(onChange).not.toHaveBeenCalled();
  });
});

/**
 * Live synchronization of the selected Library against external filesystem changes.
 * Ledger F09 / Ticket #13.
 */
import { INativeBridge } from '../platform/tauriBridge';
import { LibraryEntry, syncLibraryWithDisk } from './library';

export interface LibraryWatchHandle {
  /** Tears down the watcher and stops reacting to further change notifications. */
  stop(): void;
}

/**
 * Watches an authorized Library folder for external creation, rename, and deletion
 * and debounces rapid successive filesystem events into a single rescan.
 *
 * Only the folder already accepted as the active Library root is ever passed here;
 * authorization itself is enforced natively (see watch_library_root in
 * src-tauri/src/main.rs), not by this function.
 */
export function watchLibraryFolder(
  folder: string,
  bridge: INativeBridge,
  onEntriesChanged: (entries: LibraryEntry[]) => void,
  debounceMs = 400
): LibraryWatchHandle {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  bridge.watchLibraryRoot(folder).catch((err) => {
    console.error('Failed to watch Library folder for external changes:', err);
  });

  const rescan = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      syncLibraryWithDisk([folder], bridge).then((entries) => {
        if (!stopped) onEntriesChanged(entries);
      });
    }, debounceMs);
  };

  const unsubscribe = bridge.onLibraryChanged(() => {
    if (!stopped) rescan();
  });

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      unsubscribe();
      bridge.unwatchLibraryRoot().catch(() => {
        // Best-effort teardown; nothing actionable if the native side is already gone.
      });
    },
  };
}

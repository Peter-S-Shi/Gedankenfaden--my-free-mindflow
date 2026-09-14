/**
 * Distinguishes a normal native window close from a recoverable interruption.
 * Ledger F10 / Ticket #14.
 *
 * Without this, closing the app window (clicking the OS close button, Alt+F4,
 * etc.) never ran any unload logic, so the session journal was left with
 * `isCleanShutdown: false` and the next launch showed a false crash-recovery
 * prompt even though the user closed normally.
 */
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getNativeBridge, isRunningInTauri } from './tauriBridge';

export interface CloseGuardDeps {
  /** Flushes any pending debounced autosave so the close does not silently drop it. */
  flushPendingAutosave: () => Promise<void>;
  /** Marks the session journal clean, exactly as navigating back to the Library does. */
  markClean: () => Promise<void>;
}

/**
 * Intercepts the native window close request, runs the same flush + mark-clean
 * sequence a normal "back to Library" navigation performs, then truly terminates
 * the native application process via Rust `app.exit(0)` (releasing the terminal
 * and ending the app lifecycle). A genuine crash, kill, or power loss never reaches
 * this handler, so the journal is left dirty and recovery on relaunch is preserved.
 *
 * No-op outside Tauri (browser/test environments). Returns an unregister function.
 */
export function registerNativeCloseGuard(deps: CloseGuardDeps): () => void {
  if (!isRunningInTauri()) {
    return () => {};
  }

  let unlisten: (() => void) | null = null;
  let cancelled = false;

  const appWindow = getCurrentWindow();
  appWindow
    .onCloseRequested(async (event) => {
      event.preventDefault();
      try {
        await deps.flushPendingAutosave();
        await deps.markClean();
      } finally {
        const bridge = getNativeBridge();
        await bridge.closeAppWindow();
      }
    })
    .then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

  return () => {
    cancelled = true;
    if (unlisten) unlisten();
  };
}

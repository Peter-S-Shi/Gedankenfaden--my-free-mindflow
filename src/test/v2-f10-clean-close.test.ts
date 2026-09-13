/**
 * Ticket #14 / Ledger F10 — Distinguish a normal native window close from a
 * recoverable interruption.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const onCloseRequested = vi.fn();
const destroy = vi.fn(async () => {});
const getCurrentWindow = vi.fn(() => ({ onCloseRequested, destroy }));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => getCurrentWindow(),
}));

import { registerNativeCloseGuard } from '../platform/nativeCloseGuard';

describe('Ticket #14 (F10): native close guard', () => {
  beforeEach(() => {
    onCloseRequested.mockReset();
    destroy.mockClear();
    getCurrentWindow.mockClear();
  });

  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('does nothing outside a Tauri runtime (no window global)', () => {
    const unregister = registerNativeCloseGuard({
      flushPendingAutosave: vi.fn(async () => {}),
      markClean: vi.fn(async () => {}),
    });

    expect(getCurrentWindow).not.toHaveBeenCalled();
    expect(typeof unregister).toBe('function');
    unregister();
  });

  it('flushes pending autosave, marks the session clean, then destroys the window on close', async () => {
    (globalThis as any).window = { __TAURI_INTERNALS__: {} };
    let capturedHandler: ((event: { preventDefault: () => void }) => Promise<void>) | null = null;
    onCloseRequested.mockImplementation(async (handler: any) => {
      capturedHandler = handler;
      return () => {};
    });

    const flushPendingAutosave = vi.fn(async () => {});
    const markClean = vi.fn(async () => {});
    registerNativeCloseGuard({ flushPendingAutosave, markClean });

    // Let the async .then((fn) => unlisten = fn) settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(capturedHandler).not.toBeNull();

    const preventDefault = vi.fn();
    await capturedHandler!({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(flushPendingAutosave).toHaveBeenCalledTimes(1);
    expect(markClean).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    // Flush and mark-clean must complete before the window is actually destroyed,
    // otherwise a close could race the write and still leave the journal dirty.
    const flushOrder = flushPendingAutosave.mock.invocationCallOrder[0];
    const markOrder = markClean.mock.invocationCallOrder[0];
    const destroyOrder = destroy.mock.invocationCallOrder[0];
    expect(flushOrder).toBeLessThan(destroyOrder);
    expect(markOrder).toBeLessThan(destroyOrder);
  });

  it('still destroys the window even if marking the session clean throws', async () => {
    (globalThis as any).window = { __TAURI_INTERNALS__: {} };
    let capturedHandler: ((event: { preventDefault: () => void }) => Promise<void>) | null = null;
    onCloseRequested.mockImplementation(async (handler: any) => {
      capturedHandler = handler;
      return () => {};
    });

    const flushPendingAutosave = vi.fn(async () => {});
    const markClean = vi.fn(async () => {
      throw new Error('journal write failed');
    });
    registerNativeCloseGuard({ flushPendingAutosave, markClean });
    await Promise.resolve();
    await Promise.resolve();

    await expect(capturedHandler!({ preventDefault: vi.fn() })).rejects.toThrow();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('unregistering before the listener attaches immediately unlistens', async () => {
    (globalThis as any).window = { __TAURI_INTERNALS__: {} };
    const unlistenFn = vi.fn();
    onCloseRequested.mockImplementation(async () => unlistenFn);

    const unregister = registerNativeCloseGuard({
      flushPendingAutosave: vi.fn(async () => {}),
      markClean: vi.fn(async () => {}),
    });
    unregister();

    await Promise.resolve();
    await Promise.resolve();

    expect(unlistenFn).toHaveBeenCalledTimes(1);
  });
});

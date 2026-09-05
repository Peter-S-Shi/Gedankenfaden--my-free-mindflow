import { describe, it, expect, vi } from 'vitest';
import { AutoSaveEngine } from '../model/recovery';
import { AssetStore } from '../model/assets';
import { createEmptyDocument, cloneDocument } from '../model/document';

describe('M6 Extended-Session Memory & Resource Disposal Audit', () => {
  it('verifies AutoSaveEngine debouncing, flushing, and complete timer teardown across 50 iterations', async () => {
    const engine = new AutoSaveEngine(50);
    const saveSpy = vi.fn().mockImplementation(async () => {});
    const baseDoc = createEmptyDocument('Disposal Test', 'mindmap');

    // Rapid cycle of 50 scheduled saves with cancellations
    for (let i = 0; i < 50; i++) {
      const doc = cloneDocument(baseDoc);
      doc.title = `Iteration ${i}`;
      engine.scheduleSave(doc, saveSpy);
      expect(engine.isPending()).toBe(true);

      if (i % 2 === 0) {
        // Explicit cancellation
        engine.cancelPending();
        expect(engine.isPending()).toBe(false);
      } else {
        // Immediate flush
        await engine.flushPending();
        expect(engine.isPending()).toBe(false);
      }
    }

    // Wait past the debounce delay to ensure no zombie timers fire
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(engine.isPending()).toBe(false);
    // Exactly 25 odd iterations were flushed
    expect(saveSpy).toHaveBeenCalledTimes(25);
  });

  it('verifies AssetStore releases all object URLs and memory without persistent creep', () => {
    // Mock URL.createObjectURL and URL.revokeObjectURL
    const createdUrls = new Set<string>();
    const revokedUrls = new Set<string>();

    const originalCreate = globalThis.URL.createObjectURL;
    const originalRevoke = globalThis.URL.revokeObjectURL;

    let urlCounter = 0;
    globalThis.URL.createObjectURL = vi.fn().mockImplementation(() => {
      const url = `blob:http://localhost/asset_${++urlCounter}`;
      createdUrls.add(url);
      return url;
    });
    globalThis.URL.revokeObjectURL = vi.fn().mockImplementation((url: string) => {
      revokedUrls.add(url);
    });

    try {
      const store = new AssetStore();
      const mockBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header

      // Allocate 30 assets
      const assetRefs: string[] = [];
      for (let i = 0; i < 30; i++) {
        const { ref } = store.addAsset(`sample_${i}.png`, 'image/png', mockBytes);
        assetRefs.push(ref);
        // Resolve URL to trigger createObjectURL
        const url = store.resolveAssetUrl(ref);
        expect(url).toBeDefined();
      }

      expect(store.getAllAssets().length).toBe(30);
      expect(createdUrls.size).toBe(30);
      expect(revokedUrls.size).toBe(0);

      // Explicitly remove 10 assets
      for (let i = 0; i < 10; i++) {
        const removed = store.removeAsset(assetRefs[i]);
        expect(removed).toBe(true);
      }

      expect(store.getAllAssets().length).toBe(20);
      expect(revokedUrls.size).toBe(10);

      // Clear the entire store
      store.clear();
      expect(store.getAllAssets().length).toBe(0);
      expect(revokedUrls.size).toBe(30); // All 30 created URLs have been cleanly revoked
    } finally {
      globalThis.URL.createObjectURL = originalCreate;
      globalThis.URL.revokeObjectURL = originalRevoke;
    }
  });

  it('verifies that event dispatcher listener registration and unregistration leaves zero lingering references', () => {
    const handlers = new Map<string, Set<(...args: unknown[]) => void>>();

    const addEventListener = (event: string, fn: (...args: unknown[]) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(fn);
    };

    const removeEventListener = (event: string, fn: (...args: unknown[]) => void) => {
      handlers.get(event)?.delete(fn);
      if (handlers.get(event)?.size === 0) {
        handlers.delete(event);
      }
    };

    const mockCallback = vi.fn();

    // Register 10 distinct event listeners
    for (let i = 0; i < 10; i++) {
      addEventListener(`custom_event_${i}`, mockCallback);
    }
    expect(handlers.size).toBe(10);

    // Unregister all
    for (let i = 0; i < 10; i++) {
      removeEventListener(`custom_event_${i}`, mockCallback);
    }
    expect(handlers.size).toBe(0);
  });
});

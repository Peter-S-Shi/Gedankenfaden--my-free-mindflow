/**
 * Ticket #12 / Ledger F13 — Native filesystem authorization boundary.
 *
 * The Rust-side authorization logic (app-owned roots, dialog-authorized Library
 * root, and one-off dialog-authorized files vs. arbitrary rejected paths) is
 * unit-tested directly in src-tauri/src/main.rs (`cargo test`), since that is
 * where the actual security boundary lives — the JS bridge is a thin IPC
 * wrapper with no enforcement of its own.
 *
 * This file covers the renderer-side seam: the bridge interface contract for
 * `getPersistedLibraryRoot`, which lets the active Library folder survive an
 * app restart without the renderer being able to grant itself access to an
 * arbitrary path (only a value the Rust side previously authorized via a
 * dialog is ever returned).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryMockNativeBridge, resetNativeBridge } from '../platform/tauriBridge';

describe('Ticket #12 (F13): persisted Library root bridge contract', () => {
  beforeEach(() => {
    resetNativeBridge();
  });

  afterEach(() => {
    resetNativeBridge();
  });

  it('defaults to no persisted root when the user has never changed folders', async () => {
    const bridge = new MemoryMockNativeBridge();
    expect(await bridge.getPersistedLibraryRoot()).toBeNull();
  });

  it('returns the previously dialog-authorized Library root once set', async () => {
    const bridge = new MemoryMockNativeBridge();
    bridge.simulatePersistedLibraryRoot('D:/CustomWorkspaces/MyMaps');
    expect(await bridge.getPersistedLibraryRoot()).toBe('D:/CustomWorkspaces/MyMaps');
  });
});

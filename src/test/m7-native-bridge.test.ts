import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isRunningInTauri,
  getNativeBridge,
  setNativeBridge,
  resetNativeBridge,
  MemoryMockNativeBridge,
} from '../platform/tauriBridge';

describe('Milestone 7: Platform Native Bridge Abstraction & Windows Integration', () => {
  beforeEach(() => {
    resetNativeBridge();
  });

  afterEach(() => {
    resetNativeBridge();
  });

  it('detects runtime environment accurately', () => {
    // In Node / Vitest test runner
    expect(isRunningInTauri()).toBe(false);

    // Mock presence of Tauri internals
    (globalThis as any).window = {
      __TAURI_INTERNALS__: {},
    };
    expect(isRunningInTauri()).toBe(true);

    // Clean up
    delete (globalThis as any).window;
  });

  it('automatically falls back to MemoryMockNativeBridge in browser/test environment', () => {
    const bridge = getNativeBridge();
    expect(bridge).toBeInstanceOf(MemoryMockNativeBridge);
    expect(bridge.isTauri()).toBe(false);
  });

  it('allows overriding active bridge with setNativeBridge', () => {
    const customBridge = new MemoryMockNativeBridge();
    setNativeBridge(customBridge);
    expect(getNativeBridge()).toBe(customBridge);
  });

  it('provides platform directories for app data and documents', async () => {
    const bridge = new MemoryMockNativeBridge();
    const appData = await bridge.getAppDataDir();
    const docs = await bridge.getDefaultDocumentsDir();

    expect(appData).toContain('AppData');
    expect(appData).toContain('Gedankenfaden');
    expect(docs).toContain('Documents');
    expect(docs).toContain('Gedankenfaden');
  });

  it('performs atomic text and binary file operations accurately', async () => {
    const bridge = new MemoryMockNativeBridge();
    const testPath = 'C:/Users/test/Documents/Gedankenfaden/test.txt';
    const binPath = 'C:/Users/test/Documents/Gedankenfaden/test.bin';

    expect(await bridge.exists(testPath)).toBe(false);

    // Text write & read
    await bridge.writeTextFile(testPath, 'Hello Gedankenfaden M7');
    expect(await bridge.exists(testPath)).toBe(true);
    const content = await bridge.readTextFile(testPath);
    expect(content).toBe('Hello Gedankenfaden M7');

    // Binary write & read
    const binData = new Uint8Array([0x47, 0x45, 0x44, 0x41, 0x4e, 0x4b]);
    await bridge.writeBinaryFile(binPath, binData);
    expect(await bridge.exists(binPath)).toBe(true);
    const readBin = await bridge.readBinaryFile(binPath);
    expect(readBin).toEqual(binData);

    // Rename
    const renamedPath = 'C:/Users/test/Documents/Gedankenfaden/renamed.txt';
    await bridge.rename(testPath, renamedPath);
    expect(await bridge.exists(testPath)).toBe(false);
    expect(await bridge.exists(renamedPath)).toBe(true);

    // Remove
    await bridge.removeFile(renamedPath);
    expect(await bridge.exists(renamedPath)).toBe(false);
  });

  it('supports directory traversal via readDir', async () => {
    const bridge = new MemoryMockNativeBridge();
    const folder = 'C:/Users/test/Documents/Gedankenfaden';

    await bridge.writeTextFile(`${folder}/doc1.mflow`, 'data1');
    await bridge.writeTextFile(`${folder}/doc2.json`, '{"test": true}');
    await bridge.writeTextFile(`${folder}/subfolder/doc3.mflow`, 'data3');

    const entries = await bridge.readDir(folder);
    expect(entries.length).toBeGreaterThanOrEqual(2);

    const names = entries.map((e) => e.name);
    expect(names).toContain('doc1.mflow');
    expect(names).toContain('doc2.json');
  });

  it('implements safe trash / recycle bin semantics (non-destructive deletion)', async () => {
    const bridge = new MemoryMockNativeBridge();
    const docPath = 'C:/Users/test/Documents/Gedankenfaden/important.mflow';

    await bridge.writeTextFile(docPath, 'vital document contents');
    expect(await bridge.exists(docPath)).toBe(true);

    // Send to trash
    await bridge.trashFile(docPath);
    expect(await bridge.exists(docPath)).toBe(false);

    // Reading trashed file throws
    await expect(bridge.readTextFile(docPath)).rejects.toThrow('File not found');

    // Trashing non-existent file does not throw
    await expect(bridge.trashFile('C:/nonexistent.mflow')).resolves.toBeUndefined();
  });

  it('supports simulated CLI open file and file picker dialogs', async () => {
    const bridge = new MemoryMockNativeBridge();

    expect(await bridge.getCliOpenFile()).toBeNull();
    bridge.simulateCliOpenFile('C:/Users/test/Documents/external.mflow');
    expect(await bridge.getCliOpenFile()).toBe('C:/Users/test/Documents/external.mflow');

    bridge.simulatePickedFolder('D:/CustomWorkspaces');
    expect(await bridge.pickFolder()).toBe('D:/CustomWorkspaces');

    bridge.simulatePickedDocumentFile('D:/CustomWorkspaces/imported.mflow');
    expect(await bridge.pickDocumentFile()).toBe('D:/CustomWorkspaces/imported.mflow');
  });
});

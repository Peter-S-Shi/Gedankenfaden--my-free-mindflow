import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createEmptyDocument, serializeDocument, deserializeDocument } from '../model/document';

describe('Proof Track C: Desktop & Local-First Feasibility', () => {
  it('determines a stable local application data path on Windows', () => {
    // Windows AppData or user home directory
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const localAppDir = path.join(appData, 'Gedankenfaden');

    expect(localAppDir).toBeDefined();
    expect(localAppDir).toContain('Gedankenfaden');
  });

  it('proves local filesystem read/write for canonical documents', () => {
    const testDir = path.join(os.tmpdir(), 'gedankenfaden_desktop_probe');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const testFile = path.join(testDir, 'sample_canonical.json');
    const originalDoc = createEmptyDocument('Desktop Storage Probe', 'mindmap');
    originalDoc.nodes.push({
      id: 'probe_child',
      text: 'Verified on Windows FS',
      geometry: { x: 550, y: 300, width: 160, height: 44 },
      parentId: originalDoc.nodes[0].id,
    });
    originalDoc.edges.push({
      id: 'probe_edge',
      source: originalDoc.nodes[0].id,
      target: 'probe_child',
    });

    // Write file locally
    const serialized = serializeDocument(originalDoc);
    fs.writeFileSync(testFile, serialized, 'utf-8');
    expect(fs.existsSync(testFile)).toBe(true);

    // Read back and verify schema
    const readContent = fs.readFileSync(testFile, 'utf-8');
    const reopenedDoc = deserializeDocument(readContent);

    expect(reopenedDoc.id).toBe(originalDoc.id);
    expect(reopenedDoc.title).toBe('Desktop Storage Probe');
    expect(reopenedDoc.nodes.length).toBe(2);
    expect(reopenedDoc.nodes[1].text).toBe('Verified on Windows FS');

    // Cleanup probe
    fs.unlinkSync(testFile);
    fs.rmdirSync(testDir);
  });
});

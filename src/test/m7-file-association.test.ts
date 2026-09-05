import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryMockNativeBridge } from '../platform/tauriBridge';
import { loadDocumentFromFile } from '../model/library';
import { packageDocumentToMflow } from '../model/container';
import { createEmptyDocument } from '../model/document';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Milestone 7: .mflow Windows File Association & Cold-Start Document Loading', () => {
  it('declares .mflow file association in tauri.conf.json bundle configuration', () => {
    const tauriConfPath = path.resolve(__dirname, '../../src-tauri/tauri.conf.json');
    expect(fs.existsSync(tauriConfPath)).toBe(true);

    const raw = fs.readFileSync(tauriConfPath, 'utf-8');
    const conf = JSON.parse(raw);

    const associations = conf?.bundle?.fileAssociations;
    expect(Array.isArray(associations)).toBe(true);
    expect(associations.length).toBeGreaterThanOrEqual(1);

    const mflowAssoc = associations.find((a: any) =>
      Array.isArray(a.ext) && a.ext.includes('mflow')
    );
    expect(mflowAssoc).toBeDefined();
    expect(mflowAssoc.role).toBe('Editor');
    expect(mflowAssoc.mimeType).toBe('application/x-gedankenfaden-mflow');
  });

  it('unpacks and projects real .mflow container passed via Windows Explorer CLI argument', async () => {
    const bridge = new MemoryMockNativeBridge();

    // Create a rich mindmap document with nodes and edges
    const originalDoc = createEmptyDocument('CLI Opened Architecture Map', 'mindmap');
    originalDoc.nodes.push(
      {
        id: 'node_1',
        text: 'Native Windows Bridge',
        geometry: { x: 200, y: 150, width: 180, height: 48 },
      },
      {
        id: 'node_2',
        text: 'File Association Handler',
        geometry: { x: 440, y: 150, width: 200, height: 48 },
      }
    );
    originalDoc.edges.push({
      id: 'edge_1',
      source: 'node_1',
      target: 'node_2',
      label: 'Invokes',
    });

    // Package to binary .mflow container
    const mflowBytes = await packageDocumentToMflow(originalDoc);
    const cliFilePath = 'C:/Users/test/Documents/Gedankenfaden/cli_opened.mflow';
    await bridge.writeBinaryFile(cliFilePath, mflowBytes);

    // Simulate Windows passing the clicked file as a CLI parameter
    bridge.simulateCliOpenFile(cliFilePath);
    const detectedPath = await bridge.getCliOpenFile();
    expect(detectedPath).toBe(cliFilePath);

    // Load document from file path
    const loadedDoc = await loadDocumentFromFile(detectedPath!, bridge);
    expect(loadedDoc).not.toBeNull();
    expect(loadedDoc?.id).toBe(originalDoc.id);
    expect(loadedDoc?.title).toBe('CLI Opened Architecture Map');
    expect(loadedDoc?.mode).toBe('mindmap');
    expect(loadedDoc?.nodes.length).toBe(originalDoc.nodes.length);
    expect(loadedDoc?.edges.length).toBe(originalDoc.edges.length);
    expect(loadedDoc?.edges[0].label).toBe('Invokes');
  });

  it('gracefully handles corrupted .mflow binary files without throwing', async () => {
    const bridge = new MemoryMockNativeBridge();
    const corruptPath = 'C:/Users/test/Documents/corrupt.mflow';

    // Write non-zip corrupt binary garbage
    const garbageBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22]);
    await bridge.writeBinaryFile(corruptPath, garbageBytes);

    const result = await loadDocumentFromFile(corruptPath, bridge);
    expect(result).toBeNull();
  });

  it('loads legacy/direct .json document passed via CLI argument', async () => {
    const bridge = new MemoryMockNativeBridge();
    const jsonDoc = createEmptyDocument('CLI JSON Pipeline', 'flowchart');
    const jsonPath = 'C:/Users/test/Documents/external_pipeline.json';

    await bridge.writeTextFile(jsonPath, JSON.stringify(jsonDoc, null, 2));
    bridge.simulateCliOpenFile(jsonPath);

    const detectedPath = await bridge.getCliOpenFile();
    expect(detectedPath).toBe(jsonPath);

    const loaded = await loadDocumentFromFile(detectedPath!, bridge);
    expect(loaded).not.toBeNull();
    expect(loaded?.title).toBe('CLI JSON Pipeline');
    expect(loaded?.mode).toBe('flowchart');
  });
});

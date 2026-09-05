import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { planCanvasDeletion } from '../model/deletion';
import { MemoryMockNativeBridge } from '../platform/tauriBridge';
import { createExportArtifact, saveExportWithNativeDialog } from '../export/saveExport';
import { importDocumentIntoLibrary, loadDocumentFromFile } from '../model/library';
import { readFileSync } from 'node:fs';

const ACCEPTANCE_MARKDOWN = `# M7 Mind Map Acceptance Sample

## Discover
### Problem
- Friction points
- Evidence quality
### Audience
- Primary users
- Edge users
### Constraints
- Local-first
- Offline capable

## Design
### Structure
- Hierarchy
- Cross-links
### Interaction
- Keyboard-first
- Motion feedback
### Visual Language
- Quiet interface
- Strong focus

## Deliver
### Prototype
- Build
- Iterate
### Verify
- Import
- Save and reopen
- Export
### Release
- Package
- Accept`;

describe('M7-B Corrective Round 1', () => {
  it('plans context-aware subtree and root clearing confirmations without mutating the document', () => {
    const doc = createEmptyDocument('Delete confirmation', 'mindmap');
    const root = doc.nodes[0];
    doc.nodes.push(
      { id: 'branch', text: 'Branch', parentId: root.id, geometry: { x: 1, y: 1 } },
      { id: 'leaf', text: 'Leaf', parentId: 'branch', geometry: { x: 2, y: 2 } }
    );
    const before = JSON.stringify(doc);

    expect(planCanvasDeletion(doc, 'branch')).toMatchObject({
      kind: 'delete-subtree',
      nodeIds: ['branch', 'leaf'],
      title: 'Delete subtree with 2 nodes?',
    });
    expect(planCanvasDeletion(doc, root.id)).toMatchObject({
      kind: 'clear-root-branches',
      nodeIds: ['branch', 'leaf'],
    });
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('imports the exact Markdown acceptance sample through native bridge into an owned mflow and reopens it', async () => {
    const bridge = new MemoryMockNativeBridge({ '/incoming/acceptance.md': ACCEPTANCE_MARKDOWN });
    const imported = await importDocumentIntoLibrary('/incoming/acceptance.md', '/documents', bridge, 'fixed');

    expect(imported?.document.title).toBe('M7 Mind Map Acceptance Sample');
    expect(imported?.filePath).toBe('/documents/m7_mind_map_acceptance_sample_fixed.mflow');
    expect(await bridge.exists(imported!.filePath)).toBe(true);
    const rootChildren = imported!.document.nodes
      .filter((node) => node.parentId === imported!.document.nodes[0].id)
      .map((node) => node.text);
    expect(rootChildren).toEqual(['Discover', 'Design', 'Deliver']);

    const reopened = await loadDocumentFromFile(imported!.filePath, bridge);
    expect(reopened?.title).toBe('M7 Mind Map Acceptance Sample');
    expect(reopened?.nodes.some((node) => node.text === 'Save and reopen')).toBe(true);
  });

  it('regression-tests adjacent OPML native import and owned mflow creation', async () => {
    const opml = '<?xml version="1.0"?><opml version="2.0"><head><title>OPML Gate</title></head><body><outline text="Discover"><outline text="Evidence"/></outline></body></opml>';
    const bridge = new MemoryMockNativeBridge({ '/incoming/gate.opml': opml });
    const imported = await importDocumentIntoLibrary('/incoming/gate.opml', '/documents', bridge, 'fixed');
    expect(imported?.document.title).toBe('OPML Gate');
    expect(imported?.document.nodes.some((node) => node.text === 'Evidence')).toBe(true);
    expect(await bridge.exists(imported!.filePath)).toBe(true);
  });

  it('uses native Save As for text and binary exports and treats cancel as a no-op', async () => {
    const doc = createEmptyDocument('Export Gate', 'flowchart');
    const bridge = new MemoryMockNativeBridge();

    bridge.simulatePickedExportFile('/documents/export-gate.json');
    const text = await createExportArtifact(doc, 'json');
    expect(await saveExportWithNativeDialog(text, bridge)).toEqual({ status: 'saved', path: '/documents/export-gate.json' });
    expect(await bridge.readTextFile('/documents/export-gate.json')).toContain('Export Gate');

    bridge.simulatePickedExportFile('/documents/export-gate.pdf');
    const binary = await createExportArtifact(doc, 'pdf');
    expect(await saveExportWithNativeDialog(binary, bridge)).toEqual({ status: 'saved', path: '/documents/export-gate.pdf' });
    expect((await bridge.readBinaryFile('/documents/export-gate.pdf')).slice(0, 4)).toEqual(new Uint8Array([37, 80, 68, 70]));

    bridge.simulatePickedExportFile(null);
    expect(await saveExportWithNativeDialog(text, bridge)).toEqual({ status: 'cancelled' });
  });

  it('keeps group overlays inside the React Flow viewport transform and responsive chrome contracts', () => {
    const canvasSource = readFileSync(new URL('../components/CanvasEditor.tsx', import.meta.url), 'utf8');
    const librarySource = readFileSync(new URL('../components/LibraryHome.tsx', import.meta.url), 'utf8');
    expect(canvasSource).toContain('<ViewportPortal>');
    expect(canvasSource).toContain('pointer-events-none');
    expect(canvasSource).toContain('flex flex-wrap items-center justify-end');
    expect(librarySource).toContain('grid-cols-1 md:grid-cols-2 xl:grid-cols-3');
    expect(librarySource).toContain('.markdown, .opml');
  });

  it('isolates native smoke AppData and guarantees cleanup on failure', () => {
    const smokeSource = readFileSync(new URL('../../scripts/verify-smoke-native.mjs', import.meta.url), 'utf8');
    expect(smokeSource).toContain('WEBVIEW2_USER_DATA_FOLDER');
    expect(smokeSource).toContain('APPDATA: isolatedAppDataDir');
    expect(smokeSource).toContain('cleanupSmokeState();');
    expect(smokeSource).toContain("invoke('plugin:window|close'");
    expect(smokeSource).not.toContain("child.kill('SIGTERM')");
    expect(smokeSource).not.toContain("special-cases the string");
  });
});

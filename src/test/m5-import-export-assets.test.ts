import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { CanonicalDocument } from '../model/types';
import { importFromMarkdown, importFromOPML } from '../model/importers';
import {
  exportToJSON,
  exportToSVG,
  exportToPNG,
  exportToJPEG,
  exportToPDF,
  exportToMarkdown,
  exportToHTML,
  exportToMermaid,
  exportToOPML,
  exportToLegacyMindMapXML,
  exportToJSONCanvas,
} from '../export/exporter';
import { packageDocumentToMflow, parseMflowFromBytes } from '../model/container';
import { AssetStore } from '../model/assets';

describe('Milestone 5: Structured Importers (Markdown & OPML)', () => {
  it('imports hierarchical Markdown headings and indented list items into a canonical tree', () => {
    const mdContent = `
# Cognitive Framework
## Core Foundations
### Working Memory
- Visual buffer
- Auditory loop
## Executive Functions
- Task switching
- Inhibition control
`;

    const doc = importFromMarkdown(mdContent, 'Cognitive Framework');
    expect(doc.title).toBe('Cognitive Framework');
    expect(doc.nodes.length).toBeGreaterThanOrEqual(7);

    const rootNode = doc.nodes.find((n) => n.type === 'root');
    expect(rootNode).toBeDefined();
    expect(rootNode?.text).toBe('Cognitive Framework');

    // Verify parent-child edge connections
    expect(doc.edges.length).toBe(doc.nodes.length - 1);
  });

  it('imports standard OPML 2.0 outlines into a canonical tree', () => {
    const opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Product Feature Tree</title>
  </head>
  <body>
    <outline text="Design Principles">
      <outline text="Local-First Storage" />
      <outline text="Keyboard-First Velocity" />
    </outline>
    <outline text="Supported Platforms">
      <outline text="Windows Desktop" />
    </outline>
  </body>
</opml>`;

    const doc = importFromOPML(opmlContent);
    expect(doc.title).toBe('Product Feature Tree');
    expect(doc.nodes.length).toBe(6); // Root + 2 top-level + 3 leaves

    const designNode = doc.nodes.find((n) => n.text === 'Design Principles');
    expect(designNode).toBeDefined();

    const localFirstNode = doc.nodes.find((n) => n.text === 'Local-First Storage');
    expect(localFirstNode).toBeDefined();
    expect(localFirstNode?.parentId).toBe(designNode?.id);
  });
});

describe('Milestone 5: Multi-Format Exporter Suite (11 Formats)', () => {
  function getSampleDoc(): CanonicalDocument {
    const doc = createEmptyDocument('System Design Overview', 'flowchart');
    doc.nodes = [
      { id: 'node_1', text: 'Client Request', type: 'terminal', geometry: { x: 100, y: 100 } },
      { id: 'node_2', text: 'Auth Check', type: 'decision', geometry: { x: 100, y: 220 } },
      { id: 'node_3', text: 'Dispatch Worker', type: 'process', geometry: { x: 300, y: 220 } },
    ];
    doc.edges = [
      { id: 'edge_1', source: 'node_1', target: 'node_2' },
      { id: 'edge_2', source: 'node_2', target: 'node_3', label: 'Granted' },
    ];
    return doc;
  }

  it('1. exports valid canonical JSON', () => {
    const doc = getSampleDoc();
    const json = exportToJSON(doc);
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe(doc.id);
    expect(parsed.nodes.length).toBe(3);
  });

  it('2. exports vector SVG', () => {
    const doc = getSampleDoc();
    const svg = exportToSVG(doc);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Client Request');
    expect(svg).toContain('</svg>');
  });

  it('3. exports raster PNG bytes with valid magic header', async () => {
    const doc = getSampleDoc();
    const png = await exportToPNG(doc);
    expect(png.length).toBeGreaterThan(8);
    // PNG Magic bytes: 0x89 0x50 0x4E 0x47
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });

  it('4. exports raster JPEG bytes with valid magic header', async () => {
    const doc = getSampleDoc();
    const jpeg = await exportToJPEG(doc);
    expect(jpeg.length).toBeGreaterThan(4);
    // JPEG Magic bytes: 0xFF 0xD8
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
  });

  it('5. exports standard PDF 1.4 document bytes', async () => {
    const doc = getSampleDoc();
    const pdf = await exportToPDF(doc);
    const header = new TextDecoder().decode(pdf.slice(0, 8));
    expect(header).toContain('%PDF-1.4');
  });

  it('6. exports Markdown outline format', () => {
    const doc = getSampleDoc();
    const md = exportToMarkdown(doc);
    expect(md).toContain('# System Design Overview');
    expect(md).toContain('Client Request');
  });

  it('7. exports standalone viewable HTML report', () => {
    const doc = getSampleDoc();
    const html = exportToHTML(doc);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>System Design Overview</title>');
    expect(html).toContain('<svg');
  });

  it('8. exports Mermaid diagram syntax', () => {
    const doc = getSampleDoc();
    const mmd = exportToMermaid(doc);
    expect(mmd).toContain('graph TD');
    expect(mmd).toContain('node_1');
    expect(mmd).toContain('node_2');
    expect(mmd).toContain('-->|"Granted"|');
  });

  it('9. exports OPML 2.0 outline XML', () => {
    const doc = getSampleDoc();
    const opml = exportToOPML(doc);
    expect(opml).toContain('<opml version="2.0">');
    expect(opml).toContain('<title>System Design Overview</title>');
    expect(opml).toContain('<outline text="Client Request"');
  });

  it('10. exports Legacy Mind-Map XML (.mm)', () => {
    const doc = getSampleDoc();
    const mm = exportToLegacyMindMapXML(doc);
    expect(mm).toContain('<map version="1.0.1">');
    expect(mm).toContain('<node ID="node_1" TEXT="Client Request"');
    expect(mm).toContain('</map>');
  });

  it('11. exports open format JSON Canvas (.canvas)', () => {
    const doc = getSampleDoc();
    const canvasJson = exportToJSONCanvas(doc);
    const parsed = JSON.parse(canvasJson);
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(Array.isArray(parsed.edges)).toBe(true);
    expect(parsed.nodes.length).toBe(3);
    expect(parsed.edges[0].fromNode).toBe('node_1');
    expect(parsed.edges[0].toNode).toBe('node_2');
  });
});

describe('Milestone 5: Node Image Asset Pipeline & Portable Container Packaging', () => {
  it('packages and faithfully extracts embedded image assets in .mflow format', async () => {
    const doc = createEmptyDocument('Image Pipeline Map', 'mindmap');
    const dummyImageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]); // Mock PNG bytes

    const assetStore = new AssetStore();
    const { ref: assetRef } = assetStore.addAsset('diagram_asset.png', 'image/png', dummyImageBytes);

    doc.nodes.push({
      id: 'img_node',
      text: 'Visual Prototype Screenshot',
      geometry: { x: 500, y: 300, width: 220, height: 160 },
      assetRef,
      parentId: doc.nodes[0].id,
    });

    // Package to single-file .mflow
    const packageBytes = await packageDocumentToMflow(doc, assetStore.toBytesMap());
    expect(packageBytes.length).toBeGreaterThan(100);

    // Unpack from bytes
    const unpacked = await parseMflowFromBytes(packageBytes);
    expect(unpacked.document.title).toBe('Image Pipeline Map');
    expect(unpacked.document.nodes.length).toBe(2);

    const unpackedImgNode = unpacked.document.nodes.find((n) => n.id === 'img_node');
    expect(unpackedImgNode?.assetRef).toBe(assetRef);

    // Verify binary asset retained
    const assetFilename = assetRef.replace('asset://', '');
    const recoveredAsset = unpacked.assets.get(assetFilename);
    expect(recoveredAsset).toBeDefined();
    expect(recoveredAsset?.length).toBe(dummyImageBytes.length);
    expect(recoveredAsset?.[0]).toBe(dummyImageBytes[0]);
  });
});

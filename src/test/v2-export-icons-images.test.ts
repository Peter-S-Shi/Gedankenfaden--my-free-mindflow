import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { exportToSVG, exportToHTML, exportToPDF, notoSubsetFor } from '../export/exporter';

// A minimal valid 1x1 red PNG (real PNG magic bytes + IHDR/IDAT/IEND), so
// pdf-lib's embedPng can genuinely decode it in the PDF asset test.
const ONE_PX_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

function onePixelPngBytes(): Uint8Array {
  const binary = atob(ONE_PX_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

describe('Export Closure EX-11: node icons and embedded images in visual exports', () => {
  it('renders a node icon as visible content in SVG', () => {
    const doc = createEmptyDocument('Icon Fixture', 'flowchart');
    doc.nodes = [{ id: 'n1', text: 'Idea', icon: '💡', geometry: { x: 0, y: 0, width: 140, height: 44 } }];
    const svg = exportToSVG(doc);
    expect(svg).toContain('💡');
    expect(svg).toContain('Idea');
  });

  it('does not mutate canonical icon data while exporting', () => {
    const doc = createEmptyDocument('Icon Mutation Fixture', 'flowchart');
    doc.nodes = [{ id: 'n1', text: 'Idea', icon: '💡', geometry: { x: 0, y: 0, width: 140, height: 44 } }];
    exportToSVG(doc);
    expect(doc.nodes[0].icon).toBe('💡');
  });

  it('embeds a resolvable node image as a self-contained data: URI in SVG (no broken asset:// reference)', () => {
    const doc = createEmptyDocument('Image Fixture', 'flowchart');
    doc.nodes = [{ id: 'n1', text: 'With Image', assetRef: 'asset://img_1.png', geometry: { x: 0, y: 0, width: 140, height: 100 } }];
    const assets = new Map<string, Uint8Array>([['img_1.png', onePixelPngBytes()]]);
    const svg = exportToSVG(doc, assets);
    expect(svg).toContain('<image');
    expect(svg).toMatch(/href="data:image\/png;base64,/);
    expect(svg).not.toContain('asset://');
  });

  it('HTML export is self-contained: the embedded SVG carries the same data: URI image, not a broken local reference', () => {
    const doc = createEmptyDocument('HTML Image Fixture', 'flowchart');
    doc.nodes = [{ id: 'n1', text: 'With Image', assetRef: 'asset://img_1.png', geometry: { x: 0, y: 0, width: 140, height: 100 } }];
    const assets = new Map<string, Uint8Array>([['img_1.png', onePixelPngBytes()]]);
    const html = exportToHTML(doc, assets);
    expect(html).toMatch(/href="data:image\/png;base64,/);
  });

  it('a node with a dangling assetRef degrades explicitly (no image element, no crash) rather than crashing export', () => {
    const doc = createEmptyDocument('Dangling Asset Fixture', 'flowchart');
    doc.nodes = [{ id: 'n1', text: 'Dangling', assetRef: 'asset://missing.png', geometry: { x: 0, y: 0, width: 140, height: 100 } }];
    const svg = exportToSVG(doc, new Map());
    expect(svg).not.toContain('<image');
    expect(svg).toContain('Dangling');
  });

  it('PDF export includes the embedded raster image asset as a real PDF XObject (smoke)', async () => {
    const doc = createEmptyDocument('PDF Image Fixture', 'flowchart');
    doc.nodes = [{ id: 'n1', text: 'Photo', assetRef: 'asset://img_1.png', geometry: { x: 0, y: 0, width: 140, height: 100 } }];
    const assets = new Map<string, Uint8Array>([['img_1.png', onePixelPngBytes()]]);
    const pdfBytes = await exportToPDF(doc, assets);
    const pdfText = new TextDecoder('latin1').decode(pdfBytes);
    expect(pdfText).toContain('/Image');
  });

  it('drops only an unsupported glyph (e.g. an emoji icon) from a PDF text run, not the whole label -- ordinary CJK/Latin characters must still resolve to a real embedded font subset', () => {
    // Regression guard for the EX-11 fallback: notoSubsetFor must return
    // null only for genuinely unsupported code points (emoji/pictographs),
    // never for ordinary CJK or Latin text the bundled Noto Sans SC subsets
    // do cover -- otherwise "deterministic drop of an unsupported glyph"
    // would silently regress into "drop of real content".
    expect(notoSubsetFor('人')).not.toBeNull();
    expect(notoSubsetFor('A')).not.toBeNull();
    expect(notoSubsetFor('💡')).toBeNull();
  });
});

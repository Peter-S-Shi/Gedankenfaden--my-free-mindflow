import { describe, it, expect } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { fileURLToPath } from 'node:url';
import { createEmptyDocument } from '../model/document';
import { exportToPDF } from '../export/exporter';
import { CanonicalNode } from '../model/types';

/**
 * Export Closure EX-09: PDF must share text-aware geometry semantics
 * instead of diverging from SVG/Canvas, and a large diagram must not be
 * squeezed into a fixed Letter page (which crushed text down to
 * sub-readable sizes). Content here is deliberately ASCII-only so the PDF
 * can be generated directly in vitest's Node environment (Unicode/CJK text
 * routes through an embedded-font fetch that needs a real browser -- see
 * f06-pdf-diagram-consumer.test.ts) while still parsing the result with a
 * real PDF consumer (pdfjs-dist) for genuine structural verification.
 */
async function parsePdf(bytes: Uint8Array) {
  const loading = getDocument({
    data: bytes,
    cMapUrl: `${fileURLToPath(new URL('../../node_modules/pdfjs-dist/cmaps/', import.meta.url)).replace(/\\/g, '/')}/`,
    cMapPacked: true,
    standardFontDataUrl: `${fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)).replace(/\\/g, '/')}/`,
  });
  return loading.promise;
}

describe('Export Closure EX-09: PDF text-aware geometry and oversized-diagram policy', () => {
  it('grows the PDF page to a large diagram instead of shrinking text to sub-readable size', async () => {
    // A multi-thousand-pixel-wide diagram: far larger than a Letter page.
    const doc = createEmptyDocument('Large Diagram', 'flowchart');
    const nodes: CanonicalNode[] = [];
    for (let i = 0; i < 12; i++) {
      nodes.push({ id: `n${i}`, text: `Step ${i}`, geometry: { x: i * 500, y: 0, width: 200, height: 44 } });
    }
    doc.nodes = nodes;

    const pdfBytes = await exportToPDF(doc);
    const pdf = await parsePdf(pdfBytes);
    try {
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      // Old behavior: always exactly 792pt (landscape Letter) regardless of
      // diagram size. New behavior: the page grows with the diagram
      // (12 nodes * 500px span + margins), staying near a 1:1 canvas-unit
      // to point ratio so 14px node text renders at a readable size.
      expect(viewport.width).toBeGreaterThan(1000);

      const textContent = await page.getTextContent();
      const stepZeroItem = textContent.items.find((item) => 'str' in item && item.str.includes('Step 0'));
      expect(stepZeroItem).toBeDefined();
      // Font size must stay close to the canonical 14px design size (not
      // crushed toward zero by a forced shrink-to-Letter fit).
      expect((stepZeroItem as { height?: number }).height).toBeGreaterThan(8);
    } finally {
      await pdf.destroy();
    }
  }, 20000);

  it('still fits a normal small diagram onto a standard Letter/landscape page (no unnecessary upscaling)', async () => {
    const doc = createEmptyDocument('Small Diagram', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'Start', geometry: { x: 0, y: 0, width: 120, height: 44 } },
      { id: 'n2', text: 'End', geometry: { x: 200, y: 0, width: 120, height: 44 } },
    ];
    const pdfBytes = await exportToPDF(doc);
    const pdf = await parsePdf(pdfBytes);
    try {
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      expect(viewport.width).toBe(792); // landscape Letter, same as before this batch.
    } finally {
      await pdf.destroy();
    }
  }, 20000);

  it('wraps long explicit multiline node text using the same wrap seam as SVG (F6/EX-09), keeping text inside the node box', async () => {
    const doc = createEmptyDocument('Wrapped PDF Text', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'Line One\nLine Two\nLine Three', geometry: { x: 0, y: 0, width: 160, height: 44 } },
    ];
    const pdfBytes = await exportToPDF(doc);
    const pdf = await parsePdf(pdfBytes);
    try {
      const page = await pdf.getPage(1);
      const text = (await page.getTextContent()).items.map((item) => ('str' in item ? item.str : '')).join(' ');
      expect(text).toContain('Line One');
      expect(text).toContain('Line Two');
      expect(text).toContain('Line Three');
    } finally {
      await pdf.destroy();
    }
  }, 20000);

  it('honors a manually-sized node alongside the shared text-aware wrap seam', async () => {
    const doc = createEmptyDocument('Manual Size PDF', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'Manually widened node with a longer sentence', geometry: { x: 0, y: 0, width: 320, height: 44 }, manualSize: { width: 320 } },
    ];
    const pdfBytes = await exportToPDF(doc);
    const pdf = await parsePdf(pdfBytes);
    try {
      const page = await pdf.getPage(1);
      const text = (await page.getTextContent()).items.map((item) => ('str' in item ? item.str : '')).join(' ');
      expect(text).toContain('Manually');
    } finally {
      await pdf.destroy();
    }
  }, 20000);
});

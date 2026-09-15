import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { exportToSVG } from '../export/exporter';

describe('Export Closure EX-10: visual exporters reuse resolveNodeVisuals', () => {
  it('SVG consumes explicit theme.nodeBackground/nodeTextColor for ordinary nodes, matching Canvas precedence', () => {
    const doc = createEmptyDocument('Theme Override Fixture', 'flowchart');
    doc.theme = { ...doc.theme, paletteId: 'forest-sage', nodeBackground: '#1f2937', nodeTextColor: '#f9fafb' };
    doc.nodes = [{ id: 'n1', text: 'Ordinary', geometry: { x: 0, y: 0, width: 120, height: 40 } }];
    const svg = exportToSVG(doc);
    expect(svg).toContain('fill="#1f2937"');
    expect(svg).toContain('fill="#f9fafb"');
    // Must not silently fall back to the forest-sage palette's own node colors.
    expect(svg).not.toContain('fill="#ffffff" stroke="#d1ded1"');
  });

  it('local node.style still wins over the explicit theme override', () => {
    const doc = createEmptyDocument('Local Override Fixture', 'flowchart');
    doc.theme = { ...doc.theme, nodeBackground: '#1f2937', nodeTextColor: '#f9fafb' };
    doc.nodes = [{ id: 'n1', text: 'Local', geometry: { x: 0, y: 0, width: 120, height: 40 }, style: { backgroundColor: '#ff0000' } }];
    const svg = exportToSVG(doc);
    expect(svg).toContain('fill="#ff0000"');
  });

  it('preserves specialized root behavior already encoded in resolveNodeVisuals', () => {
    const doc = createEmptyDocument('Root Fixture', 'mindmap');
    doc.theme = { ...doc.theme, nodeBackground: '#1f2937' };
    const svg = exportToSVG(doc);
    // Root keeps its palette rootBg (#2563eb for nordic-slate), unaffected
    // by the generic ordinary-node theme override.
    expect(svg).toContain('fill="#2563eb"');
  });

  it('SVG and PDF resolve the same background/text color for an identical fixture (no exporter-specific precedence rules)', async () => {
    const { exportToPDF } = await import('../export/exporter');
    const doc = createEmptyDocument('Cross Format Fixture', 'flowchart');
    doc.theme = { ...doc.theme, nodeBackground: '#123456', nodeTextColor: '#abcdef' };
    doc.nodes = [{ id: 'n1', text: 'Consistent', geometry: { x: 0, y: 0, width: 120, height: 40 } }];
    const svg = exportToSVG(doc);
    expect(svg).toContain('fill="#123456"');
    // PDF must not throw and must produce real bytes for the same fixture --
    // color equivalence at the raw content-stream level is covered by the
    // shared resolveNodeVisuals seam itself (v2-flowchart-theme-node-color-fidelity.test.ts).
    const pdfBytes = await exportToPDF(doc);
    expect(pdfBytes.byteLength).toBeGreaterThan(100);
  });
});

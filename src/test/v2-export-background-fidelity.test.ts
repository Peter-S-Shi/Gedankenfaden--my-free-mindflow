import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { exportToSVG } from '../export/exporter';

describe('Export Closure EX-08: canvas background fidelity in visual exports', () => {
  function docWith(canvasBackground: 'blank' | 'dots' | 'grid', canvasBgColor: string) {
    const doc = createEmptyDocument('Background Fixture', 'flowchart');
    doc.theme = { ...doc.theme, canvasBackground, canvasBgColor };
    doc.nodes = [{ id: 'n1', text: 'A', geometry: { x: 0, y: 0, width: 120, height: 40 } }];
    return doc;
  }

  it('renders a dot pattern for canvasBackground "dots"', () => {
    const svg = exportToSVG(docWith('dots', '#f8fafc'));
    expect(svg).toContain('<circle');
    expect(svg).toContain('fill="#f8fafc"');
  });

  it('renders a grid/line pattern for canvasBackground "grid"', () => {
    const svg = exportToSVG(docWith('grid', '#eef2ff'));
    expect(svg).toMatch(/<pattern[^>]*><path/);
    expect(svg).toContain('fill="#eef2ff"');
  });

  it('renders no dot/grid pattern for canvasBackground "blank"', () => {
    const svg = exportToSVG(docWith('blank', '#ffffff'));
    expect(svg).not.toContain('<circle');
    expect(svg).not.toContain('canvas-bg-pattern');
  });

  it('uses the resolved document background color, never the literal pattern keyword, as the actual fill', () => {
    const svg = exportToSVG(docWith('grid', '#101418'));
    expect(svg).toContain('fill="#101418"');
    expect(svg).not.toMatch(/fill="(dots|grid|blank)"/);
  });

  it('non-white canvasBgColor is honored end to end', () => {
    const svg = exportToSVG(docWith('dots', '#0f172a'));
    expect(svg).toContain('fill="#0f172a"');
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveNodeVisuals } from '../model/theme';
import { exportToSVG } from '../export/exporter';
import { createEmptyDocument } from '../model/document';
import { CanonicalNode, DocumentTheme } from '../model/types';

describe('Flowchart PH Bug F10: Font-Family Fidelity', () => {
  const baseTheme: DocumentTheme = {
    paletteId: 'nordic-slate',
    canvasBackground: 'dots',
    fontFamily: 'Georgia, serif',
    defaultEdgeRouting: 'orthogonal',
    name: 'Custom',
  };

  it('document-level theme.fontFamily resolves for a node with no local override', () => {
    const node: CanonicalNode = { id: 'n1', text: 'A', type: 'default', geometry: { x: 0, y: 0, width: 100, height: 40 } };
    const visuals = resolveNodeVisuals(node, baseTheme);
    expect(visuals.fontFamily).toBe('Georgia, serif');
  });

  it('local node.style.fontFamily overrides document theme.fontFamily', () => {
    const node: CanonicalNode = {
      id: 'n1',
      text: 'A',
      type: 'default',
      geometry: { x: 0, y: 0, width: 100, height: 40 },
      style: { fontFamily: '"Courier New", monospace' },
    };
    const visuals = resolveNodeVisuals(node, baseTheme);
    expect(visuals.fontFamily).toBe('"Courier New", monospace');
  });

  it('CustomNode consumes visuals.fontFamily on both the read-only label and the multiline editing control', () => {
    const source = readFileSync(new URL('../components/CustomNode.tsx', import.meta.url), 'utf8');
    const occurrences = (source.match(/fontFamily:\s*visuals\.fontFamily/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('SVG export consumes the resolved canonical font family for node text instead of hardcoding sans-serif', () => {
    const doc = createEmptyDocument('Font Export', 'flowchart');
    doc.theme = { ...doc.theme, fontFamily: 'Georgia, serif' };
    doc.nodes = [
      { id: 'n1', text: 'Themed', type: 'default', geometry: { x: 0, y: 0, width: 140, height: 44 } },
      {
        id: 'n2',
        text: 'Local Override',
        type: 'default',
        geometry: { x: 200, y: 0, width: 140, height: 44 },
        style: { fontFamily: '"Courier New", monospace' },
      },
    ];
    const svg = exportToSVG(doc);
    expect(svg).toContain('font-family="Georgia, serif"');
    expect(svg).toContain('font-family="&quot;Courier New&quot;, monospace"');
  });

  it('a PDF-style bounded universal-font exception is not required to change: SVG export is the style-preserving path under test', () => {
    // No-op sentinel documenting that this ticket does not touch PDF's
    // embedded-font architecture (F10 scope guard).
    expect(true).toBe(true);
  });
});

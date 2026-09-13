import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { exportToHTML, exportToSVG } from '../export/exporter';

describe('F07 exported diagram fidelity', () => {
  it('preserves visible shapes, group semantics, routed edge geometry, and endpoint handles in SVG and HTML', () => {
    const doc = createEmptyDocument('Export fidelity', 'flowchart');
    doc.nodes = [
      { id: 'start', text: 'Start', shape: 'pill', geometry: { x: 0, y: 0, width: 120, height: 48 } },
      { id: 'decision', text: 'Decide', shape: 'diamond', style: { borderWidth: 5 }, geometry: { x: 260, y: 120, width: 140, height: 80 } },
      { id: 'data', text: 'Data', shape: 'parallelogram', geometry: { x: 500, y: 120, width: 150, height: 60 } },
      { id: 'circle', text: 'Circle', shape: 'circle', geometry: { x: 700, y: 120, width: 80, height: 80 } },
    ];
    doc.edges = [{ id: 'route', source: 'start', target: 'decision', sourceHandle: 'bottom', targetHandle: 'top', type: 'orthogonal', style: { stroke: '#123456', strokeWidth: 3, dashed: true, arrowEnd: true } }];
    doc.groups = [{ id: 'phase', title: 'Phase one', nodeIds: ['start', 'decision'], bounds: { x: -24, y: -32, width: 448, height: 264 }, style: { backgroundColor: '#eef', borderColor: '#456' } }];

    const svg = exportToSVG(doc);
    expect(svg).toContain('data-group-id="phase"');
    expect(svg).toContain('data-source-handle="bottom"');
    expect(svg).toContain('data-target-handle="top"');
    expect(svg).toContain('stroke-dasharray="6 4"');
    expect(svg).toContain('<polygon');
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('marker-end="url(#arrowhead)"');
    expect(svg).toContain('M 60 48 L 60 76 Q 60 84 68 84');
    expect(svg).toContain('stroke-width="5"');
    expect(exportToHTML(doc)).toContain(svg);
  });

  it('escapes imported group styles before embedding SVG in standalone HTML', () => {
    const doc = createEmptyDocument('Safe export', 'flowchart');
    doc.groups = [{ id: 'safe', title: 'Safe', nodeIds: [], bounds: { x: 0, y: 0, width: 50, height: 50 }, style: { backgroundColor: 'red" onload="alert(1)', borderColor: 'blue' } }];
    expect(exportToHTML(doc)).toContain('red&quot; onload=&quot;alert(1)');
  });
});

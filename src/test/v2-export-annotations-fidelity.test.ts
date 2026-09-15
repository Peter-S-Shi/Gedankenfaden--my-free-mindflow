import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { exportToSVG } from '../export/exporter';
import { BoundaryAnnotation, BraceAnnotation, RelationshipLineAnnotation } from '../model/types';

describe('Export Closure EX-05: Mind Map annotations render in visual exports', () => {
  function songjiangLikeDoc() {
    const doc = createEmptyDocument('淞江球场', 'mindmap');
    const root = doc.nodes[0];
    doc.nodes.push(
      { id: 'n1', text: '人物', parentId: root.id, geometry: { x: 300, y: 0, width: 120, height: 40 } },
      { id: 'n2', text: '情节', parentId: root.id, geometry: { x: 300, y: 200, width: 120, height: 40 } }
    );
    const boundary: BoundaryAnnotation = {
      id: 'b1',
      kind: 'boundary',
      title: '核心区域',
      nodeIds: ['n1'],
      style: { fillColor: 'rgba(59,130,246,0.1)', borderColor: '#3b82f6' },
    };
    const brace: BraceAnnotation = {
      id: 'br1',
      kind: 'brace',
      nodeIds: ['n1', 'n2'],
      label: '主要分支',
      style: { color: '#059669' },
    };
    const relationship: RelationshipLineAnnotation = {
      id: 'rl1',
      kind: 'relationshipLine',
      sourceNodeId: 'n1',
      targetNodeId: 'n2',
      label: '关联',
      style: { stroke: '#d97706', arrowEnd: true },
    };
    doc.annotations = [boundary, brace, relationship];
    return doc;
  }

  it('renders boundary geometry, title, and fill/border style', () => {
    const svg = exportToSVG(songjiangLikeDoc());
    expect(svg).toContain('data-annotation-kind="boundary"');
    expect(svg).toContain('核心区域');
    expect(svg).toContain('#3b82f6');
  });

  it('renders brace geometry, label, and stroke style', () => {
    const svg = exportToSVG(songjiangLikeDoc());
    expect(svg).toContain('data-annotation-kind="brace"');
    expect(svg).toContain('主要分支');
    expect(svg).toContain('#059669');
  });

  it('renders relationship line geometry, label, stroke style, and arrow-end marker', () => {
    const svg = exportToSVG(songjiangLikeDoc());
    expect(svg).toContain('data-annotation-kind="relationshipLine"');
    expect(svg).toContain('关联');
    expect(svg).toContain('#d97706');
    expect(svg).toContain('marker-end="url(#rel-arrow-end)"');
  });

  it('reuses the existing canonical geometry helpers rather than a second annotation engine (boundary box matches computeBoundaryBox)', () => {
    const doc = songjiangLikeDoc();
    const svg = exportToSVG(doc);
    // n1 is at x=300..420, y=0..40; computeBoundaryBox pads by 16 by default,
    // so the rendered rect must originate at x=284, y=-16.
    expect(svg).toMatch(/data-annotation-kind="boundary"[\s\S]*?x="284"[\s\S]*?y="-16"/);
  });

  it('extends scene bounds so boundary/brace/relationship geometry beyond node footprint is not clipped', () => {
    const doc = songjiangLikeDoc();
    const svg = exportToSVG(doc);
    const viewBoxMatch = svg.match(/viewBox="([\-\d.]+) ([\-\d.]+) ([\d.]+) ([\d.]+)"/)!;
    const [, vbX, , vbW] = viewBoxMatch.map(Number);
    // The brace sits to the right of n1/n2 (x up to 420); viewBox must reach
    // well past that to include the brace + its label.
    expect(vbX + vbW).toBeGreaterThan(460);
  });

  it('places boundary behind node content so nodes remain readable (layer contract)', () => {
    const svg = exportToSVG(songjiangLikeDoc());
    const boundaryIndex = svg.indexOf('data-annotation-kind="boundary"');
    const nodeIndex = svg.indexOf('data-node-shape');
    expect(boundaryIndex).toBeGreaterThanOrEqual(0);
    expect(nodeIndex).toBeGreaterThan(boundaryIndex);
  });
});

import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { exportToSVG } from '../export/exporter';
import { CanonicalNode } from '../model/types';

describe('Export Closure EX-03: Mind Map numbering appears in visual exports', () => {
  function decimalNumberedDoc() {
    const doc = createEmptyDocument('Numbering Fixture', 'mindmap');
    const root = doc.nodes[0];
    root.numbering = { level1Style: 'decimal', level2Style: 'decimal' };
    const nodes: CanonicalNode[] = [
      { id: 'c1', text: '人物', parentId: root.id, geometry: { x: 200, y: 100, width: 120, height: 40 } },
      { id: 'c2', text: '情节', parentId: root.id, geometry: { x: 200, y: 200, width: 120, height: 40 } },
      { id: 'c1_1', text: '安杰莉卡', parentId: 'c1', geometry: { x: 400, y: 80, width: 120, height: 40 } },
    ];
    doc.nodes.push(...nodes);
    return doc;
  }

  it('renders the numbering-prefixed presentation text in SVG, matching Canvas, without mutating node.text', () => {
    const doc = decimalNumberedDoc();
    const svg = exportToSVG(doc);
    expect(svg).toContain('1. 人物');
    expect(svg).toContain('2. 情节');
    expect(svg).toContain('1. 安杰莉卡');
    // Canonical text itself must remain untouched by exporting.
    expect(doc.nodes.find((n) => n.id === 'c1')?.text).toBe('人物');
  });

  it('does not number a document with no numbering rule applied anywhere', () => {
    const doc = createEmptyDocument('No Numbering', 'mindmap');
    doc.nodes.push({ id: 'c1', text: 'Plain Child', parentId: doc.nodes[0].id, geometry: { x: 200, y: 100, width: 120, height: 40 } });
    const svg = exportToSVG(doc);
    expect(svg).toContain('>Plain Child<');
    expect(svg).not.toMatch(/\d+\.\s*Plain Child/);
  });

  it('leaves Flowchart node text unaffected (no ambient numbering)', () => {
    const doc = createEmptyDocument('Flowchart Numbering', 'flowchart');
    doc.nodes = [{ id: 'n1', text: 'Step One', geometry: { x: 0, y: 0, width: 140, height: 44 } }];
    const svg = exportToSVG(doc);
    expect(svg).toContain('>Step One<');
    expect(svg).not.toMatch(/\d+\.\s*Step One/);
  });
});

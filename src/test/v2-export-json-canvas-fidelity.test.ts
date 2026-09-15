import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { exportToJSONCanvas } from '../export/exporter';
import { CanonicalGroup } from '../model/types';

describe('Export Closure EX-02: JSON Canvas standard-fidelity mapping', () => {
  function orlandoLikeDoc() {
    const doc = createEmptyDocument('Orlando Furioso', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'Canto I', geometry: { x: 0, y: 0, width: 140, height: 44 }, style: { backgroundColor: '#3b82f6' } },
      { id: 'n2', text: 'Canto II', geometry: { x: 300, y: 0, width: 140, height: 44 } },
      { id: 'n3', text: 'Canto III', geometry: { x: 300, y: 200, width: 140, height: 44 } },
    ];
    doc.edges = [
      { id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'right', targetHandle: 'left', label: 'leads to', style: { stroke: '#ef4444', arrowEnd: true } },
      { id: 'e2', source: 'n1', target: 'n3', sourceHandle: 'bottom', targetHandle: 'top' },
    ];
    const group: CanonicalGroup = {
      id: 'g1',
      title: 'Act I',
      nodeIds: ['n1', 'n2'],
      bounds: { x: -20, y: -20, width: 480, height: 100 },
      style: { borderColor: '#93c5fd' },
    };
    doc.groups = [group];
    return doc;
  }

  it('maps ordinary nodes with id/text/x/y/width/height/representable color using only standard fields', () => {
    const canvas = JSON.parse(exportToJSONCanvas(orlandoLikeDoc()));
    const n1 = canvas.nodes.find((n: any) => n.id === 'n1');
    expect(n1.type).toBe('text');
    expect(n1.text).toBe('Canto I');
    expect(n1.x).toBe(0);
    expect(n1.y).toBe(0);
    expect(n1.width).toBe(140);
    expect(n1.height).toBe(44);
    expect(n1.color).toBe('#3b82f6');
  });

  it('maps CanonicalGroup to a standard JSON Canvas group node using resolved bounds and title', () => {
    const canvas = JSON.parse(exportToJSONCanvas(orlandoLikeDoc()));
    const groupNode = canvas.nodes.find((n: any) => n.type === 'group');
    expect(groupNode).toBeDefined();
    expect(groupNode.label).toBe('Act I');
    expect(groupNode.x).toBe(-20);
    expect(groupNode.y).toBe(-20);
    expect(groupNode.width).toBe(480);
    expect(groupNode.height).toBe(100);
  });

  it('resolves an auto-computed group bounds (no explicit bounds) the same way Canvas does', () => {
    const doc = orlandoLikeDoc();
    doc.groups = [{ id: 'g2', title: 'Auto Group', nodeIds: ['n3'] }];
    const canvas = JSON.parse(exportToJSONCanvas(doc));
    const groupNode = canvas.nodes.find((n: any) => n.type === 'group');
    expect(groupNode.width).toBeGreaterThan(0);
    expect(groupNode.height).toBeGreaterThan(0);
  });

  it('maps edge source/target, standard fromSide/toSide, arrow end, label, and representable color', () => {
    const canvas = JSON.parse(exportToJSONCanvas(orlandoLikeDoc()));
    const e1 = canvas.edges.find((e: any) => e.id === 'e1');
    expect(e1.fromNode).toBe('n1');
    expect(e1.toNode).toBe('n2');
    expect(e1.fromSide).toBe('right');
    expect(e1.toSide).toBe('left');
    expect(e1.toEnd).toBe('arrow');
    expect(e1.label).toBe('leads to');
    expect(e1.color).toBe('#ef4444');

    const e2 = canvas.edges.find((e: any) => e.id === 'e2');
    expect(e2.fromSide).toBe('bottom');
    expect(e2.toSide).toBe('top');
  });

  it('never invents a private/proprietary field for semantics the standard cannot represent', () => {
    const canvas = JSON.parse(exportToJSONCanvas(orlandoLikeDoc()));
    const allKeys = new Set<string>();
    [...canvas.nodes, ...canvas.edges].forEach((entry: any) => Object.keys(entry).forEach((k) => allKeys.add(k)));
    const standardNodeEdgeKeys = new Set([
      'id', 'type', 'text', 'x', 'y', 'width', 'height', 'color', 'label',
      'fromNode', 'fromSide', 'fromEnd', 'toNode', 'toSide', 'toEnd',
    ]);
    for (const key of allKeys) {
      expect(standardNodeEdgeKeys.has(key)).toBe(true);
    }
  });

  it('omits color rather than fabricating one when the source color is not representable as #RRGGBB', () => {
    const doc = orlandoLikeDoc();
    doc.nodes[1].style = { backgroundColor: 'rgba(59,130,246,0.5)' };
    const canvas = JSON.parse(exportToJSONCanvas(doc));
    const n2 = canvas.nodes.find((n: any) => n.id === 'n2');
    expect(n2.color).toBeUndefined();
  });

  it('produces JSON parseable by a standard JSON Canvas consumer (valid JSON, nodes[]/edges[] arrays)', () => {
    const text = exportToJSONCanvas(orlandoLikeDoc());
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(Array.isArray(parsed.edges)).toBe(true);
  });
});

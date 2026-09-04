import { describe, it, expect } from 'vitest';
import { autoLayoutDocument } from '../model/layout';
import { calculateOrthogonalPath } from '../model/routing';
import { packageDocumentToMflow, parseMflowFromBytes } from '../model/container';
import { validateDocumentInvariants } from '../model/validator';
import { createEmptyDocument } from '../model/document';
import { CanonicalDocument, CanonicalNode, CanonicalEdge } from '../model/types';
import {
  exportToJSON,
  exportToSVG,
  exportToMarkdown,
  exportToHTML,
  exportToMermaid,
  exportToOPML,
  exportToLegacyMindMapXML,
  exportToJSONCanvas,
} from '../export/exporter';

function generateTreeDocument(nodeCount: number, mode: 'mindmap' | 'flowchart' = 'mindmap'): CanonicalDocument {
  const doc = createEmptyDocument('Benchmark Document', mode);
  const nodes: CanonicalNode[] = [
    {
      id: 'root',
      text: 'Benchmark Central Topic',
      type: 'root',
      geometry: { x: 0, y: 0, width: 160, height: 48 },
    },
  ];
  const edges: CanonicalEdge[] = [];

  let parentQueue: string[] = ['root'];
  let currentId = 1;

  while (currentId < nodeCount) {
    const parentId = parentQueue.shift()!;
    const branchFactor = Math.min(3, nodeCount - currentId);

    for (let b = 0; b < branchFactor; b++) {
      const childId = `node_${currentId++}`;
      nodes.push({
        id: childId,
        parentId,
        text: `Topic Level Node ${childId} with benchmark content`,
        type: 'default',
        geometry: { x: 0, y: 0, width: 140, height: 40 },
      });
      edges.push({
        id: `edge_${parentId}_${childId}`,
        source: parentId,
        target: childId,
      });
      parentQueue.push(childId);
    }
  }

  doc.nodes = nodes;
  doc.edges = edges;
  return doc;
}

describe('M6 Performance Benchmarking & Baseline Measurements', () => {
  it('measures Mind Map balanced layout computation across small, medium, large, and extreme document sizes', () => {
    // 10 nodes (small)
    const smallDoc = generateTreeDocument(10);
    const t0 = performance.now();
    const smallLayout = autoLayoutDocument(smallDoc, { preset: 'balanced', horizontalGap: 60, verticalGap: 25 });
    const smallDuration = performance.now() - t0;
    expect(smallLayout.nodes.length).toBe(10);
    expect(smallDuration).toBeLessThan(15); // Budget: < 15ms

    // 100 nodes (medium)
    const medDoc = generateTreeDocument(100);
    const t1 = performance.now();
    const medLayout = autoLayoutDocument(medDoc, { preset: 'balanced', horizontalGap: 60, verticalGap: 25 });
    const medDuration = performance.now() - t1;
    expect(medLayout.nodes.length).toBe(100);
    expect(medDuration).toBeLessThan(30); // Budget: < 30ms

    // 500 nodes (large)
    const largeDoc = generateTreeDocument(500);
    const t2 = performance.now();
    const largeLayout = autoLayoutDocument(largeDoc, { preset: 'balanced', horizontalGap: 60, verticalGap: 25 });
    const largeDuration = performance.now() - t2;
    expect(largeLayout.nodes.length).toBe(500);
    expect(largeDuration).toBeLessThan(60); // Budget: < 60ms

    // 1,000 nodes (extreme)
    const extremeDoc = generateTreeDocument(1000);
    const t3 = performance.now();
    const extremeLayout = autoLayoutDocument(extremeDoc, { preset: 'balanced', horizontalGap: 60, verticalGap: 25 });
    const extremeDuration = performance.now() - t3;
    expect(extremeLayout.nodes.length).toBe(1000);
    expect(extremeDuration).toBeLessThan(120); // Budget: < 120ms
  });

  it('measures Flowchart orthogonal routing calculations for dense graph topologies', () => {
    const nodes: CanonicalNode[] = [];
    for (let i = 0; i < 100; i++) {
      nodes.push({
        id: `fc_node_${i}`,
        text: `Process Step ${i}`,
        type: 'default',
        geometry: { x: (i % 10) * 200, y: Math.floor(i / 10) * 120, width: 140, height: 44 },
      });
    }

    const t0 = performance.now();
    // Calculate 100 forward orthogonal routes
    for (let i = 0; i < 99; i++) {
      const source = nodes[i].geometry;
      const target = nodes[i + 1].geometry;
      const sW = source.width || 140;
      const sH = source.height || 44;
      const tW = target.width || 140;
      const route = calculateOrthogonalPath(
        { x: source.x + sW / 2, y: source.y + sH },
        { x: target.x + tW / 2, y: target.y },
        'bottom',
        'top'
      );
      expect(route.points.length).toBeGreaterThanOrEqual(2);
      expect(route.path).toContain('M');
    }

    // Calculate 30 lateral and obstacle routes
    for (let i = 0; i < 30; i++) {
      const source = nodes[i].geometry;
      const target = nodes[i + 5].geometry;
      const sW = source.width || 140;
      const sH = source.height || 44;
      const tH = target.height || 44;
      const route = calculateOrthogonalPath(
        { x: source.x + sW, y: source.y + sH / 2 },
        { x: target.x, y: target.y + tH / 2 },
        'right',
        'left'
      );
      expect(route.points.length).toBeGreaterThanOrEqual(2);
    }
    const duration = performance.now() - t0;
    expect(duration).toBeLessThan(50); // Budget: < 50ms for 130 routing computations
  });

  it('measures document packaging and parsing performance for 500-node and 1000-node documents', async () => {
    const doc500 = generateTreeDocument(500);
    const t0 = performance.now();
    const bytes500 = await packageDocumentToMflow(doc500);
    const package500Duration = performance.now() - t0;
    expect(bytes500.byteLength).toBeGreaterThan(5000);
    expect(package500Duration).toBeLessThan(100); // Budget: < 100ms

    const t1 = performance.now();
    const restored500 = await parseMflowFromBytes(bytes500);
    const parse500Duration = performance.now() - t1;
    expect(restored500.document.nodes.length).toBe(500);
    expect(parse500Duration).toBeLessThan(100); // Budget: < 100ms

    const doc1000 = generateTreeDocument(1000);
    const t2 = performance.now();
    const bytes1000 = await packageDocumentToMflow(doc1000);
    const package1000Duration = performance.now() - t2;
    expect(bytes1000.byteLength).toBeGreaterThan(10000);
    expect(package1000Duration).toBeLessThan(200); // Budget: < 200ms

    const t3 = performance.now();
    const restored1000 = await parseMflowFromBytes(bytes1000);
    const parse1000Duration = performance.now() - t3;
    expect(restored1000.document.nodes.length).toBe(1000);
    expect(parse1000Duration).toBeLessThan(200); // Budget: < 200ms
  });

  it('measures canonical schema invariant validator speed for 1,000 nodes', () => {
    const doc = generateTreeDocument(1000);
    const t0 = performance.now();
    const result = validateDocumentInvariants(doc);
    const duration = performance.now() - t0;
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(duration).toBeLessThan(25); // Budget: < 25ms
  });

  it('measures export generation performance across pure formats for a 500-node document', () => {
    const doc = generateTreeDocument(500);

    const tJson = performance.now();
    const jsonOut = exportToJSON(doc);
    const dJson = performance.now() - tJson;
    expect(jsonOut.length).toBeGreaterThan(5000);
    expect(dJson).toBeLessThan(25); // Budget: < 25ms

    const tMd = performance.now();
    const mdOut = exportToMarkdown(doc);
    const dMd = performance.now() - tMd;
    expect(mdOut.length).toBeGreaterThan(1000);
    expect(dMd).toBeLessThan(35); // Budget: < 35ms

    const tSvg = performance.now();
    const svgOut = exportToSVG(doc);
    const dSvg = performance.now() - tSvg;
    expect(svgOut).toContain('<svg');
    expect(dSvg).toBeLessThan(50); // Budget: < 50ms

    const tHtml = performance.now();
    const htmlOut = exportToHTML(doc);
    const dHtml = performance.now() - tHtml;
    expect(htmlOut).toContain('<!DOCTYPE html>');
    expect(dHtml).toBeLessThan(50); // Budget: < 50ms

    const tMmd = performance.now();
    const mmdOut = exportToMermaid(doc);
    const dMmd = performance.now() - tMmd;
    expect(mmdOut).toContain('graph TD');
    expect(dMmd).toBeLessThan(35); // Budget: < 35ms

    const tOpml = performance.now();
    const opmlOut = exportToOPML(doc);
    const dOpml = performance.now() - tOpml;
    expect(opmlOut).toContain('<opml version="2.0">');
    expect(dOpml).toBeLessThan(35); // Budget: < 35ms

    const tXml = performance.now();
    const xmlOut = exportToLegacyMindMapXML(doc);
    const dXml = performance.now() - tXml;
    expect(xmlOut).toContain('<map version="1.0.1">');
    expect(dXml).toBeLessThan(35); // Budget: < 35ms

    const tCanvas = performance.now();
    const canvasOut = exportToJSONCanvas(doc);
    const dCanvas = performance.now() - tCanvas;
    expect(canvasOut).toContain('"nodes"');
    expect(dCanvas).toBeLessThan(25); // Budget: < 25ms
  });
});

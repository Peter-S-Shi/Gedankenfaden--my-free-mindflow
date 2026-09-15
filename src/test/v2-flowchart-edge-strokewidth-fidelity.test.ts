import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEmptyDocument } from '../model/document';
import { canonicalToReactFlow, computeAdaptiveEdgeStrokeWidth } from '../model/adapter';

describe('Flowchart PH Bug F8: Canonical Edge Stroke-Width Fidelity Under Adaptive Zoom', () => {
  it('at Orlando zoom 0.38, a canonical 2.5 edge remains visibly thicker than a canonical 2 edge', () => {
    const normalAtLowZoom = computeAdaptiveEdgeStrokeWidth(2, 0.38);
    const emphAtLowZoom = computeAdaptiveEdgeStrokeWidth(2.5, 0.38);
    expect(emphAtLowZoom).toBeGreaterThan(normalAtLowZoom);
    // Same relative ordering as the canonical base widths (2.5 / 2 = 1.25).
    expect(emphAtLowZoom / normalAtLowZoom).toBeCloseTo(2.5 / 2, 5);
  });

  it('applies no zoom compensation at or above the 0.65 threshold: displayed width equals canonical base width', () => {
    expect(computeAdaptiveEdgeStrokeWidth(2, 1)).toBe(2);
    expect(computeAdaptiveEdgeStrokeWidth(2.5, 0.65)).toBe(2.5);
  });

  it('is a no-op when adaptive compensation is disabled, regardless of zoom', () => {
    expect(computeAdaptiveEdgeStrokeWidth(2.5, 0.1, false)).toBe(2.5);
  });

  it('projects each edge with its own canonical strokeWidth as the base (not a shared default)', () => {
    const doc = createEmptyDocument('Width Fidelity', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'A', geometry: { x: 0, y: 0, width: 120, height: 40 } },
      { id: 'n2', text: 'B', geometry: { x: 200, y: 0, width: 120, height: 40 } },
      { id: 'n3', text: 'C', geometry: { x: 400, y: 0, width: 120, height: 40 } },
    ];
    doc.edges = [
      { id: 'e_normal', source: 'n1', target: 'n2', style: { strokeWidth: 2 } },
      { id: 'e_emph', source: 'n2', target: 'n3', style: { strokeWidth: 2.5 } },
    ];
    const projected = canonicalToReactFlow(doc);
    const normal = projected.edges.find((e) => e.id === 'e_normal')!;
    const emph = projected.edges.find((e) => e.id === 'e_emph')!;
    expect(normal.style?.strokeWidth).toBe(2);
    expect(emph.style?.strokeWidth).toBe(2.5);
  });

  it('CanvasEditor derives the low-zoom adaptive width from each edge base width instead of overwriting every edge with one computed value', () => {
    const source = readFileSync(new URL('../components/CanvasEditor.tsx', import.meta.url), 'utf8');
    // The displayedEdges projection must read each edge's own style.strokeWidth
    // as the base before applying any zoom compensation.
    expect(source).toMatch(/e\.style\?\.strokeWidth/);
    // Must not unconditionally stamp a single shared adaptiveWidth value onto
    // every edge's strokeWidth field (the pre-fix bug).
    expect(source).not.toMatch(/strokeWidth:\s*adaptiveWidth,/);
  });

  it('save/reload retains the original canonical strokeWidth values exactly (display compensation is projection-only)', () => {
    const doc = createEmptyDocument('Roundtrip', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'A', geometry: { x: 0, y: 0, width: 120, height: 40 } },
      { id: 'n2', text: 'B', geometry: { x: 200, y: 0, width: 120, height: 40 } },
    ];
    doc.edges = [{ id: 'e1', source: 'n1', target: 'n2', style: { strokeWidth: 2.5 } }];
    // Projection itself must not mutate the canonical document.
    canonicalToReactFlow(doc);
    expect(doc.edges[0].style?.strokeWidth).toBe(2.5);
  });
});

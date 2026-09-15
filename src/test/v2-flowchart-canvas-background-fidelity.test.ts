import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveCanvasBackgroundProjection } from '../model/theme';

describe('Flowchart PH Bug F7: Canvas Background Pattern/Color Fidelity', () => {
  it('maps "dots" to the dots pattern variant with a visible pattern size', () => {
    const projection = resolveCanvasBackgroundProjection('dots');
    expect(projection.variant).toBe('dots');
    expect(projection.patternSize).toBeGreaterThan(0);
  });

  it('maps "grid" to the lines pattern variant with a visible pattern size', () => {
    const projection = resolveCanvasBackgroundProjection('grid');
    expect(projection.variant).toBe('lines');
    expect(projection.patternSize).toBeGreaterThan(0);
  });

  it('maps "blank" to a suppressed pattern (size 0) instead of rendering dots or lines', () => {
    const projection = resolveCanvasBackgroundProjection('blank');
    expect(projection.patternSize).toBe(0);
  });

  it('defaults to the dots pattern when canvasBackground is undefined', () => {
    const projection = resolveCanvasBackgroundProjection(undefined);
    expect(projection.variant).toBe('dots');
    expect(projection.patternSize).toBeGreaterThan(0);
  });

  it('CanvasEditor wires the pattern projection and the separate canvasBgColor fill, never the pattern keyword itself, into CSS', () => {
    const canvasSource = readFileSync(new URL('../components/CanvasEditor.tsx', import.meta.url), 'utf8');
    // Must NOT feed the canonical pattern keyword directly into CSS backgroundColor.
    expect(canvasSource).not.toMatch(/backgroundColor:\s*doc\.theme\?\.canvasBackground\b/);
    // Must use resolveCanvasBackgroundProjection to drive the <Background> variant/size.
    expect(canvasSource).toContain('resolveCanvasBackgroundProjection(doc.theme?.canvasBackground)');
    // Must use the separate, explicit canvasBgColor field for the actual fill color.
    expect(canvasSource).toMatch(/backgroundColor:\s*doc\.theme\?\.canvasBgColor/);
  });
});

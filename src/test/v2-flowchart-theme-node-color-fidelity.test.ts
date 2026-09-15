import { describe, it, expect } from 'vitest';
import { resolveNodeVisuals } from '../model/theme';
import { CanonicalNode, DocumentTheme } from '../model/types';

describe('Flowchart PH Bug F9: Theme-Level Node Color Fidelity', () => {
  const ordinaryNode: CanonicalNode = {
    id: 'n1',
    text: 'Step',
    type: 'default',
    geometry: { x: 0, y: 0, width: 120, height: 40 },
  };

  it('uses explicit theme.nodeBackground/nodeTextColor for ordinary nodes even when paletteId points elsewhere', () => {
    const theme: DocumentTheme = {
      paletteId: 'nordic-slate',
      canvasBackground: 'dots',
      fontFamily: 'sans',
      defaultEdgeRouting: 'orthogonal',
      name: 'Custom',
      nodeBackground: '#123456',
      nodeTextColor: '#abcdef',
    };
    const visuals = resolveNodeVisuals(ordinaryNode, theme);
    expect(visuals.backgroundColor).toBe('#123456');
    expect(visuals.textColor).toBe('#abcdef');
    // Must not silently fall back to the nordic-slate palette's nodeBg/nodeText.
    expect(visuals.backgroundColor).not.toBe('#ffffff');
  });

  it('local node.style still wins over explicit theme colors (highest precedence)', () => {
    const theme: DocumentTheme = {
      paletteId: 'nordic-slate',
      canvasBackground: 'dots',
      fontFamily: 'sans',
      defaultEdgeRouting: 'orthogonal',
      name: 'Custom',
      nodeBackground: '#123456',
      nodeTextColor: '#abcdef',
    };
    const nodeWithLocalStyle: CanonicalNode = {
      ...ordinaryNode,
      style: { backgroundColor: '#ff0000', textColor: '#00ff00' },
    };
    const visuals = resolveNodeVisuals(nodeWithLocalStyle, theme);
    expect(visuals.backgroundColor).toBe('#ff0000');
    expect(visuals.textColor).toBe('#00ff00');
  });

  it('falls back to palette values when the theme has no explicit node color override', () => {
    const theme: DocumentTheme = {
      paletteId: 'forest-sage',
      canvasBackground: 'dots',
      fontFamily: 'sans',
      defaultEdgeRouting: 'orthogonal',
      name: 'Forest Sage',
    };
    const visuals = resolveNodeVisuals(ordinaryNode, theme);
    expect(visuals.backgroundColor).toBe('#ffffff'); // forest-sage nodeBg
    expect(visuals.textColor).toBe('#142414'); // forest-sage nodeText
  });

  it('preserves specialized root semantics: root nodes keep palette rootBg/rootText, not the generic theme.nodeBackground override', () => {
    const rootNode: CanonicalNode = { ...ordinaryNode, id: 'root', type: 'root' };
    const theme: DocumentTheme = {
      paletteId: 'nordic-slate',
      canvasBackground: 'dots',
      fontFamily: 'sans',
      defaultEdgeRouting: 'orthogonal',
      name: 'Custom',
      nodeBackground: '#123456',
      nodeTextColor: '#abcdef',
    };
    const visuals = resolveNodeVisuals(rootNode, theme);
    // nordic-slate rootBg/rootText, unaffected by the generic node override.
    expect(visuals.backgroundColor).toBe('#2563eb');
    expect(visuals.textColor).toBe('#ffffff');
  });

  it('an explicit local root style still overrides even the specialized root palette default', () => {
    const rootNodeWithLocalStyle: CanonicalNode = {
      ...ordinaryNode,
      id: 'root',
      type: 'root',
      style: { backgroundColor: '#111111' },
    };
    const theme: DocumentTheme = {
      paletteId: 'nordic-slate',
      canvasBackground: 'dots',
      fontFamily: 'sans',
      defaultEdgeRouting: 'orthogonal',
      name: 'Custom',
    };
    const visuals = resolveNodeVisuals(rootNodeWithLocalStyle, theme);
    expect(visuals.backgroundColor).toBe('#111111');
  });
});

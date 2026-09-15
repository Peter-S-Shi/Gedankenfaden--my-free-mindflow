import { describe, it, expect } from 'vitest';
import { createEmptyDocument, serializeDocument, deserializeDocument, cloneDocument } from '../model/document';
import { getDefaultTheme, resolveNodeVisuals } from '../model/theme';
import { canonicalToReactFlow, reactFlowToCanonical } from '../model/adapter';
import { wrapNodeText } from '../model/textMeasurement';
import { CanonicalDocument } from '../model/types';

describe('Flowchart F6-F10 Fidelity Closure: cross-defect regression', () => {
  function buildCombinedDocument(): CanonicalDocument {
    const doc = createEmptyDocument('F6-F10 Combined Fidelity', 'flowchart');
    doc.viewport = { x: 40, y: -20, zoom: 0.6 };
    doc.theme = {
      ...getDefaultTheme('flowchart'),
      canvasBackground: 'grid',
      canvasBgColor: '#101418',
      fontFamily: 'Georgia, serif',
      nodeBackground: '#1f2937',
      nodeTextColor: '#f9fafb',
    };
    doc.nodes = [
      {
        id: 'n1',
        text: 'I｜法兰西战败：安杰莉卡 Angelica\n逃离查理曼军营',
        type: 'default',
        geometry: { x: 0, y: 0, width: 260, height: 90 },
      },
      {
        id: 'n2',
        text: 'Local Font Node',
        type: 'default',
        geometry: { x: 400, y: 0, width: 160, height: 44 },
        style: { fontFamily: '"Courier New", monospace' },
      },
      { id: 'n3', text: 'Decision', type: 'decision', geometry: { x: 700, y: 0, width: 140, height: 60 } },
    ];
    doc.edges = [
      { id: 'e_normal', source: 'n1', target: 'n2', type: 'orthogonal', style: { strokeWidth: 2 } },
      { id: 'e_emph', source: 'n2', target: 'n3', type: 'bezier', style: { strokeWidth: 2.5 } },
      { id: 'e_cross', source: 'n1', target: 'n3', type: 'straight', isCrossLink: true },
    ];
    doc.groups = [
      { id: 'g1', title: 'Act I', nodeIds: ['n1', 'n2'], bounds: { x: -20, y: -20, width: 620, height: 160 } },
    ];
    return doc;
  }

  it('all five fixes coexist through canonical -> React Flow projection -> canonical round-trip', () => {
    const doc = buildCombinedDocument();
    const projected = canonicalToReactFlow(doc);

    // F6: multiline hard-break text preserved in the projected label.
    const n1 = projected.nodes.find((n) => n.id === 'n1')!;
    expect(n1.data.label).toContain('\n');
    expect(wrapNodeText(n1.data.label as string, 260, 14).lines.length).toBeGreaterThanOrEqual(2);

    // F8: distinct canonical edge widths remain distinct in projection.
    const eNormal = projected.edges.find((e) => e.id === 'e_normal')!;
    const eEmph = projected.edges.find((e) => e.id === 'e_emph')!;
    expect(eNormal.style?.strokeWidth).toBe(2);
    expect(eEmph.style?.strokeWidth).toBe(2.5);
    expect(eEmph.style?.strokeWidth).toBeGreaterThan(eNormal.style?.strokeWidth as number);

    // F9: explicit theme node colors resolve for ordinary nodes.
    const visualsN1 = resolveNodeVisuals(doc.nodes[0], doc.theme);
    expect(visualsN1.backgroundColor).toBe('#1f2937');
    expect(visualsN1.textColor).toBe('#f9fafb');

    // F10: document vs local font-family precedence.
    const visualsN2 = resolveNodeVisuals(doc.nodes[1], doc.theme);
    expect(visualsN2.fontFamily).toBe('"Courier New", monospace');
    expect(visualsN1.fontFamily).toBe('Georgia, serif');

    // F1-F5 must still hold alongside F6-F10.
    expect(projected.nodes.every((n) => (n.zIndex ?? 0) >= 1)).toBe(true); // F1 layering
    const roundTripped = reactFlowToCanonical(projected.nodes, projected.edges, doc);
    expect(roundTripped.groups[0].bounds).toEqual({ x: -20, y: -20, width: 620, height: 160 }); // F2
    expect(roundTripped.edges.find((e) => e.id === 'e_normal')?.type).toBe('orthogonal'); // F3
    expect(roundTripped.edges.find((e) => e.id === 'e_emph')?.type).toBe('bezier'); // F3
    expect(roundTripped.edges.find((e) => e.id === 'e_cross')?.isCrossLink).toBe(true); // F4
    expect(roundTripped.viewport).toEqual({ x: 40, y: -20, zoom: 0.6 }); // F5
  });

  it('survives a full serialize/reload cycle without losing any of the F6-F10 canonical fields', () => {
    const doc = buildCombinedDocument();
    const json = serializeDocument(doc);
    const reloaded = deserializeDocument(json);

    expect(reloaded.nodes[0].text).toBe(doc.nodes[0].text); // F6 hard breaks
    expect(reloaded.theme.canvasBackground).toBe('grid'); // F7 pattern
    expect(reloaded.theme.canvasBgColor).toBe('#101418'); // F7 color
    expect(reloaded.edges.find((e) => e.id === 'e_emph')?.style?.strokeWidth).toBe(2.5); // F8
    expect(reloaded.theme.nodeBackground).toBe('#1f2937'); // F9
    expect(reloaded.nodes[1].style?.fontFamily).toBe('"Courier New", monospace'); // F10 local
    expect(reloaded.theme.fontFamily).toBe('Georgia, serif'); // F10 document

    const cloned = cloneDocument(reloaded);
    expect(cloned.viewport).toEqual({ x: 40, y: -20, zoom: 0.6 });
  });

  it('display-only adaptive compensation (F8 zoom scaling) never gets written back into canonical style', () => {
    const doc = buildCombinedDocument();
    canonicalToReactFlow(doc);
    // Projection must be read-only with respect to the source document.
    expect(doc.edges.find((e) => e.id === 'e_normal')?.style?.strokeWidth).toBe(2);
    expect(doc.edges.find((e) => e.id === 'e_emph')?.style?.strokeWidth).toBe(2.5);
  });
});

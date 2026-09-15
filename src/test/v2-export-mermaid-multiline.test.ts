import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { exportToMermaid } from '../export/exporter';

describe('Export Closure EX-07: Mermaid multiline label safety', () => {
  it('converts explicit hard breaks into <br/> instead of embedding a literal physical newline in the quoted label', () => {
    const doc = createEmptyDocument('Orlando Furioso', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'I｜法兰西战败\n逃离查理曼军营', shape: 'rounded', geometry: { x: 0, y: 0, width: 200, height: 60 } },
    ];
    const mermaid = exportToMermaid(doc);
    const nodeLine = mermaid.split('\n').find((l) => l.includes('法兰西战败'));
    expect(nodeLine).toBeDefined();
    expect(nodeLine).toContain('<br/>');
    // The label content must render on a single physical .mmd line -- no
    // raw newline was allowed to split it across two lines of the file.
    expect(nodeLine).toContain('逃离查理曼军营');
  });

  it('keeps node shapes intact when the label is multiline', () => {
    const doc = createEmptyDocument('Shapes', 'flowchart');
    doc.nodes = [{ id: 'd1', text: 'Line1\nLine2', shape: 'diamond', geometry: { x: 0, y: 0, width: 140, height: 60 } }];
    const mermaid = exportToMermaid(doc);
    expect(mermaid).toContain('{"Line1<br/>Line2"}');
  });

  it('still escapes quotes inside a multiline label', () => {
    const doc = createEmptyDocument('Quotes', 'flowchart');
    doc.nodes = [{ id: 'q1', text: 'Say "hi"\nthen leave', geometry: { x: 0, y: 0, width: 140, height: 60 } }];
    const mermaid = exportToMermaid(doc);
    expect(mermaid).toContain('&quot;hi&quot;');
    expect(mermaid).not.toMatch(/[^&]"hi"/);
  });

  it('does not flatten explicit line breaks into spaces', () => {
    const doc = createEmptyDocument('NoFlatten', 'flowchart');
    doc.nodes = [{ id: 'n1', text: 'First\nSecond', geometry: { x: 0, y: 0, width: 140, height: 60 } }];
    const mermaid = exportToMermaid(doc);
    expect(mermaid).not.toContain('First Second');
    expect(mermaid).toContain('First<br/>Second');
  });

  it('applies the same multiline-safe escaping to edge labels', () => {
    const doc = createEmptyDocument('EdgeLabels', 'flowchart');
    doc.nodes = [
      { id: 'a', text: 'A', geometry: { x: 0, y: 0, width: 100, height: 40 } },
      { id: 'b', text: 'B', geometry: { x: 200, y: 0, width: 100, height: 40 } },
    ];
    doc.edges = [{ id: 'e1', source: 'a', target: 'b', label: 'yes\nindeed' }];
    const mermaid = exportToMermaid(doc);
    expect(mermaid).toContain('yes<br/>indeed');
  });
});

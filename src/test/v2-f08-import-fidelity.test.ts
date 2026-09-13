/**
 * Ticket #11 / Ledger F08 — Markdown & OPML import fidelity regression seam.
 * Adversarial fixtures for nested hierarchy and XML entity decoding.
 */
import { describe, it, expect } from 'vitest';
import { importFromMarkdown, importFromOPML } from '../model/importers';

describe('Ticket #11 (F08): Markdown import — nested hierarchy fidelity', () => {
  it('preserves deep nested headings mixed with indented list levels', () => {
    const md = `# Root Topic
## Branch A
### Leaf A1
- item A1a
  - item A1a-i
    - item A1a-i-1
## Branch B
- item B1
  1. item B1a
  2. item B1b
`;
    const doc = importFromMarkdown(md, 'fallback');
    expect(doc.title).toBe('Root Topic');

    const byText = new Map(doc.nodes.map((n) => [n.text, n]));
    const branchA = byText.get('Branch A');
    const leafA1 = byText.get('Leaf A1');
    const itemA1a = byText.get('item A1a');
    const itemA1aI = byText.get('item A1a-i');
    const itemA1aI1 = byText.get('item A1a-i-1');
    const branchB = byText.get('Branch B');
    const itemB1 = byText.get('item B1');
    const itemB1a = byText.get('item B1a');

    expect(branchA).toBeDefined();
    expect(leafA1?.parentId).toBe(branchA?.id);
    expect(itemA1a?.parentId).toBe(leafA1?.id);
    expect(itemA1aI?.parentId).toBe(itemA1a?.id);
    expect(itemA1aI1?.parentId).toBe(itemA1aI?.id);
    expect(branchB).toBeDefined();
    expect(itemB1?.parentId).toBe(branchB?.id);
    expect(itemB1a?.parentId).toBe(itemB1?.id);
  });
});

describe('Ticket #11 (F08): OPML import — nested outlines and entity decoding', () => {
  it('preserves deeply nested outline hierarchy', () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <head><title>Deep Outline</title></head>
  <body>
    <outline text="Top">
      <outline text="Mid">
        <outline text="Bottom" />
      </outline>
    </outline>
  </body>
</opml>`;
    const doc = importFromOPML(opml);
    const byText = new Map(doc.nodes.map((n) => [n.text, n]));
    const top = byText.get('Top');
    const mid = byText.get('Mid');
    const bottom = byText.get('Bottom');
    expect(top).toBeDefined();
    expect(mid?.parentId).toBe(top?.id);
    expect(bottom?.parentId).toBe(mid?.id);
  });

  it('decodes XML entities in the document <title> exactly like outline text', () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <head><title>A &amp; B &lt;Report&gt;</title></head>
  <body>
    <outline text="Node &amp; Special &quot;Text&quot;" />
  </body>
</opml>`;
    const doc = importFromOPML(opml);
    expect(doc.title).toBe('A & B <Report>');
    const decodedOutline = doc.nodes.find((n) => n.text === 'Node & Special "Text"');
    expect(decodedOutline).toBeDefined();
  });
});

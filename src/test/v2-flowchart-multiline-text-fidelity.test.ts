import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { wrapNodeText, computeTextAwareNodeSize, computeTextFirstAutoWidth } from '../model/textMeasurement';

describe('Flowchart PH Bug F6: Explicit Multiline Node-Text Fidelity', () => {
  it('preserves explicit \\n as a hard line break instead of collapsing it into a soft-wrap space', () => {
    const wrapped = wrapNodeText('Line One\nLine Two', 360, 14);
    expect(wrapped.lines).toEqual(['Line One', 'Line Two']);
  });

  it('keeps a hard-broken second line on its own line even when the whole string would fit on one line at the given width', () => {
    // Orlando-style case: explicit \n mid-sentence, generous width.
    const text = 'I｜法兰西战败：安杰莉卡 Angelica\n逃离查理曼军营';
    const wrapped = wrapNodeText(text, 1000, 14);
    expect(wrapped.lines.length).toBeGreaterThanOrEqual(2);
    expect(wrapped.lines[0]).toBe('I｜法兰西战败：安杰莉卡 Angelica');
    expect(wrapped.lines[wrapped.lines.length - 1]).toBe('逃离查理曼军营');
  });

  it('still soft-wraps long text within a single hard line at a narrow width', () => {
    const wrapped = wrapNodeText('a very long single line of plain english words that must wrap', 120, 14);
    expect(wrapped.lines.length).toBeGreaterThan(1);
  });

  it('combines hard breaks and soft wrapping: each hard line wraps independently', () => {
    const wrapped = wrapNodeText(
      'Intro\na very long second line that needs to wrap across more than one row',
      120,
      14
    );
    expect(wrapped.lines[0]).toBe('Intro');
    expect(wrapped.lines.length).toBeGreaterThan(2);
  });

  it('preserves an intentional blank line from a double hard break', () => {
    const wrapped = wrapNodeText('First\n\nThird', 360, 14);
    expect(wrapped.lines).toEqual(['First', '', 'Third']);
  });

  it('computeTextAwareNodeSize grows height to fit explicit multiline text', () => {
    const singleLine = computeTextAwareNodeSize('One line', { width: 200 });
    const twoLines = computeTextAwareNodeSize('One line\nAnother line', { width: 200 });
    expect(twoLines.height).toBeGreaterThan(singleLine.height);
  });

  it('computeTextFirstAutoWidth sizes by the widest hard line, not the concatenated string length', () => {
    const singleLongLine = computeTextFirstAutoWidth('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const splitAcrossLines = computeTextFirstAutoWidth('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(splitAcrossLines).toBeLessThan(singleLongLine);
  });

  it('existing single-line nodes remain behaviorally unchanged (no regression for plain text)', () => {
    const wrapped = wrapNodeText('Plain single line node text', 360, 14);
    expect(wrapped.lines).toEqual(['Plain single line node text']);
  });

  it('CustomNode uses a multiline-capable editing control, not a single-line <input>, for node text', () => {
    const source = readFileSync(new URL('../components/CustomNode.tsx', import.meta.url), 'utf8');
    expect(source).toContain('<textarea');
    expect(source).toMatch(/isEditing \? \(\s*(?:\/\/[^\n]*\s*)*<textarea/);
    expect(source).not.toMatch(/isEditing \? \(\s*<input\b/);
  });

  it('CustomNode renders hard line breaks in the read-only label display (white-space preserving)', () => {
    const source = readFileSync(new URL('../components/CustomNode.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/whiteSpace:\s*['"]pre-wrap['"]/);
  });
});

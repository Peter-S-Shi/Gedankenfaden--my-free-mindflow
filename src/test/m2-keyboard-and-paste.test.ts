import { describe, it, expect } from 'vitest';
import { parseMultilineToTree } from '../model/pasteParser';
import { formatIndexToStyle, computeDocumentNumbering } from '../model/numbering';
import { createEmptyDocument } from '../model/document';
import { CanonicalNode } from '../model/types';

describe('Milestone 2: Multiline Paste-to-Structure Parser', () => {
  it('parses tab-indented plain text into hierarchical node subtrees', () => {
    const rawText = `
Architecture
\tVisual Engine
\t\tCanvas Render
\t\tMotion System
\tNative Shell
\t\tFile System
`;
    const targetParent = 'root_node_1';
    const result = parseMultilineToTree(rawText, targetParent);

    expect(result.nodes.length).toBe(6);
    expect(result.edges.length).toBe(6);

    const archNode = result.nodes.find((n) => n.text === 'Architecture')!;
    expect(archNode).toBeDefined();
    expect(archNode.parentId).toBe(targetParent);

    const visualNode = result.nodes.find((n) => n.text === 'Visual Engine')!;
    expect(visualNode.parentId).toBe(archNode.id);

    const canvasNode = result.nodes.find((n) => n.text === 'Canvas Render')!;
    expect(canvasNode.parentId).toBe(visualNode.id);

    const nativeNode = result.nodes.find((n) => n.text === 'Native Shell')!;
    expect(nativeNode.parentId).toBe(archNode.id);

    const fsNode = result.nodes.find((n) => n.text === 'File System')!;
    expect(fsNode.parentId).toBe(nativeNode.id);
  });

  it('strips markdown bullets and numbered list prefixes to keep canonical text pure', () => {
    const bulletText = `
- Core Requirements
  * Data Validation
  * Container Packaging
1. Desktop Integrations
  a. Autosave Engine
  b. File Associations
`;
    const result = parseMultilineToTree(bulletText, 'root_0');
    expect(result.nodes.length).toBe(6);

    // Text must be stripped of bullet characters
    const texts = result.nodes.map((n) => n.text);
    expect(texts).toContain('Core Requirements');
    expect(texts).toContain('Data Validation');
    expect(texts).toContain('Container Packaging');
    expect(texts).toContain('Desktop Integrations');
    expect(texts).toContain('Autosave Engine');
    expect(texts).toContain('File Associations');

    // Verify none contain bullet markers
    for (const t of texts) {
      expect(t).not.toMatch(/^[-*•1-9a-zA-Z][.)]\s/);
    }
  });

  it('returns empty structure when given empty or whitespace text', () => {
    expect(parseMultilineToTree('', 'parent').nodes.length).toBe(0);
    expect(parseMultilineToTree('   \n\n  \t  ', 'parent').nodes.length).toBe(0);
  });
});

describe('Milestone 2: Dynamic Branch / List Numbering Engine', () => {
  it('formats indices accurately across decimal, alpha, roman, and bullet tiers', () => {
    // Decimal
    expect(formatIndexToStyle(0, 'decimal')).toBe('1.');
    expect(formatIndexToStyle(3, 'decimal')).toBe('4.');

    // Alpha
    expect(formatIndexToStyle(0, 'alpha')).toBe('A.');
    expect(formatIndexToStyle(1, 'alpha')).toBe('B.');
    expect(formatIndexToStyle(25, 'alpha')).toBe('Z.');

    // Roman
    expect(formatIndexToStyle(0, 'roman')).toBe('I.');
    expect(formatIndexToStyle(3, 'roman')).toBe('IV.');
    expect(formatIndexToStyle(8, 'roman')).toBe('IX.');

    // Bullets
    expect(formatIndexToStyle(0, 'bullet')).toBe('•');
    expect(formatIndexToStyle(1, 'bullet')).toBe('▪');

    // None
    expect(formatIndexToStyle(0, 'none')).toBe('');
  });

  it('computes hierarchical numbering badges dynamically across document levels', () => {
    const doc = createEmptyDocument('Numbering Spec', 'mindmap');
    const rootId = doc.nodes[0].id;

    // Add Level 1 children
    const l1_1: CanonicalNode = { id: 'l1_1', text: 'Market Overview', geometry: { x: 0, y: 0 }, parentId: rootId };
    const l1_2: CanonicalNode = { id: 'l1_2', text: 'Financial Plan', geometry: { x: 0, y: 0 }, parentId: rootId };

    // Add Level 2 children under l1_1
    const l2_1: CanonicalNode = { id: 'l2_1', text: 'Competitor Matrix', geometry: { x: 0, y: 0 }, parentId: 'l1_1' };
    const l2_2: CanonicalNode = { id: 'l2_2', text: 'User Personas', geometry: { x: 0, y: 0 }, parentId: 'l1_1' };

    doc.nodes.push(l1_1, l1_2, l2_1, l2_2);

    const badgeMap = computeDocumentNumbering(doc);

    // Root should have no badge
    expect(badgeMap.has(rootId)).toBe(false);

    // Level 1: decimal (1., 2.)
    expect(badgeMap.get('l1_1')).toBe('1.');
    expect(badgeMap.get('l1_2')).toBe('2.');

    // Level 2: alpha (A., B.)
    expect(badgeMap.get('l2_1')).toBe('A.');
    expect(badgeMap.get('l2_2')).toBe('B.');

    // Verify pure node text is never mutated
    expect(doc.nodes.find((n) => n.id === 'l1_1')!.text).toBe('Market Overview');
    expect(doc.nodes.find((n) => n.id === 'l2_1')!.text).toBe('Competitor Matrix');
  });

  it('dynamically renumbers siblings when a new node is inserted or reordered', () => {
    const doc = createEmptyDocument('Renumbering Spec', 'mindmap');
    const rootId = doc.nodes[0].id;

    doc.nodes.push(
      { id: 'item_a', text: 'Task A', geometry: { x: 0, y: 0 }, parentId: rootId },
      { id: 'item_b', text: 'Task B', geometry: { x: 0, y: 0 }, parentId: rootId }
    );

    let badgeMap = computeDocumentNumbering(doc);
    expect(badgeMap.get('item_a')).toBe('1.');
    expect(badgeMap.get('item_b')).toBe('2.');

    // Insert new item between item_a and item_b
    const item_new: CanonicalNode = { id: 'item_middle', text: 'New Priority', geometry: { x: 0, y: 0 }, parentId: rootId };
    doc.nodes.splice(2, 0, item_new); // inserted at index 2 (between item_a and item_b)

    badgeMap = computeDocumentNumbering(doc);
    expect(badgeMap.get('item_a')).toBe('1.');
    expect(badgeMap.get('item_middle')).toBe('2.');
    expect(badgeMap.get('item_b')).toBe('3.'); // Automatically shifted to 3.!
  });
});

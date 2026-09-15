import fs from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { autoLayoutDocument } from '../model/layout';
import { importFromMarkdown, importFromOPML } from '../model/importers';
import { CanonicalDocument, CanonicalNode } from '../model/types';

function byId(doc: CanonicalDocument): Map<string, CanonicalNode> {
  return new Map(doc.nodes.map((n) => [n.id, n]));
}

function rootOf(doc: CanonicalDocument): CanonicalNode {
  return doc.nodes.find((n) => n.type === 'root') || doc.nodes.find((n) => !n.parentId) || doc.nodes[0];
}

function createBalancedDispatchFixture(): CanonicalDocument {
  const doc = createEmptyDocument(
    'A deliberately long root title that must grow under the V2 text-aware layout dispatch',
    'mindmap'
  );
  doc.nodes = [
    {
      id: 'root',
      type: 'root',
      text: doc.title,
      geometry: { x: 0, y: 0, width: 160, height: 48 },
    },
    { id: 'left-or-right-a', parentId: 'root', text: 'First Branch', geometry: { x: 0, y: 0, width: 140, height: 40 } },
    { id: 'left-or-right-b', parentId: 'root', text: 'Second Branch', geometry: { x: 0, y: 0, width: 140, height: 40 } },
  ];
  doc.edges = [
    { id: 'root->left-or-right-a', source: 'root', target: 'left-or-right-a' },
    { id: 'root->left-or-right-b', source: 'root', target: 'left-or-right-b' },
  ];
  return doc;
}

function importSpecifiers(filePath: string): string[] {
  const sourceText = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const specifiers: string[] = [];

  sourceFile.forEachChild((node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
  });

  return specifiers;
}

function importedNamesFrom(filePath: string, moduleSpecifier: string): string[] {
  const sourceText = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names: string[] = [];

  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
    if (node.moduleSpecifier.text !== moduleSpecifier) return;
    const namedBindings = node.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) return;
    namedBindings.elements.forEach((element) => names.push(element.name.text));
  });

  return names;
}

describe('M1-B live layout dispatch integration', () => {
  it('routes balanced mind maps through V2 from autoLayoutDocument', () => {
    const layouted = autoLayoutDocument(createBalancedDispatchFixture(), { preset: 'balanced' });
    expect(rootOf(layouted).geometry.height).toBeGreaterThan(48);
  });

  it('routes Markdown import through the same balanced V2 dispatch seam', () => {
    const doc = importFromMarkdown(`
# A deliberately long imported Markdown root title that should wrap into multiple lines after real-path layout
- First branch
  - Nested child
- Second branch
`);

    expect(rootOf(doc).geometry.height).toBeGreaterThan(48);
  });

  it('routes OPML import through the same balanced V2 dispatch seam', () => {
    const doc = importFromOPML(`
<opml version="2.0">
  <head><title>A deliberately long imported OPML root title that should wrap into multiple lines after real-path layout</title></head>
  <body>
    <outline text="First branch"><outline text="Nested child" /></outline>
    <outline text="Second branch" />
  </body>
</opml>
`);

    expect(rootOf(doc).geometry.height).toBeGreaterThan(48);
  });

  it('keeps flowchart dispatch on Dagre', () => {
    const doc = createEmptyDocument('Flowchart dispatch stays Dagre', 'flowchart');
    doc.nodes = [
      { id: 'a', text: 'A', geometry: { x: 0, y: 0, width: 160, height: 48 } },
      { id: 'b', text: 'B', geometry: { x: 0, y: 0, width: 160, height: 48 } },
    ];
    doc.edges = [{ id: 'a->b', source: 'a', target: 'b' }];

    const layouted = autoLayoutDocument(doc);
    const nodes = byId(layouted);
    expect(nodes.get('b')!.geometry.y).toBeGreaterThan(nodes.get('a')!.geometry.y);
  });

  it('keeps single-direction LR/RL/TB mind-map presets on the legacy layout adapter', () => {
    const lr = autoLayoutDocument(createBalancedDispatchFixture(), { preset: 'LR', centerCoordinates: { x: 300, y: 300 } });
    const rl = autoLayoutDocument(createBalancedDispatchFixture(), { preset: 'RL', centerCoordinates: { x: 300, y: 300 } });
    const tb = autoLayoutDocument(createBalancedDispatchFixture(), { preset: 'TB', centerCoordinates: { x: 300, y: 300 } });

    const lrRoot = rootOf(lr);
    const rlRoot = rootOf(rl);
    const tbRoot = rootOf(tb);
    const lrChildren = lr.nodes.filter((n) => n.parentId === lrRoot.id);
    const rlChildren = rl.nodes.filter((n) => n.parentId === rlRoot.id);
    const tbChildren = tb.nodes.filter((n) => n.parentId === tbRoot.id);

    expect(lrRoot.geometry.height).toBe(48);
    expect(lrChildren.every((child) => child.geometry.x > lrRoot.geometry.x)).toBe(true);
    expect(rlChildren.every((child) => child.geometry.x < rlRoot.geometry.x)).toBe(true);
    expect(tbChildren.every((child) => child.geometry.y > tbRoot.geometry.y)).toBe(true);
  });

  it('keeps legacy direction-option compatibility for LR/RL/TB callers', () => {
    const layouted = autoLayoutDocument(createBalancedDispatchFixture(), {
      direction: 'LR',
      centerCoordinates: { x: 300, y: 300 },
    });
    const root = rootOf(layouted);
    const children = layouted.nodes.filter((n) => n.parentId === root.id);

    expect(root.geometry.height).toBe(48);
    expect(children.every((child) => child.geometry.x > root.geometry.x)).toBe(true);
  });

  it('keeps collapsed hidden descendants out of real-path balanced layout calculations', () => {
    const doc = createEmptyDocument('Hidden width dispatch test', 'mindmap');
    doc.nodes = [
      { id: 'root', type: 'root', text: 'Root', geometry: { x: 0, y: 0 } },
      { id: 'heavy', parentId: 'root', text: 'Heavy Branch', geometry: { x: 0, y: 0 } },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `heavy-child-${i}`,
        parentId: 'heavy',
        text: `Heavy Child ${i}`,
        geometry: { x: 0, y: 0 },
      })),
      { id: 'collapsed-parent', parentId: 'root', text: 'Collapsed Parent', collapsed: true, geometry: { x: 0, y: 0 } },
      { id: 'hidden-wide', parentId: 'collapsed-parent', text: 'Hidden Wide', geometry: { x: 0, y: 0, width: 2200, height: 44 } },
      { id: 'visible-parent', parentId: 'root', text: 'Visible Parent', geometry: { x: 0, y: 0 } },
      { id: 'visible-child', parentId: 'visible-parent', text: 'Normal', geometry: { x: 0, y: 0 } },
      { id: 'visible-grandchild', parentId: 'visible-child', text: 'Normal Grandchild', geometry: { x: 0, y: 0 } },
    ];
    doc.edges = [
      { id: 'root->heavy', source: 'root', target: 'heavy' },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `heavy->heavy-child-${i}`, source: 'heavy', target: `heavy-child-${i}` })),
      { id: 'root->collapsed-parent', source: 'root', target: 'collapsed-parent' },
      { id: 'collapsed-parent->hidden-wide', source: 'collapsed-parent', target: 'hidden-wide' },
      { id: 'root->visible-parent', source: 'root', target: 'visible-parent' },
      { id: 'visible-parent->visible-child', source: 'visible-parent', target: 'visible-child' },
      { id: 'visible-child->visible-grandchild', source: 'visible-child', target: 'visible-grandchild' },
    ];

    const layouted = autoLayoutDocument(doc, { preset: 'balanced' });
    const nodes = byId(layouted);
    const root = rootOf(layouted);
    const visibleParent = nodes.get('visible-parent')!;
    const collapsedParent = nodes.get('collapsed-parent')!;
    const sideOf = (node: CanonicalNode) => (node.geometry.x >= root.geometry.x ? 'right' : 'left');
    expect(sideOf(visibleParent)).toBe(sideOf(collapsedParent));

    const side = sideOf(visibleParent);
    const nearEdge = (node: CanonicalNode) =>
      side === 'right' ? node.geometry.x : node.geometry.x + (node.geometry.width || 150);
    const visibleChild = nodes.get('visible-child')!;
    const visibleGrandchild = nodes.get('visible-grandchild')!;
    expect(Math.abs(nearEdge(visibleGrandchild) - nearEdge(visibleChild))).toBeLessThan(400);
    expect(nodes.get('hidden-wide')!.geometry).toEqual(byId(doc).get('hidden-wide')!.geometry);
  });

  it('keeps the V2 engine dependency one-way from the dispatch module', () => {
    const modelDir = path.join(__dirname, '..', 'model');
    const layoutImports = importSpecifiers(path.join(modelDir, 'layout.ts'));
    const engineImports = importSpecifiers(path.join(modelDir, 'mindMapLayoutEngine.ts'));
    const importerLayoutNames = importedNamesFrom(path.join(modelDir, 'importers.ts'), './layout');

    expect(layoutImports).toContain('./mindMapLayoutEngine');
    expect(engineImports).not.toContain('./layout');
    expect(engineImports).not.toContain('./importers');
    expect(importerLayoutNames).toContain('autoLayoutDocument');
    expect(importerLayoutNames).not.toContain('layoutMindMapDocument');
  });
});

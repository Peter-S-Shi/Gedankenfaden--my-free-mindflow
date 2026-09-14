import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { canonicalToReactFlow, reactFlowToCanonical } from '../model/adapter';
import { autoLayoutDocument } from '../model/layout';
import {
  computeCanonicalDepthMap,
  toggleNodeFold,
  collapseAllTopLevelTopics,
  expandAllTopics,
  expandToLevel,
} from '../model/hierarchyVisibility';
import { CanonicalDocument, CanonicalNode } from '../model/types';

function addNode(doc: CanonicalDocument, id: string, parentId: string, text = id) {
  const node: CanonicalNode = {
    id,
    text,
    parentId,
    geometry: { x: 0, y: 0, width: 120, height: 44 },
  };
  doc.nodes.push(node);
  doc.edges.push({ id: `${parentId}->${id}`, source: parentId, target: id });
}

/** root -> A (a1, a2, a3) ; root -> B (b1) -- a mixed-depth fixture. */
function buildFixture(): CanonicalDocument {
  const doc = createEmptyDocument('M3 fixture', 'mindmap');
  const rootId = doc.nodes[0].id;
  addNode(doc, 'A', rootId);
  addNode(doc, 'B', rootId);
  addNode(doc, 'a1', 'A');
  addNode(doc, 'a2', 'A');
  addNode(doc, 'a3', 'A');
  addNode(doc, 'a1x', 'a1');
  addNode(doc, 'b1', 'B');
  return doc;
}

describe('M3 Behavior Correction: numbering round-trip (evidence 04)', () => {
  it('survives a reactFlowToCanonical round-trip (drag-sync / auto-layout-switch / save)', () => {
    const doc = buildFixture();
    const rootId = doc.nodes[0].id;
    const numbered: CanonicalDocument = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === rootId ? { ...n, numbering: { level1Style: 'decimal' as const, maxDepth: 3 } } : n)),
    };

    const projected = canonicalToReactFlow(numbered);
    const roundTripped = reactFlowToCanonical(projected.nodes, projected.edges, numbered);

    const roundTrippedRoot = roundTripped.nodes.find((n) => n.id === rootId);
    expect(roundTrippedRoot?.numbering).toEqual({ level1Style: 'decimal', maxDepth: 3 });

    const badgeMap = canonicalToReactFlow(roundTripped).nodes.reduce<Record<string, unknown>>((acc, n) => {
      acc[n.id] = n.data.numberingBadge;
      return acc;
    }, {});
    expect(badgeMap['A']).toBe('1.');
    expect(badgeMap['B']).toBe('2.');
  });

  it('survives Auto Layout (the exact path that previously stripped it)', () => {
    const doc = buildFixture();
    const rootId = doc.nodes[0].id;
    const numbered: CanonicalDocument = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === rootId ? { ...n, numbering: { level1Style: 'decimal' as const, maxDepth: 3 } } : n)),
    };

    // Mirrors handleAutoLayoutWithPreset: reactFlowToCanonical(nodes, edges, doc) -> autoLayoutDocument.
    const projected = canonicalToReactFlow(numbered);
    const currentDoc = reactFlowToCanonical(projected.nodes, projected.edges, numbered);
    const layouted = autoLayoutDocument(currentDoc, { preset: 'balanced' });

    expect(layouted.nodes.find((n) => n.id === rootId)?.numbering).toEqual({ level1Style: 'decimal', maxDepth: 3 });
  });
});

describe('M3 Behavior Correction: collapse/expand reclaim (evidence 01/02/03)', () => {
  it('collapsing a branch with descendants shrinks the visible layout height, not just hides nodes', () => {
    const doc = buildFixture();
    const baseline = autoLayoutDocument(doc, { preset: 'balanced' });
    const baselineYs = baseline.nodes.map((n) => n.geometry.y);
    const baselineSpread = Math.max(...baselineYs) - Math.min(...baselineYs);

    const collapsedDoc: CanonicalDocument = {
      ...baseline,
      nodes: toggleNodeFold(baseline.nodes, 'A'),
    };
    // Not stabilized against baseline -- this is the fix under test.
    const relayouted = autoLayoutDocument(collapsedDoc, { preset: 'balanced' });
    const visibleYs = relayouted.nodes
      .filter((n) => !['a1', 'a2', 'a3', 'a1x'].includes(n.id))
      .map((n) => n.geometry.y);
    const relayoutedSpread = Math.max(...visibleYs) - Math.min(...visibleYs);

    expect(relayoutedSpread).toBeLessThan(baselineSpread);
  });

  it('expanding a previously-collapsed branch does not leave children at a stale, far-away position', () => {
    const doc = buildFixture();
    const collapsedDoc: CanonicalDocument = { ...doc, nodes: toggleNodeFold(doc.nodes, 'A') };
    const collapsedLayout = autoLayoutDocument(collapsedDoc, { preset: 'balanced' });

    const expandedDoc: CanonicalDocument = { ...collapsedLayout, nodes: toggleNodeFold(collapsedLayout.nodes, 'A') };
    const expandedLayout = autoLayoutDocument(expandedDoc, { preset: 'balanced' });

    const parentA = expandedLayout.nodes.find((n) => n.id === 'A')!;
    const centerOf = (n: CanonicalNode) => ({
      x: n.geometry.x + (n.geometry.width ?? 0) / 2,
      y: n.geometry.y + (n.geometry.height ?? 0) / 2,
    });
    for (const childId of ['a1', 'a2', 'a3']) {
      const child = expandedLayout.nodes.find((n) => n.id === childId)!;
      // Freshly packed next to its parent, not stuck at some unrelated stale y.
      expect(Math.abs(child.geometry.y - parentA.geometry.y)).toBeLessThan(400);

      // Contract 3.9: "no extreme-length hierarchy edge should survive from
      // old geometry" -- check the actual A->child edge length (not just
      // y-proximity), since a stale-position bug could still produce a long
      // diagonal edge even with a small y delta.
      const cA = centerOf(parentA);
      const cChild = centerOf(child);
      const edgeLength = Math.hypot(cChild.x - cA.x, cChild.y - cA.y);
      expect(edgeLength).toBeLessThan(500);
    }
  });

  it('a collapse/reveal round-trip after expandToLevel does not leak a deeper stale-open node', () => {
    const doc = buildFixture();
    // expandToLevel(2) makes a1 (which has its own child a1x) the frontier.
    let nodes = expandToLevel(doc.nodes, 2);
    expect(new Map(nodes.map((n) => [n.id, n])).get('a1')?.collapsed).toBe(true);

    // A full collapse/reveal round-trip on A (a level above the frontier)
    // must re-derive a1 as the frontier again, not leave it (or anything
    // beneath it) stuck open from the earlier expandToLevel call.
    nodes = toggleNodeFold(nodes, 'A');
    nodes = toggleNodeFold(nodes, 'A');

    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get('a1')?.collapsed).toBe(true);

    const projected = canonicalToReactFlow({ ...doc, nodes });
    const a1x = projected.nodes.find((n) => n.id === 'a1x')!;
    expect(a1x.hidden).toBe(true);
  });
});

describe('M3 Behavior Correction: total hidden-descendant count (contract 3.7)', () => {
  it('reports the whole hidden subtree, not just direct children', () => {
    const doc = buildFixture();
    const collapsedDoc: CanonicalDocument = { ...doc, nodes: doc.nodes.map((n) => (n.id === 'A' ? { ...n, collapsed: true } : n)) };

    const projected = canonicalToReactFlow(collapsedDoc);
    const nodeA = projected.nodes.find((n) => n.id === 'A')!;

    // A's direct children: a1, a2, a3 (3). Total descendants: + a1x = 4.
    expect(nodeA.data.childCount).toBe(3);
    expect(nodeA.data.hiddenDescendantCount).toBe(4);
  });
});

describe('M3 Behavior Correction: progressive one-level reveal (contract 3.2/3.7)', () => {
  it('reveals only direct children, re-collapsing any that themselves have children', () => {
    const doc = buildFixture();
    const collapsedDoc = doc.nodes.map((n) => (n.id === 'A' ? { ...n, collapsed: true } : n));

    const revealed = toggleNodeFold(collapsedDoc, 'A');
    const byId = new Map(revealed.map((n) => [n.id, n]));

    expect(byId.get('A')?.collapsed).toBe(false);
    // a1 has a child (a1x) -> becomes the new frontier, collapsed.
    expect(byId.get('a1')?.collapsed).toBe(true);
    // a2/a3 are leaves -> nothing further to hide.
    expect(byId.get('a2')?.collapsed).toBeFalsy();
    expect(byId.get('a3')?.collapsed).toBeFalsy();
  });

  it('walks down one level at a time on repeated reveals', () => {
    const doc = buildFixture();
    let nodes = doc.nodes.map((n) => (n.id === 'A' ? { ...n, collapsed: true } : n));
    nodes = toggleNodeFold(nodes, 'A');
    let byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get('a1')?.collapsed).toBe(true);
    expect(byId.get('a1x')?.collapsed).toBeFalsy();

    nodes = toggleNodeFold(nodes, 'a1');
    byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get('a1')?.collapsed).toBe(false);
    expect(byId.get('a1x')?.collapsed).toBeFalsy();
  });
});

describe('M3 Behavior Correction: document-level structure commands (contract 3.3-3.6)', () => {
  it('collapseAllTopLevelTopics collapses every depth-1 topic that has children, leaves leaves alone', () => {
    const doc = buildFixture();
    const next = collapseAllTopLevelTopics(doc.nodes);
    const byId = new Map(next.map((n) => [n.id, n]));
    expect(byId.get('A')?.collapsed).toBe(true);
    expect(byId.get('B')?.collapsed).toBe(true);
    // depth-1 leaves and deeper nodes are untouched by this command.
    expect(byId.get('a1')?.collapsed).toBeFalsy();
  });

  it('expandAllTopics clears every collapsed flag', () => {
    const doc = buildFixture();
    const collapsed = collapseAllTopLevelTopics(doc.nodes).map((n) => (n.id === 'a1' ? { ...n, collapsed: true } : n));
    const next = expandAllTopics(collapsed);
    expect(next.every((n) => !n.collapsed)).toBe(true);
  });

  it('expandToLevel(1) matches collapseAllTopLevelTopics (root + first-level visible)', () => {
    const doc = buildFixture();
    const viaLevel = expandToLevel(doc.nodes, 1);
    const viaCollapseAll = collapseAllTopLevelTopics(doc.nodes);
    const collapsedIdsA = viaLevel.filter((n) => n.collapsed).map((n) => n.id).sort();
    const collapsedIdsB = viaCollapseAll.filter((n) => n.collapsed).map((n) => n.id).sort();
    expect(collapsedIdsA).toEqual(collapsedIdsB);
  });

  it('expandToLevel(2) reveals depth 1 and 2, collapses the depth-2 frontier that has children', () => {
    const doc = buildFixture();
    const next = expandToLevel(doc.nodes, 2);
    const byId = new Map(next.map((n) => [n.id, n]));
    expect(byId.get('A')?.collapsed).toBeFalsy();
    expect(byId.get('B')?.collapsed).toBeFalsy();
    expect(byId.get('a1')?.collapsed).toBe(true); // a1 has a child (a1x) -> frontier
    expect(byId.get('a2')?.collapsed).toBeFalsy(); // leaf, nothing to collapse
    expect(byId.get('b1')?.collapsed).toBeFalsy(); // leaf
  });

  it('computeCanonicalDepthMap uses parentId, not rendered position', () => {
    const doc = buildFixture();
    // Decoy: give a1x a wild geometry.y far from its ancestors.
    const decoyed = doc.nodes.map((n) => (n.id === 'a1x' ? { ...n, geometry: { ...n.geometry, y: 99999 } } : n));
    const depthMap = computeCanonicalDepthMap(decoyed);
    expect(depthMap.get(doc.nodes[0].id)).toBe(0);
    expect(depthMap.get('A')).toBe(1);
    expect(depthMap.get('a1')).toBe(2);
    expect(depthMap.get('a1x')).toBe(3);
  });
});

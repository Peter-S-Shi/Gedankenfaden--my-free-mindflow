import { describe, expect, it } from 'vitest';
import {
  findReparentCapture,
  applyReparent,
  applyDetachedDrop,
  updateHierarchyEdgesForReparent,
  removeIncomingHierarchyEdge,
  REPARENT_CAPTURE_MARGIN,
} from '../model/reparentOnDrag';
import { buildChildrenIdsByParent } from '../model/dragSubtree';
import { autoLayoutDocument } from '../model/layout';
import { CanonicalDocument, CanonicalNode } from '../model/types';

function node(id: string, parentId: string | undefined, x: number, y: number, w = 120, h = 44): CanonicalNode {
  return { id, text: id, parentId, geometry: { x, y, width: w, height: h } };
}

/**
 * root(0,0) -> A(200,0) -> a1(400,0)
 *           -> B(200,300)
 * A and B are separate branches, far apart; a1 is A's own child.
 */
function buildFixture(): CanonicalNode[] {
  return [
    node('root', undefined, 0, 0),
    node('A', 'root', 200, 0),
    node('a1', 'A', 400, 0),
    node('B', 'root', 200, 300),
  ];
}

describe('M3: findReparentCapture', () => {
  it('captures under a nearby node whose zone the live position entered', () => {
    const nodes = buildFixture();
    const childrenIdsByParent = buildChildrenIdsByParent(nodes);
    // Drag a1 (currently under A) right on top of B.
    const liveBox = { x: 200, y: 300, width: 120, height: 44 };
    expect(findReparentCapture(nodes, 'a1', liveBox, childrenIdsByParent)).toEqual({ parentId: 'B' });
  });

  it('returns null when the live position is not near any capturable node', () => {
    const nodes = buildFixture();
    const childrenIdsByParent = buildChildrenIdsByParent(nodes);
    const liveBox = { x: 2000, y: 2000, width: 120, height: 44 };
    expect(findReparentCapture(nodes, 'a1', liveBox, childrenIdsByParent)).toBeNull();
  });

  it('excludes the node\'s own current parent (that would be a no-op, not a reparent)', () => {
    const nodes = buildFixture();
    const childrenIdsByParent = buildChildrenIdsByParent(nodes);
    // a1 barely moved -- still squarely inside A's own capture zone.
    const liveBox = { x: 205, y: 5, width: 120, height: 44 };
    expect(findReparentCapture(nodes, 'a1', liveBox, childrenIdsByParent)).toBeNull();
  });

  it('excludes the dragged node\'s own descendants (would create a cycle)', () => {
    const nodes = buildFixture();
    const childrenIdsByParent = buildChildrenIdsByParent(nodes);
    // Drag A on top of its own child a1's position.
    const liveBox = { x: 400, y: 0, width: 120, height: 44 };
    expect(findReparentCapture(nodes, 'A', liveBox, childrenIdsByParent)).toBeNull();
  });

  it('the root node (no parentId) can never be reparented', () => {
    const nodes = buildFixture();
    const childrenIdsByParent = buildChildrenIdsByParent(nodes);
    const liveBox = { x: 200, y: 0, width: 120, height: 44 };
    expect(findReparentCapture(nodes, 'root', liveBox, childrenIdsByParent)).toBeNull();
  });

  it('picks the nearest candidate when the live position is within range of more than one', () => {
    const nodes = [
      node('root', undefined, 0, 0),
      node('A', 'root', 200, 0),
      node('near', 'root', 500, 0),
      node('far', 'root', 500, 500),
    ];
    const childrenIdsByParent = buildChildrenIdsByParent(nodes);
    // Squarely on "near"; "far" is out of its own capture zone entirely at this position.
    const liveBox = { x: 500, y: 0, width: 120, height: 44 };
    expect(findReparentCapture(nodes, 'A', liveBox, childrenIdsByParent)).toEqual({ parentId: 'near' });
  });

  it('a position just outside the capture margin does not capture', () => {
    const nodes = buildFixture();
    const childrenIdsByParent = buildChildrenIdsByParent(nodes);
    // B is at (200,300) 120x44 -> zone bottom edge is 300+44+MARGIN.
    const justOutside = 300 + 44 + REPARENT_CAPTURE_MARGIN + 5;
    const liveBox = { x: 200, y: justOutside, width: 120, height: 44 };
    expect(findReparentCapture(nodes, 'a1', liveBox, childrenIdsByParent)).toBeNull();
  });

  it('shows a capture candidate when the dragged topic is near a target without overlapping it', () => {
    const nodes = buildFixture();
    const childrenIdsByParent = buildChildrenIdsByParent(nodes);
    // B occupies x=200..320, y=300..344. The dragged topic sits alongside
    // it with a 30px rectangle-to-rectangle gap; its centre is deliberately
    // outside the former centre-only capture zone.
    const liveBox = { x: 350, y: 300, width: 120, height: 44 };
    expect(findReparentCapture(nodes, 'a1', liveBox, childrenIdsByParent)).toEqual({ parentId: 'B' });
  });

  it('lets a deep node cross the central topic and be captured on its opposite side', () => {
    const nodes = [
      node('root', undefined, 400, 300, 160, 48),
      node('right-parent', 'root', 700, 300),
      node('deep-child', 'right-parent', 900, 300),
    ];
    nodes[0].type = 'root';
    const childrenIdsByParent = buildChildrenIdsByParent(nodes);

    expect(
      findReparentCapture(nodes, 'deep-child', { x: 120, y: 300, width: 120, height: 44 }, childrenIdsByParent)
    ).toEqual({ parentId: 'root', side: 'left' });
  });

  it('retains the drop side when the central topic itself wins the nearby capture search', () => {
    const nodes = [
      node('root', undefined, 400, 300, 160, 48),
      node('right-parent', 'root', 700, 300),
      node('deep-child', 'right-parent', 900, 300),
    ];
    nodes[0].type = 'root';
    const childrenIdsByParent = buildChildrenIdsByParent(nodes);

    expect(
      findReparentCapture(nodes, 'deep-child', { x: 360, y: 300, width: 120, height: 44 }, childrenIdsByParent)
    ).toEqual({ parentId: 'root', side: 'left' });
  });
});

describe('M3: applyReparent', () => {
  it('updates parentId and clears any stale manualOffset', () => {
    const nodes = buildFixture().map((n) => (n.id === 'a1' ? { ...n, manualOffset: { dx: 12, dy: -6 } } : n));
    const next = applyReparent(nodes, 'a1', { parentId: 'B' });
    const a1 = next.find((n) => n.id === 'a1')!;
    expect(a1.parentId).toBe('B');
    expect(a1.manualOffset).toBeUndefined();
  });

  it('leaves every other node untouched', () => {
    const nodes = buildFixture();
    const next = applyReparent(nodes, 'a1', { parentId: 'B' });
    for (const id of ['root', 'A', 'B']) {
      expect(next.find((n) => n.id === id)).toEqual(nodes.find((n) => n.id === id));
    }
  });

  it('persists an opposite-side root capture so layout cannot rebalance it back', () => {
    const nodes = buildFixture();
    nodes[0].type = 'root';
    const reparented = applyReparent(nodes, 'a1', { parentId: 'root', side: 'left' });
    const doc: CanonicalDocument = {
      schemaVersion: '1.0', id: 'doc', title: 'doc', mode: 'mindmap', createdAt: '', updatedAt: '',
      viewport: { x: 0, y: 0, zoom: 1 },
      theme: { paletteId: 'default', canvasBackground: 'blank', fontFamily: 'sans-serif', defaultEdgeRouting: 'smoothstep' },
      nodes: reparented,
      edges: reparented.filter((n) => n.parentId).map((n) => ({ id: `${n.parentId}->${n.id}`, source: n.parentId!, target: n.id })),
      groups: [],
    };
    const layouted = autoLayoutDocument(doc, { preset: 'balanced' });
    const root = layouted.nodes.find((n) => n.id === 'root')!;
    const moved = layouted.nodes.find((n) => n.id === 'a1')!;
    expect(moved.parentId).toBe('root');
    expect(moved.geometry.x + (moved.geometry.width ?? 0)).toBeLessThan(root.geometry.x);
  });

  it('treats an explicit side flip as a move even when incremental stabilization is enabled', () => {
    const nodes = [node('root', undefined, 400, 300, 160, 48), node('branch', 'root', 650, 300)];
    nodes[0].type = 'root';
    const base: CanonicalDocument = {
      schemaVersion: '1.0', id: 'doc', title: 'doc', mode: 'mindmap', createdAt: '', updatedAt: '',
      viewport: { x: 0, y: 0, zoom: 1 },
      theme: { paletteId: 'default', canvasBackground: 'blank', fontFamily: 'sans-serif', defaultEdgeRouting: 'smoothstep' },
      nodes,
      edges: [{ id: 'root->branch', source: 'root', target: 'branch' }],
      groups: [],
    };
    const changed = { ...base, nodes: applyReparent(base.nodes, 'branch', { parentId: 'root', side: 'left' }) };
    const layouted = autoLayoutDocument(changed, { preset: 'balanced', stabilizeAgainst: base });
    const root = layouted.nodes.find((n) => n.id === 'root')!;
    const branch = layouted.nodes.find((n) => n.id === 'branch')!;
    expect(branch.geometry.x + (branch.geometry.width ?? 0)).toBeLessThan(root.geometry.x);
  });

  it('detaches an uncaptured node at the drop position while preserving its descendant hierarchy', () => {
    const nodes = [...buildFixture(), node('a1-child', 'a1', 600, 0)];
    const dropped = applyDetachedDrop(nodes, 'a1', { x: 1400, y: 900, width: 120, height: 44 });
    const moved = dropped.find((n) => n.id === 'a1')!;
    expect(moved.parentId).toBeUndefined();
    expect(moved.geometry).toMatchObject({ x: 1400, y: 900 });
    expect(dropped.find((n) => n.id === 'a1-child')?.parentId).toBe('a1');
  });

  it('rewrites the dragged hierarchy edge to the new parent and leaves descendant edges intact', () => {
    const edges = [
      { id: 'A->a1', source: 'A', target: 'a1' },
      { id: 'a1->child', source: 'a1', target: 'child' },
    ];
    const next = updateHierarchyEdgesForReparent(edges, 'a1', 'A', 'B');
    expect(next).toContainEqual(expect.objectContaining({ source: 'B', target: 'a1' }));
    expect(next).toContainEqual(edges[1]);
  });

  it('removes only the incoming hierarchy edge when a subtree becomes free-standing', () => {
    const edges = [
      { id: 'A->a1', source: 'A', target: 'a1' },
      { id: 'a1->child', source: 'a1', target: 'child' },
    ];
    expect(removeIncomingHierarchyEdge(edges, 'a1', 'A')).toEqual([edges[1]]);
  });

  it('creates a hierarchy edge when a previously free topic is captured', () => {
    expect(updateHierarchyEdgesForReparent([], 'free', undefined, 'B')).toEqual([
      { id: 'edge_B_free', source: 'B', target: 'free', type: 'smoothstep' },
    ]);
  });
});

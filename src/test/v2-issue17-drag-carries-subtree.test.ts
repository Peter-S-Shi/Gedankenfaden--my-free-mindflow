/**
 * Ticket #17: dragging a parent node in mind-map mode previously moved only
 * that node -- React Flow's onNodesChange only reports a position change for
 * the node actually dragged, so children visibly detached and stayed
 * behind. carryDescendantsWithDraggedParents shifts every descendant of a
 * dragged node by the same delta, keeping the subtree structurally intact.
 */
import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import {
  buildChildrenIdsByParent,
  carryDescendantsWithDraggedParents,
  collectDescendantIds,
} from '../model/dragSubtree';

type TestNode = Node<{ label: string }>;

function node(id: string, x: number, y: number): TestNode {
  return { id, type: 'customNode', position: { x, y }, data: { label: id } };
}

describe('#17 dragging a parent carries its descendant subtree', () => {
  const nodesModel = [
    { id: 'root' },
    { id: 'parent', parentId: 'root' },
    { id: 'child-a', parentId: 'parent' },
    { id: 'child-b', parentId: 'parent' },
    { id: 'grandchild', parentId: 'child-a' },
    { id: 'unrelated', parentId: 'root' },
  ];
  const childrenIdsByParent = buildChildrenIdsByParent(nodesModel);

  it('collects the full multi-level descendant set of a dragged node', () => {
    const descendants = collectDescendantIds('parent', childrenIdsByParent).sort();
    expect(descendants).toEqual(['child-a', 'child-b', 'grandchild'].sort());
  });

  it('shifts every descendant by the same delta as the dragged parent, leaving unrelated nodes untouched', () => {
    const before: TestNode[] = [
      node('root', 0, 0),
      node('parent', 100, 100),
      node('child-a', 200, 80),
      node('child-b', 200, 120),
      node('grandchild', 300, 80),
      node('unrelated', 0, 200),
    ];

    // Simulate React Flow's applyNodeChanges already having moved only
    // "parent" to its new position; everything else is untouched so far.
    const afterApplyNodeChanges: TestNode[] = before.map((n) =>
      n.id === 'parent' ? { ...n, position: { x: 140, y: 130 } } : n
    );

    const result = carryDescendantsWithDraggedParents(
      before,
      afterApplyNodeChanges,
      [{ id: 'parent', position: { x: 140, y: 130 } }],
      childrenIdsByParent
    );

    const byId = new Map(result.map((n) => [n.id, n.position]));
    // dx=+40, dy=+30
    expect(byId.get('parent')).toEqual({ x: 140, y: 130 });
    expect(byId.get('child-a')).toEqual({ x: 240, y: 110 });
    expect(byId.get('child-b')).toEqual({ x: 240, y: 150 });
    expect(byId.get('grandchild')).toEqual({ x: 340, y: 110 });

    // Root and the unrelated sibling branch never moved.
    expect(byId.get('root')).toEqual({ x: 0, y: 0 });
    expect(byId.get('unrelated')).toEqual({ x: 0, y: 200 });
  });

  it('preserves a descendant\'s own prior manual offset relative to the dragged parent', () => {
    // "child-a" was previously dragged by the user to a custom spot, unlike
    // its sibling "child-b" which is still at its auto-laid-out position.
    const before: TestNode[] = [
      node('parent', 100, 100),
      node('child-a', 260, 260), // manually offset further away by the user
      node('child-b', 200, 120),
    ];
    const afterApplyNodeChanges: TestNode[] = before.map((n) =>
      n.id === 'parent' ? { ...n, position: { x: 100, y: 200 } } : n
    );

    const result = carryDescendantsWithDraggedParents(
      before,
      afterApplyNodeChanges,
      [{ id: 'parent', position: { x: 100, y: 200 } }],
      buildChildrenIdsByParent([{ id: 'parent' }, { id: 'child-a', parentId: 'parent' }, { id: 'child-b', parentId: 'parent' }])
    );

    const byId = new Map(result.map((n) => [n.id, n.position]));
    // dy=+100 applied uniformly -- child-a keeps its extra manual offset
    // relative to child-b, just shifted along with the parent.
    expect(byId.get('child-a')).toEqual({ x: 260, y: 360 });
    expect(byId.get('child-b')).toEqual({ x: 200, y: 220 });
  });

  it('does not move anything for a non-position change (e.g. select)', () => {
    const before: TestNode[] = [node('parent', 100, 100), node('child-a', 200, 100)];
    const result = carryDescendantsWithDraggedParents(
      before,
      before,
      [],
      buildChildrenIdsByParent([{ id: 'parent' }, { id: 'child-a', parentId: 'parent' }])
    );
    expect(result).toBe(before);
  });

  it('is a no-op for a leaf node drag (no descendants to carry)', () => {
    const before: TestNode[] = [node('parent', 100, 100), node('leaf', 200, 100)];
    const after: TestNode[] = before.map((n) => (n.id === 'leaf' ? { ...n, position: { x: 250, y: 100 } } : n));
    const result = carryDescendantsWithDraggedParents(
      before,
      after,
      [{ id: 'leaf', position: { x: 250, y: 100 } }],
      buildChildrenIdsByParent([{ id: 'parent' }, { id: 'leaf', parentId: 'parent' }])
    );
    expect(result.find((n) => n.id === 'parent')?.position).toEqual({ x: 100, y: 100 });
  });
});

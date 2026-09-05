import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../model/document';
import {
  createGroup,
  computeGroupBounds,
  translateGroup,
  addNodeToGroup,
  removeNodeFromGroup,
} from '../model/groups';
import { CanonicalNode } from '../model/types';

describe('Milestone 3: Visual Group Containers & Collective Translation', () => {
  it('creates group containers and computes accurate enclosing bounding boxes with padding', () => {
    const doc = createEmptyDocument('Group Spec', 'flowchart');
    const nodes: CanonicalNode[] = [
      { id: 'n1', text: 'Step 1', geometry: { x: 100, y: 100, width: 140, height: 44 } },
      { id: 'n2', text: 'Step 2', geometry: { x: 300, y: 200, width: 160, height: 50 } },
    ];
    doc.nodes = nodes;

    const group = createGroup('Backend Pipeline', ['n1', 'n2'], doc.nodes);
    expect(group.title).toBe('Backend Pipeline');
    expect(group.nodeIds).toEqual(['n1', 'n2']);

    const bounds = computeGroupBounds(group, doc.nodes, 20, 30);
    // minX = 100 - 20 = 80
    expect(bounds.x).toBe(80);
    // minY = 100 - 20 - 30 = 50
    expect(bounds.y).toBe(50);
    // maxX = 300 + 160 = 460; width = 460 - 100 + 40 = 400
    expect(bounds.width).toBe(400);
    // maxY = 200 + 50 = 250; height = 250 - 100 + 40 + 30 = 220
    expect(bounds.height).toBe(220);
  });

  it('translates all enclosed member nodes collectively when group is moved', () => {
    const doc = createEmptyDocument('Translation Spec', 'flowchart');
    const nodes: CanonicalNode[] = [
      { id: 'member_1', text: 'M1', geometry: { x: 100, y: 100, width: 140, height: 44 } },
      { id: 'member_2', text: 'M2', geometry: { x: 250, y: 100, width: 140, height: 44 } },
      { id: 'outside', text: 'Outside', geometry: { x: 500, y: 500, width: 140, height: 44 } },
    ];
    doc.nodes = nodes;

    const group = createGroup('Cluster A', ['member_1', 'member_2'], doc.nodes);
    doc.groups = [group];

    // Move group by (+50, -30)
    const movedDoc = translateGroup(doc, group.id, 50, -30);

    const m1 = movedDoc.nodes.find((n) => n.id === 'member_1')!;
    const m2 = movedDoc.nodes.find((n) => n.id === 'member_2')!;
    const out = movedDoc.nodes.find((n) => n.id === 'outside')!;

    // Enclosed nodes must be translated by (+50, -30)
    expect(m1.geometry.x).toBe(150);
    expect(m1.geometry.y).toBe(70);
    expect(m2.geometry.x).toBe(300);
    expect(m2.geometry.y).toBe(70);

    // Non-member node must remain untouched
    expect(out.geometry.x).toBe(500);
    expect(out.geometry.y).toBe(500);
  });

  it('manages node membership dynamically with add and remove operations', () => {
    const group = createGroup('Dynamic Group', ['n1'], []);
    expect(group.nodeIds).toEqual(['n1']);

    const withN2 = addNodeToGroup(group, 'n2');
    expect(withN2.nodeIds).toEqual(['n1', 'n2']);

    const withoutN1 = removeNodeFromGroup(withN2, 'n1');
    expect(withoutN1.nodeIds).toEqual(['n2']);
  });
});

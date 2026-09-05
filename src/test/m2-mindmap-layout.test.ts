import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { layoutMindMapDocument } from '../model/layout';
import { canonicalToReactFlow } from '../model/adapter';
import { CanonicalNode } from '../model/types';

describe('Milestone 2: Centered Bidirectional Balanced Layout Engine', () => {
  it('balances level-1 children symmetrically into Right and Left wings around central root', () => {
    const doc = createEmptyDocument('Balanced Layout Spec', 'mindmap');
    const rootId = doc.nodes[0].id;

    // Add 4 top-level children
    const child1: CanonicalNode = {
      id: 'c1',
      text: 'Right Wing Topic 1',
      geometry: { x: 0, y: 0, width: 140, height: 44 },
      parentId: rootId,
    };
    const child2: CanonicalNode = {
      id: 'c2',
      text: 'Left Wing Topic 1',
      geometry: { x: 0, y: 0, width: 140, height: 44 },
      parentId: rootId,
    };
    const child3: CanonicalNode = {
      id: 'c3',
      text: 'Right Wing Topic 2',
      geometry: { x: 0, y: 0, width: 140, height: 44 },
      parentId: rootId,
    };
    const child4: CanonicalNode = {
      id: 'c4',
      text: 'Left Wing Topic 2',
      geometry: { x: 0, y: 0, width: 140, height: 44 },
      parentId: rootId,
    };

    doc.nodes.push(child1, child2, child3, child4);
    doc.edges.push(
      { id: 'e1', source: rootId, target: 'c1' },
      { id: 'e2', source: rootId, target: 'c2' },
      { id: 'e3', source: rootId, target: 'c3' },
      { id: 'e4', source: rootId, target: 'c4' }
    );

    const layouted = layoutMindMapDocument(doc, {
      preset: 'balanced',
      centerCoordinates: { x: 500, y: 400 },
    });

    const root = layouted.nodes.find((n) => n.id === rootId)!;
    expect(root.geometry.x).toBe(500);
    expect(root.geometry.y).toBe(400);

    const nodeC1 = layouted.nodes.find((n) => n.id === 'c1')!;
    const nodeC2 = layouted.nodes.find((n) => n.id === 'c2')!;
    const nodeC3 = layouted.nodes.find((n) => n.id === 'c3')!;
    const nodeC4 = layouted.nodes.find((n) => n.id === 'c4')!;

    // c1 and c3 (even indices) are in Right wing (x > root.x)
    expect(nodeC1.geometry.x).toBeGreaterThan(root.geometry.x);
    expect(nodeC3.geometry.x).toBeGreaterThan(root.geometry.x);

    // c2 and c4 (odd indices) are in Left wing (x < root.x)
    expect(nodeC2.geometry.x).toBeLessThan(root.geometry.x);
    expect(nodeC4.geometry.x).toBeLessThan(root.geometry.x);

    // Verify edge handles
    const edgeC1 = layouted.edges.find((e) => e.target === 'c1')!;
    const edgeC2 = layouted.edges.find((e) => e.target === 'c2')!;
    expect(edgeC1.sourceHandle).toBe('right');
    expect(edgeC1.targetHandle).toBe('left');
    expect(edgeC2.sourceHandle).toBe('left');
    expect(edgeC2.targetHandle).toBe('right');
  });

  it('supports LR, RL, and TB layout direction presets', () => {
    const doc = createEmptyDocument('Preset Spec', 'mindmap');
    const rootId = doc.nodes[0].id;
    doc.nodes.push(
      { id: 'p1', text: 'Sub 1', geometry: { x: 0, y: 0, width: 120, height: 40 }, parentId: rootId },
      { id: 'p2', text: 'Sub 2', geometry: { x: 0, y: 0, width: 120, height: 40 }, parentId: rootId }
    );
    doc.edges.push(
      { id: 'ep1', source: rootId, target: 'p1' },
      { id: 'ep2', source: rootId, target: 'p2' }
    );

    // LR preset: all children have x > root.x
    const lrLayout = layoutMindMapDocument(doc, { preset: 'LR', centerCoordinates: { x: 300, y: 300 } });
    const lrRoot = lrLayout.nodes.find((n) => n.id === rootId)!;
    expect(lrLayout.nodes.find((n) => n.id === 'p1')!.geometry.x).toBeGreaterThan(lrRoot.geometry.x);
    expect(lrLayout.nodes.find((n) => n.id === 'p2')!.geometry.x).toBeGreaterThan(lrRoot.geometry.x);

    // RL preset: all children have x < root.x
    const rlLayout = layoutMindMapDocument(doc, { preset: 'RL', centerCoordinates: { x: 300, y: 300 } });
    const rlRoot = rlLayout.nodes.find((n) => n.id === rootId)!;
    expect(rlLayout.nodes.find((n) => n.id === 'p1')!.geometry.x).toBeLessThan(rlRoot.geometry.x);
    expect(rlLayout.nodes.find((n) => n.id === 'p2')!.geometry.x).toBeLessThan(rlRoot.geometry.x);

    // TB preset: all children have y > root.y
    const tbLayout = layoutMindMapDocument(doc, { preset: 'TB', centerCoordinates: { x: 300, y: 300 } });
    const tbRoot = tbLayout.nodes.find((n) => n.id === rootId)!;
    expect(tbLayout.nodes.find((n) => n.id === 'p1')!.geometry.y).toBeGreaterThan(tbRoot.geometry.y);
    expect(tbLayout.nodes.find((n) => n.id === 'p2')!.geometry.y).toBeGreaterThan(tbRoot.geometry.y);
  });

  it('preserves user manual fine-tuning offsets post-layout', () => {
    const doc = createEmptyDocument('Manual Offset Spec', 'mindmap');
    const rootId = doc.nodes[0].id;
    const manualDx = 45;
    const manualDy = -30;

    doc.nodes.push({
      id: 'fine_tuned_node',
      text: 'Custom Offset Node',
      geometry: { x: 0, y: 0, width: 140, height: 44 },
      parentId: rootId,
      manualOffset: { dx: manualDx, dy: manualDy },
    });
    doc.edges.push({ id: 'e_offset', source: rootId, target: 'fine_tuned_node' });

    // Baseline layout without offset
    const docWithoutOffset = JSON.parse(JSON.stringify(doc));
    delete docWithoutOffset.nodes[1].manualOffset;
    const baseLayout = layoutMindMapDocument(docWithoutOffset, { preset: 'LR', centerCoordinates: { x: 200, y: 200 } });
    const baseNode = baseLayout.nodes.find((n) => n.id === 'fine_tuned_node')!;

    // Layout with offset
    const offsetLayout = layoutMindMapDocument(doc, { preset: 'LR', centerCoordinates: { x: 200, y: 200 } });
    const offsetNode = offsetLayout.nodes.find((n) => n.id === 'fine_tuned_node')!;

    expect(offsetNode.geometry.x).toBe(baseNode.geometry.x + manualDx);
    expect(offsetNode.geometry.y).toBe(baseNode.geometry.y + manualDy);
  });

  it('hides descendants and connecting edges when a branch is collapsed', () => {
    const doc = createEmptyDocument('Fold Unfold Spec', 'mindmap');
    const rootId = doc.nodes[0].id;

    doc.nodes.push(
      {
        id: 'parent_branch',
        text: 'Collapsed Category',
        geometry: { x: 200, y: 100, width: 140, height: 44 },
        parentId: rootId,
        collapsed: true, // Folded!
      },
      {
        id: 'hidden_child_1',
        text: 'Hidden Sub 1',
        geometry: { x: 350, y: 80, width: 120, height: 40 },
        parentId: 'parent_branch',
      },
      {
        id: 'hidden_grandchild',
        text: 'Hidden SubSub',
        geometry: { x: 500, y: 80, width: 120, height: 40 },
        parentId: 'hidden_child_1',
      }
    );

    doc.edges.push(
      { id: 'e_root_parent', source: rootId, target: 'parent_branch' },
      { id: 'e_parent_child', source: 'parent_branch', target: 'hidden_child_1' },
      { id: 'e_child_grandchild', source: 'hidden_child_1', target: 'hidden_grandchild' }
    );

    const projected = canonicalToReactFlow(doc);
    const parentNode = projected.nodes.find((n) => n.id === 'parent_branch')!;
    const childNode = projected.nodes.find((n) => n.id === 'hidden_child_1')!;
    const grandChildNode = projected.nodes.find((n) => n.id === 'hidden_grandchild')!;

    expect(parentNode.hidden).toBe(false);
    expect(parentNode.data.collapsed).toBe(true);
    expect(parentNode.data.hasChildren).toBe(true);
    expect(parentNode.data.childCount).toBe(1);

    // Descendants must be hidden
    expect(childNode.hidden).toBe(true);
    expect(grandChildNode.hidden).toBe(true);

    // Descendant edges must be hidden
    const childEdge = projected.edges.find((e) => e.id === 'e_parent_child')!;
    const grandchildEdge = projected.edges.find((e) => e.id === 'e_child_grandchild')!;
    expect(childEdge.hidden).toBe(true);
    expect(grandchildEdge.hidden).toBe(true);
  });
});

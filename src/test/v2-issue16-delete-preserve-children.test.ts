/**
 * Ticket #16: deleting a parent node currently forces deletion of its whole
 * subtree (planCanvasDeletion's "delete-subtree" plan). This adds an
 * intentional, explicit path -- deleteNodePreservingChildren -- that removes
 * only the selected node and reparents its direct children onto its own
 * parent, so children remain valid, understandable nodes instead of being
 * silently destroyed along with their parent.
 */
import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { deleteNodePreservingChildren, planCanvasDeletion } from '../model/deletion';
import { CanonicalNode } from '../model/types';

function addNode(doc: ReturnType<typeof createEmptyDocument>, id: string, parentId: string) {
  const node: CanonicalNode = { id, text: id, geometry: { x: 0, y: 0, width: 150, height: 44 }, parentId };
  doc.nodes.push(node);
  doc.edges.push({ id: `${parentId}->${id}`, source: parentId, target: id });
}

describe('#16 delete a parent node while preserving its children', () => {
  it('reparents direct children of a deleted mid-tree node onto its own parent', () => {
    const doc = createEmptyDocument('Delete preserve children', 'mindmap');
    const rootId = doc.nodes[0].id;
    addNode(doc, 'middle', rootId);
    addNode(doc, 'child-a', 'middle');
    addNode(doc, 'child-b', 'middle');
    addNode(doc, 'grandchild', 'child-a');

    const result = deleteNodePreservingChildren(doc, 'middle');

    // The deleted node itself is gone.
    expect(result.nodes.find((n) => n.id === 'middle')).toBeUndefined();

    // Its direct children survive and are now attached to the root.
    const childA = result.nodes.find((n) => n.id === 'child-a');
    const childB = result.nodes.find((n) => n.id === 'child-b');
    expect(childA?.parentId).toBe(rootId);
    expect(childB?.parentId).toBe(rootId);

    // A deeper descendant that was NOT a direct child of the deleted node
    // keeps its own existing parent untouched.
    const grandchild = result.nodes.find((n) => n.id === 'grandchild');
    expect(grandchild?.parentId).toBe('child-a');

    // Total node count drops by exactly one (only "middle" removed).
    expect(result.nodes.length).toBe(doc.nodes.length - 1);

    // Edges: no dangling edge references the deleted node, and each
    // reparented child has a fresh edge directly from the root.
    expect(result.edges.some((e) => e.source === 'middle' || e.target === 'middle')).toBe(false);
    expect(result.edges.some((e) => e.source === rootId && e.target === 'child-a')).toBe(true);
    expect(result.edges.some((e) => e.source === rootId && e.target === 'child-b')).toBe(true);
    // The untouched grandchild edge is preserved as-is.
    expect(result.edges.some((e) => e.source === 'child-a' && e.target === 'grandchild')).toBe(true);
  });

  it('removes a leaf node with no children with no reparenting needed', () => {
    const doc = createEmptyDocument('Leaf delete', 'mindmap');
    const rootId = doc.nodes[0].id;
    addNode(doc, 'leaf', rootId);

    const result = deleteNodePreservingChildren(doc, 'leaf');

    expect(result.nodes.find((n) => n.id === 'leaf')).toBeUndefined();
    expect(result.nodes.length).toBe(1);
    expect(result.edges.length).toBe(0);
  });

  it('is a no-op when the target is the root (no parent to reparent onto)', () => {
    const doc = createEmptyDocument('Root delete guard', 'mindmap');
    const rootId = doc.nodes[0].id;
    addNode(doc, 'child', rootId);

    const result = deleteNodePreservingChildren(doc, rootId);

    expect(result).toBe(doc);
  });

  it('is a no-op when the target node does not exist', () => {
    const doc = createEmptyDocument('Missing target', 'mindmap');
    const result = deleteNodePreservingChildren(doc, 'does-not-exist');
    expect(result).toBe(doc);
  });

  it('existing planCanvasDeletion subtree-deletion plan is unchanged (still available as the other explicit choice)', () => {
    const doc = createEmptyDocument('Subtree plan unchanged', 'mindmap');
    const rootId = doc.nodes[0].id;
    addNode(doc, 'middle', rootId);
    addNode(doc, 'child-a', 'middle');

    const plan = planCanvasDeletion(doc, 'middle');
    expect(plan?.kind).toBe('delete-subtree');
    expect(plan?.nodeIds.sort()).toEqual(['middle', 'child-a'].sort());
  });
});

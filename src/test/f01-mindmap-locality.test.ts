import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { layoutMindMapDocument } from '../model/layout';
import { CanonicalNode } from '../model/types';

const NODE_WIDTH = 150;
const NODE_HEIGHT = 44;
const NORMAL_SIBLING_PITCH = NODE_HEIGHT + 24;

function addNode(
  doc: ReturnType<typeof createEmptyDocument>,
  id: string,
  parentId: string
) {
  const node: CanonicalNode = {
    id,
    text: id,
    geometry: { x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT },
    parentId,
  };
  doc.nodes.push(node);
  doc.edges.push({ id: `${parentId}->${id}`, source: parentId, target: id });
}

function centerY(node: CanonicalNode) {
  return node.geometry.y + (node.geometry.height || NODE_HEIGHT) / 2;
}

function rectanglesOverlap(a: CanonicalNode, b: CanonicalNode) {
  const aWidth = a.geometry.width || NODE_WIDTH;
  const aHeight = a.geometry.height || NODE_HEIGHT;
  const bWidth = b.geometry.width || NODE_WIDTH;
  const bHeight = b.geometry.height || NODE_HEIGHT;
  return (
    a.geometry.x < b.geometry.x + bWidth &&
    a.geometry.x + aWidth > b.geometry.x &&
    a.geometry.y < b.geometry.y + bHeight &&
    a.geometry.y + aHeight > b.geometry.y
  );
}

describe('F01 mind-map locality', () => {
  it('wraps a deep, wide branch without visually orphaning direct children', () => {
    const doc = createEmptyDocument('Synthetic locality regression', 'mindmap');
    const rootId = doc.nodes[0].id;
    addNode(doc, 'branch', rootId);

    for (let child = 0; child < 6; child += 1) {
      const childId = `child-${child}`;
      addNode(doc, childId, 'branch');
      for (let leaf = 0; leaf < 4; leaf += 1) {
        addNode(doc, `${childId}-leaf-${leaf}`, childId);
      }
    }

    const layouted = layoutMindMapDocument(doc, {
      preset: 'LR',
      centerCoordinates: { x: 400, y: 300 },
    });
    const nodesById = new Map(layouted.nodes.map((node) => [node.id, node]));

    for (const node of layouted.nodes) {
      if (!node.parentId) continue;
      const parent = nodesById.get(node.parentId)!;
      expect(Math.abs(centerY(node) - centerY(parent))).toBeLessThanOrEqual(NORMAL_SIBLING_PITCH);
    }

    for (let index = 0; index < layouted.nodes.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < layouted.nodes.length; otherIndex += 1) {
        expect(rectanglesOverlap(layouted.nodes[index], layouted.nodes[otherIndex])).toBe(false);
      }
    }
  });
});

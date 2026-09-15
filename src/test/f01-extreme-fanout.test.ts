import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { layoutMindMapDocument } from '../model/layout';
import { CanonicalNode } from '../model/types';

const NODE_WIDTH = 150;
const NODE_HEIGHT = 44;

function addChild(doc: ReturnType<typeof createEmptyDocument>, id: string, parentId: string) {
  const node: CanonicalNode = {
    id,
    text: id,
    geometry: { x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT },
    parentId,
  };
  doc.nodes.push(node);
  doc.edges.push({ id: `${parentId}->${id}`, source: parentId, target: id });
}

describe('F01 extreme fan-out mind-map locality', () => {
  it('keeps a very large direct-child fan-out compact instead of stretching into a thin strip', () => {
    const doc = createEmptyDocument('Extreme fan-out regression', 'mindmap');
    const rootId = doc.nodes[0].id;

    const CHILD_COUNT = 60;
    for (let i = 0; i < CHILD_COUNT; i += 1) {
      addChild(doc, `child-${i}`, rootId);
    }

    const layouted = layoutMindMapDocument(doc, {
      preset: 'balanced',
      centerCoordinates: { x: 400, y: 300 },
    });

    const root = layouted.nodes.find((n) => n.id === rootId)!;
    const rootCenterX = root.geometry.x + (root.geometry.width || NODE_WIDTH) / 2;
    const rootCenterY = root.geometry.y + (root.geometry.height || NODE_HEIGHT) / 2;

    const children = layouted.nodes.filter((n) => n.parentId === rootId);
    expect(children.length).toBe(CHILD_COUNT);

    const maxDistance = Math.max(
      ...children.map((c) => {
        const cx = c.geometry.x + (c.geometry.width || NODE_WIDTH) / 2;
        const cy = c.geometry.y + (c.geometry.height || NODE_HEIGHT) / 2;
        return Math.hypot(cx - rootCenterX, cy - rootCenterY);
      })
    );

    // A well-formed fan-out arranges ~N children roughly in a sqrt(N) x sqrt(N)
    // block per side, not a 2-row-tall strip N/2 columns wide. The farthest
    // child's straight-line distance from the root should stay within a small
    // multiple of sqrt(N) columns/rows -- not grow linearly with N.
    const perSide = CHILD_COUNT / 2;
    const reasonableColumns = Math.ceil(Math.sqrt(perSide)) + 1;
    const columnStride = NODE_WIDTH + 90;
    const maxReasonableDistance = reasonableColumns * columnStride;

    expect(maxDistance).toBeLessThanOrEqual(maxReasonableDistance);
  });
});

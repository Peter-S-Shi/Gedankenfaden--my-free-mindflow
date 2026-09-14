import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { planDeleteNodePreservingChildren } from '../model/deletion';
import { selectSameLevelInTopLevelBranch } from '../model/hierarchySelection';
import { computeSubmenuPlacement, CONTEXT_SUBMENU_SIZES } from '../interaction/submenuPlacement';
import { CanonicalNode } from '../model/types';

function addNode(
  doc: ReturnType<typeof createEmptyDocument>,
  id: string,
  parentId: string
) {
  const node: CanonicalNode = {
    id,
    text: id,
    parentId,
    geometry: { x: 0, y: 0, width: 120, height: 44 },
  };
  doc.nodes.push(node);
  doc.edges.push({ id: `${parentId}->${id}`, source: parentId, target: id });
}

describe('M3 corrective: same-level selection within a top-level branch', () => {
  it('includes cousins under different parents while excluding the other root branch', () => {
    const doc = createEmptyDocument('Multi-parent branch', 'mindmap');
    const rootId = doc.nodes[0].id;
    addNode(doc, 'left-branch', rootId);
    addNode(doc, 'right-branch', rootId);
    addNode(doc, 'left-a', 'left-branch');
    addNode(doc, 'left-b', 'left-branch');
    addNode(doc, 'right-a', 'right-branch');
    addNode(doc, 'left-a-leaf', 'left-a');
    addNode(doc, 'left-b-leaf', 'left-b');
    addNode(doc, 'right-a-leaf', 'right-a');

    expect([...selectSameLevelInTopLevelBranch(doc.nodes, 'left-a-leaf')].sort()).toEqual([
      'left-a-leaf',
      'left-b-leaf',
    ]);
  });

  it('uses canonical parent depth rather than rendered position or sibling identity', () => {
    const doc = createEmptyDocument('Deep asymmetric branch', 'mindmap');
    const rootId = doc.nodes[0].id;
    addNode(doc, 'branch', rootId);
    addNode(doc, 'level-2-a', 'branch');
    addNode(doc, 'level-2-b', 'branch');
    addNode(doc, 'level-3-a', 'level-2-a');
    addNode(doc, 'level-3-b', 'level-2-b');
    addNode(doc, 'level-4-a', 'level-3-a');
    addNode(doc, 'level-4-b', 'level-3-b');
    doc.nodes.find((node) => node.id === 'level-4-b')!.geometry.y = 9999;

    expect([...selectSameLevelInTopLevelBranch(doc.nodes, 'level-4-a')].sort()).toEqual([
      'level-4-a',
      'level-4-b',
    ]);
  });
});

describe('M3 corrective: keep-children deletion confirmation', () => {
  it('creates a pending destructive plan without mutating the canonical document', () => {
    const doc = createEmptyDocument('Confirmation boundary', 'mindmap');
    const rootId = doc.nodes[0].id;
    addNode(doc, 'parent', rootId);
    addNode(doc, 'child', 'parent');
    const before = JSON.stringify(doc);

    const plan = planDeleteNodePreservingChildren(doc, 'parent');

    expect(plan).toMatchObject({
      kind: 'delete-node-preserve-children',
      nodeIds: ['parent'],
    });
    expect(plan?.title).toContain('keep');
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('does not offer the preserve-children operation for the true root', () => {
    const doc = createEmptyDocument('Root guard', 'mindmap');
    expect(planDeleteNodePreservingChildren(doc, doc.nodes[0].id)).toBeNull();
  });
});

describe('M3 corrective: viewport-aware submenu placement', () => {
  const viewport = { width: 1000, height: 700 };
  const submenu = { width: 220, height: 240 };

  it.each([
    ['top-left', { left: 20, right: 220, top: 20, bottom: 54 }, 'right', 0],
    ['top-right', { left: 780, right: 980, top: 20, bottom: 54 }, 'left', 0],
    ['bottom-left', { left: 20, right: 220, top: 646, bottom: 680 }, 'right', -206],
    ['bottom-right', { left: 780, right: 980, top: 646, bottom: 680 }, 'left', -206],
  ] as const)('keeps the submenu inside the viewport at the %s corner', (_name, trigger, horizontal, topOffset) => {
    const placement = computeSubmenuPlacement(trigger, submenu, viewport, 4);
    expect(placement).toEqual({ horizontal, topOffset });

    const submenuLeft = horizontal === 'right'
      ? trigger.right - 4
      : trigger.left - submenu.width + 4;
    const submenuTop = trigger.top + topOffset;
    expect(submenuLeft).toBeGreaterThanOrEqual(0);
    expect(submenuLeft + submenu.width).toBeLessThanOrEqual(viewport.width);
    expect(submenuTop).toBeGreaterThanOrEqual(0);
    expect(submenuTop + submenu.height).toBeLessThanOrEqual(viewport.height);
  });

  it('aligns to the trigger-row top when there is enough vertical room', () => {
    expect(computeSubmenuPlacement(
      { left: 300, right: 500, top: 260, bottom: 294 },
      { width: 220, height: 120 },
      viewport,
      4
    )).toEqual({ horizontal: 'right', topOffset: 0 });
  });

  it.each(Object.entries(CONTEXT_SUBMENU_SIZES))(
    'keeps the production %s fallback bounds inside both bottom corners',
    (_key, productionSubmenu) => {
      for (const trigger of [
        { left: 20, right: 250, top: 646, bottom: 680 },
        { left: 750, right: 980, top: 646, bottom: 680 },
      ]) {
        const placement = computeSubmenuPlacement(trigger, productionSubmenu, viewport, 4);
        const top = trigger.top + placement.topOffset;
        expect(top).toBeGreaterThanOrEqual(0);
        expect(top + productionSubmenu.height).toBeLessThanOrEqual(viewport.height);
      }
    }
  );
});

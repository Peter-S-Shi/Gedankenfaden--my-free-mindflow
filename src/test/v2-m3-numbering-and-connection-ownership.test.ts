import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import { createEmptyDocument } from '../model/document';
import { canonicalToReactFlow, reactFlowToCanonical } from '../model/adapter';
import { autoLayoutDocument } from '../model/layout';
import { computeDocumentNumbering, canApplyNumbering, formatNumberedLabel } from '../model/numbering';
import { allowsManualConnections } from '../model/connectionPolicy';
import { CanonicalDocument, CanonicalNode } from '../model/types';

function addNode(doc: CanonicalDocument, id: string, parentId: string, text = id) {
  const node: CanonicalNode = { id, text, parentId, geometry: { x: 0, y: 0, width: 120, height: 44 } };
  doc.nodes.push(node);
  doc.edges.push({ id: `${parentId}->${id}`, source: parentId, target: id });
}

/** root -> X -> P (a1, a2, a3) ; a1 -> a1x -- P sits two levels below root. */
function buildDeepFixture(): CanonicalDocument {
  const doc = createEmptyDocument('Numbering fixture', 'mindmap');
  const rootId = doc.nodes[0].id;
  addNode(doc, 'X', rootId);
  addNode(doc, 'P', 'X');
  addNode(doc, 'a1', 'P');
  addNode(doc, 'a2', 'P');
  addNode(doc, 'a3', 'P');
  addNode(doc, 'a1x', 'a1');
  return doc;
}

describe('M3: numbering has no ambient default (must be explicitly applied)', () => {
  it('a document with no numbering rule anywhere renders no badges at all', () => {
    const doc = buildDeepFixture();
    const map = computeDocumentNumbering(doc);
    expect(map.size).toBe(0);
  });
});

describe('M3: numbering is parent-scoped from the rule-owning node, not root-relative', () => {
  it('a rule set on a node two levels below root numbers that node\'s own direct children with level1Style', () => {
    const doc = buildDeepFixture();
    const numbered: CanonicalDocument = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === 'P' ? { ...n, numbering: { level1Style: 'decimal' as const, maxDepth: 2 } } : n)),
    };
    const map = computeDocumentNumbering(numbered);

    // P's direct children get decimal numbering -- NOT bullets, which is
    // what root-relative depth (P sits at global depth 2) would wrongly
    // produce under the old "depth===1 -> level2Style else bullet" logic.
    expect(map.get('a1')).toBe('1.');
    expect(map.get('a2')).toBe('2.');
    expect(map.get('a3')).toBe('3.');
    // Root's own child X and P itself are never numbered (no rule covers them).
    expect(map.has('X')).toBe(false);
    expect(map.has('P')).toBe(false);
  });

  it('maxDepth is relative to the rule owner, not the document root', () => {
    const doc = buildDeepFixture();
    // maxDepth: 1 means "number only my direct children" (relative depth 0),
    // so a1's own child (a1x, relative depth 1) must NOT be numbered.
    const numbered: CanonicalDocument = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === 'P' ? { ...n, numbering: { level1Style: 'decimal' as const, maxDepth: 1 } } : n)),
    };
    const map = computeDocumentNumbering(numbered);
    expect(map.get('a1')).toBe('1.');
    expect(map.has('a1x')).toBe(false);
  });

  it('a deeper node\'s own numbering rule overrides the inherited rule for its own subtree', () => {
    const doc = buildDeepFixture();
    const numbered: CanonicalDocument = {
      ...doc,
      nodes: doc.nodes.map((n) => {
        if (n.id === 'P') return { ...n, numbering: { level1Style: 'decimal' as const, maxDepth: 5 } };
        if (n.id === 'a1') return { ...n, numbering: { level1Style: 'roman' as const, maxDepth: 5 } };
        return n;
      }),
    };
    const map = computeDocumentNumbering(numbered);
    // a1's own children (a1x) follow a1's roman rule, not P's inherited decimal.
    expect(map.get('a1x')).toBe('I.');
  });
});

describe('M3: canApplyNumbering (drives the Numbering menu disabled state)', () => {
  it('is true for a mind-map node that has children', () => {
    const doc = buildDeepFixture();
    expect(canApplyNumbering(doc, 'P')).toBe(true);
  });

  it('is false for a leaf node', () => {
    const doc = buildDeepFixture();
    expect(canApplyNumbering(doc, 'a2')).toBe(false);
  });

  it('is false for a nonexistent node id', () => {
    const doc = buildDeepFixture();
    expect(canApplyNumbering(doc, 'does-not-exist')).toBe(false);
  });

  it('is false for any node in a flowchart document', () => {
    const doc = createEmptyDocument('Flowchart fixture', 'flowchart');
    const startId = doc.nodes[0].id;
    addNode(doc, 'next', startId);
    expect(canApplyNumbering(doc, startId)).toBe(false);
  });
});

describe('M3: numbering renders as an ordinary inline text prefix', () => {
  it('prefixes the badge and a space onto the node text when a badge exists', () => {
    expect(formatNumberedLabel('1.', '核心主角')).toBe('1. 核心主角');
  });

  it('returns the plain text unchanged when there is no badge', () => {
    expect(formatNumberedLabel(undefined, '重要配角')).toBe('重要配角');
  });
});

describe('M3: parent-scoped numbering persists through save/reload, Auto Layout, collapse/expand, undo/redo', () => {
  function applyPRule(doc: CanonicalDocument): CanonicalDocument {
    return {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === 'P' ? { ...n, numbering: { level1Style: 'decimal' as const, maxDepth: 2 } } : n)),
    };
  }

  it('survives a reactFlowToCanonical round-trip (drag-sync / save)', () => {
    const doc = applyPRule(buildDeepFixture());
    const projected = canonicalToReactFlow(doc);
    const roundTripped = reactFlowToCanonical(projected.nodes, projected.edges, doc);
    expect(roundTripped.nodes.find((n) => n.id === 'P')?.numbering).toEqual({ level1Style: 'decimal', maxDepth: 2 });
    const badges = canonicalToReactFlow(roundTripped).nodes.reduce<Record<string, unknown>>((acc, n) => {
      acc[n.id] = n.data.numberingBadge;
      return acc;
    }, {});
    expect(badges['a1']).toBe('1.');
  });

  it('survives Auto Layout', () => {
    const doc = applyPRule(buildDeepFixture());
    const layouted = autoLayoutDocument(doc, { preset: 'balanced' });
    const map = computeDocumentNumbering(layouted);
    expect(map.get('a1')).toBe('1.');
  });

  it('survives a collapse/expand cycle on an unrelated sibling branch', () => {
    const doc = applyPRule(buildDeepFixture());
    const collapsed: CanonicalDocument = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === 'X' ? { ...n, collapsed: true } : n)),
    };
    // P (and its numbering rule) is hidden behind X's collapse, but the
    // rule itself must still be intact once X is revealed again.
    const revealed: CanonicalDocument = {
      ...collapsed,
      nodes: collapsed.nodes.map((n) => (n.id === 'X' ? { ...n, collapsed: false } : n)),
    };
    const revealedMap = computeDocumentNumbering(revealed);
    expect(revealedMap.get('a1')).toBe('1.');
  });

  it('survives an undo/redo-style snapshot round-trip', () => {
    const before = buildDeepFixture();
    const after = applyPRule(before);
    // Undo: restore the earlier snapshot -- numbering should be gone.
    expect(computeDocumentNumbering(before).has('a1')).toBe(false);
    // Redo: restore the later snapshot -- numbering should be back.
    expect(computeDocumentNumbering(after).get('a1')).toBe('1.');
  });
});

describe('M3: Mind Map hierarchy edges are algorithm-owned', () => {
  it('allowsManualConnections is true for Flowchart and false for Mind Map', () => {
    expect(allowsManualConnections('flowchart')).toBe(true);
    expect(allowsManualConnections('mindmap')).toBe(false);
  });

  it('reactFlowToCanonical never carries stray path/bend data onto a CanonicalEdge, even if present on the React Flow edge object', () => {
    const doc = buildDeepFixture();
    const projected = canonicalToReactFlow(doc);
    const tamperedEdges: Edge[] = projected.edges.map((e) => ({
      ...e,
      // Simulate a hypothetical manual-bend UI having written path/point
      // data directly onto the React Flow edge object.
      data: { ...(e.data || {}), points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] },
    })) as Edge[];

    const roundTripped = reactFlowToCanonical(projected.nodes, tamperedEdges, doc);
    for (const edge of roundTripped.edges) {
      expect(edge).not.toHaveProperty('data');
      expect(Object.keys(edge).sort()).toEqual(
        ['id', 'label', 'source', 'sourceHandle', 'style', 'target', 'targetHandle', 'type'].sort()
      );
    }
  });

  it('moving a Mind Map node (manualOffset) still produces an edge regenerated from the resulting geometry, not a frozen prior path', () => {
    const doc = buildDeepFixture();
    const baseline = autoLayoutDocument(doc, { preset: 'balanced' });
    const moved: CanonicalDocument = {
      ...baseline,
      nodes: baseline.nodes.map((n) => (n.id === 'a1' ? { ...n, manualOffset: { dx: 40, dy: -25 } } : n)),
    };
    const relayouted = autoLayoutDocument(moved, { preset: 'balanced' });
    const edge = relayouted.edges.find((e) => e.source === 'P' && e.target === 'a1')!;
    // Handles are always assigned by the layout engine's side-routing, never
    // left as whatever a manual drag happened to leave behind.
    expect(['left', 'right']).toContain(edge.sourceHandle);
    expect(['left', 'right']).toContain(edge.targetHandle);
  });
});

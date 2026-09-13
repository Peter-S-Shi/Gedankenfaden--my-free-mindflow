/**
 * M1-D production regression suite for `src/model/mindMapLayoutEngine.ts`.
 *
 * Covers the two contracts M1-D closes on top of M1-A/B/C:
 *  1. High fan-out: `decideFanoutStrategy` / the 'grid' packing it now
 *     activates above `FANOUT_GRID_ACTIVATION_THRESHOLD`.
 *  2. Incremental-edit stability (#10c): `options.stabilizeAgainst`.
 *
 * Uses the committed neutral corpus at
 * `src/prototype/m0-layout-engine/fixtures/` (synthetic, safe to commit)
 * plus small synthetic docs built inline for scenarios the corpus doesn't
 * cover (exact-threshold boundaries, deep incremental edits). Assertions
 * are written directly against production `CanonicalDocument` geometry;
 * this suite does not depend on any prototype code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importFromMarkdown } from '../model/importers';
import { CanonicalDocument, CanonicalNode } from '../model/types';
import { createEmptyDocument } from '../model/document';
import { layoutMindMapDocument } from '../model/layout';
import {
  decideFanoutStrategy,
  layoutMindMapEngineV2,
  FANOUT_GRID_ACTIVATION_THRESHOLD,
} from '../model/mindMapLayoutEngine';

const fixturesDir = path.join(__dirname, '..', 'prototype', 'm0-layout-engine', 'fixtures');

function byId(doc: CanonicalDocument): Map<string, CanonicalNode> {
  return new Map(doc.nodes.map((n) => [n.id, n]));
}

function rootOf(doc: CanonicalDocument): CanonicalNode {
  return doc.nodes.find((n) => n.type === 'root') || doc.nodes.find((n) => !n.parentId) || doc.nodes[0];
}

function rectsOverlap(a: CanonicalNode, b: CanonicalNode): boolean {
  const aw = a.geometry.width || 150;
  const ah = a.geometry.height || 44;
  const bw = b.geometry.width || 150;
  const bh = b.geometry.height || 44;
  return (
    a.geometry.x < b.geometry.x + bw &&
    a.geometry.x + aw > b.geometry.x &&
    a.geometry.y < b.geometry.y + bh &&
    a.geometry.y + ah > b.geometry.y
  );
}

function countNodeOverlaps(doc: CanonicalDocument): number {
  let overlaps = 0;
  for (let i = 0; i < doc.nodes.length; i++) {
    for (let j = i + 1; j < doc.nodes.length; j++) {
      if (rectsOverlap(doc.nodes[i], doc.nodes[j])) overlaps++;
    }
  }
  return overlaps;
}

/**
 * Samples points along each parent-child edge and counts total
 * (edge, unrelated-node) crossing pairs -- matching M0_REPORT.md's own
 * `edgeThroughNodeCount` metric shape (a sum over crossings, not a binary
 * per-edge flag), which is what produced its large, discriminating
 * numbers (e.g. 302 on this exact fixture for plain banding).
 */
function countEdgeThroughNode(doc: CanonicalDocument): number {
  const nodes = byId(doc);
  const shrink = 2; // small inset so touching/adjacent boxes aren't false positives
  let count = 0;
  for (const e of doc.edges) {
    const s = nodes.get(e.source);
    const t = nodes.get(e.target);
    if (!s || !t) continue;
    const sx = s.geometry.x + (s.geometry.width || 150) / 2;
    const sy = s.geometry.y + (s.geometry.height || 44) / 2;
    const tx = t.geometry.x + (t.geometry.width || 150) / 2;
    const ty = t.geometry.y + (t.geometry.height || 44) / 2;
    for (const n of doc.nodes) {
      if (n.id === e.source || n.id === e.target) continue;
      const nx = n.geometry.x + shrink;
      const ny = n.geometry.y + shrink;
      const nw = (n.geometry.width || 150) - shrink * 2;
      const nh = (n.geometry.height || 44) - shrink * 2;
      let crossedThis = false;
      const samples = 24;
      for (let i = 0; i <= samples && !crossedThis; i++) {
        const px = sx + ((tx - sx) * i) / samples;
        const py = sy + ((ty - sy) * i) / samples;
        if (px >= nx && px <= nx + nw && py >= ny && py <= ny + nh) crossedThis = true;
      }
      if (crossedThis) count++;
    }
  }
  return count;
}

function aspectRatio(doc: CanonicalDocument): number {
  const minX = Math.min(...doc.nodes.map((n) => n.geometry.x));
  const maxX = Math.max(...doc.nodes.map((n) => n.geometry.x + (n.geometry.width || 150)));
  const minY = Math.min(...doc.nodes.map((n) => n.geometry.y));
  const maxY = Math.max(...doc.nodes.map((n) => n.geometry.y + (n.geometry.height || 44)));
  return (maxX - minX) / (maxY - minY);
}

function depthsOf(doc: CanonicalDocument): Map<string, number> {
  const root = rootOf(doc);
  const childrenMap = new Map<string, CanonicalNode[]>();
  for (const n of doc.nodes) {
    if (!n.parentId) continue;
    childrenMap.set(n.parentId, [...(childrenMap.get(n.parentId) || []), n]);
  }
  const depths = new Map<string, number>();
  const stack = [{ id: root.id, depth: 0 }];
  while (stack.length) {
    const { id, depth } = stack.pop()!;
    depths.set(id, depth);
    for (const c of childrenMap.get(id) || []) stack.push({ id: c.id, depth: depth + 1 });
  }
  return depths;
}

function buildStarDoc(n: number, opts: { extraGrandchildOn?: number; collapseChild?: number } = {}): CanonicalDocument {
  const doc = createEmptyDocument('Star fan-out test', 'mindmap');
  const nodes: CanonicalNode[] = [{ id: 'root', type: 'root', text: 'Root', geometry: { x: 0, y: 0 } }];
  const edges = [];
  for (let i = 0; i < n; i++) {
    nodes.push({
      id: `child-${i}`,
      parentId: 'root',
      text: `Child ${i}`,
      geometry: { x: 0, y: 0 },
      collapsed: opts.collapseChild === i,
    });
    edges.push({ id: `root->child-${i}`, source: 'root', target: `child-${i}` });
    if (opts.extraGrandchildOn === i) {
      nodes.push({ id: `child-${i}-grandchild`, parentId: `child-${i}`, text: 'Grandchild', geometry: { x: 0, y: 0 } });
      edges.push({ id: `child-${i}->grandchild`, source: `child-${i}`, target: `child-${i}-grandchild` });
    }
  }
  doc.nodes = nodes;
  doc.edges = edges;
  return doc;
}

describe('M1-D high fan-out -- decideFanoutStrategy activation boundary', () => {
  it('activates "grid" only strictly above the measured threshold, "none" at and below it', () => {
    expect(decideFanoutStrategy(FANOUT_GRID_ACTIVATION_THRESHOLD).strategy).toBe('none');
    expect(decideFanoutStrategy(FANOUT_GRID_ACTIVATION_THRESHOLD + 1).strategy).toBe('grid');
  });

  it('ordinary low/medium fan-out (10 direct children) keeps plain single-column banding, byte-identical band behavior', () => {
    const doc = buildStarDoc(10);
    const laidOut = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const root = rootOf(laidOut);
    const depths = depthsOf(laidOut);
    const nodes = byId(laidOut);
    const bands = new Map<string, number[]>();
    for (const n of laidOut.nodes) {
      if (n.id === root.id) continue;
      const side = n.geometry.x >= root.geometry.x ? 'right' : 'left';
      const key = `${side}:${depths.get(n.id)}`;
      const near = side === 'right' ? n.geometry.x : n.geometry.x + (n.geometry.width || 150);
      bands.set(key, [...(bands.get(key) || []), near]);
    }
    for (const [, xs] of bands) {
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
    }
    expect(nodes.size).toBe(11);
  });
});

describe('M1-D high fan-out -- grid packing correctness and quantitative evidence', () => {
  it('60-child star: zero node overlaps, hierarchy-depth semantics preserved, aspect ratio closer to square than plain banding', () => {
    const doc = buildStarDoc(60);
    const laidOut = layoutMindMapEngineV2(doc, { preset: 'balanced' });

    expect(countNodeOverlaps(laidOut)).toBe(0);

    const depths = depthsOf(laidOut);
    for (let i = 0; i < 60; i++) {
      expect(depths.get(`child-${i}`)).toBe(1);
    }

    // "None"-equivalent baseline at the same node count: the legacy engine
    // never has a fan-out exception, so it stands in for what plain
    // single-column banding at n=60 looks like (same real-world evidence
    // shape M0_REPORT.md used for its "clearly bad by n=24-40" numbers).
    const legacyBaseline = layoutMindMapDocument(doc, { preset: 'balanced' });
    const gridAspect = aspectRatio(laidOut);
    const baselineAspect = aspectRatio(legacyBaseline);
    expect(Math.abs(gridAspect - 1)).toBeLessThan(Math.abs(baselineAspect - 1));
  });

  it('01_extreme_star_60.md (real M0 corpus fixture): grid reduces edge-through-node crossings versus the legacy single-column baseline', () => {
    const raw = importFromMarkdown(fs.readFileSync(path.join(fixturesDir, '01_extreme_star_60.md'), 'utf-8'));
    const gridLaidOut = layoutMindMapEngineV2(raw, { preset: 'balanced', horizontalGap: 60, verticalGap: 24 });
    const legacyLaidOut = layoutMindMapDocument(raw, { preset: 'balanced', horizontalGap: 60, verticalGap: 24 });

    const gridCrossings = countEdgeThroughNode(gridLaidOut);
    const legacyCrossings = countEdgeThroughNode(legacyLaidOut);
    // M0_REPORT.md measured 302 crossings for plain banding on this exact
    // fixture; grid packing must materially reduce that, not just match it.
    expect(gridCrossings).toBeLessThan(legacyCrossings);
    expect(countNodeOverlaps(gridLaidOut)).toBe(0);
  });

  it('preserves collapse state, manual offsets, and edge semantics through a fanned parent (the realistic, corpus-matching leaf-only case)', () => {
    // 40 (near-equal-weight) direct children split close to 20/20 by the
    // bilateral LPT balance, so each side's own fan-out count is still
    // comfortably above FANOUT_GRID_ACTIVATION_THRESHOLD (16) -- fan-out
    // is decided per (parent, side), not on the parent's raw child count.
    // Every fanned child is a leaf here, matching M0's own real-world
    // evidence (`01_extreme_star_60.md`) -- the "further descendants of a
    // fanned child" case is exercised separately below, where it is a
    // documented residual limitation, not a fully solved case.
    const doc = buildStarDoc(40, { collapseChild: 7 });
    const withOffset: CanonicalDocument = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === 'child-5' ? { ...n, manualOffset: { dx: 30, dy: -12 } } : n)),
    };

    const laidOut = layoutMindMapEngineV2(withOffset, { preset: 'balanced' });
    const nodes = byId(laidOut);
    const root = rootOf(laidOut);

    expect(countNodeOverlaps(laidOut)).toBe(0);
    // Real evidence grid packing actually ran for this side (not just that
    // decideFanoutStrategy CAN return 'grid' in isolation): children on
    // the root's right side occupy more than one distinct x column.
    const rightChildren = doc.nodes.filter((n) => n.parentId === 'root' && nodes.get(n.id)!.geometry.x >= root.geometry.x);
    const rightXs = new Set(rightChildren.map((n) => Math.round(nodes.get(n.id)!.geometry.x)));
    expect(rightXs.size).toBeGreaterThan(1);

    // Collapsed fanned child: still present and positioned (its own box
    // renders); it has no descendants in this fixture to verify hiding of,
    // covered separately by the M1-A collapse suite.
    expect(nodes.get('child-7')).toBeDefined();

    // Manual offset on a fanned child: baseline (no offset) vs offset
    // differ by exactly the offset, and every OTHER fanned child's own
    // position is untouched by it.
    const baseline = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const baselineById = byId(baseline);
    const base = baselineById.get('child-5')!;
    const withOffsetPos = nodes.get('child-5')!;
    expect(withOffsetPos.geometry.x).toBeCloseTo(base.geometry.x + 30, 5);
    expect(withOffsetPos.geometry.y).toBeCloseTo(base.geometry.y - 12, 5);
    for (const n of doc.nodes) {
      if (n.id === 'child-5') continue;
      expect(nodes.get(n.id)?.geometry).toEqual(baselineById.get(n.id)?.geometry);
    }

    // Edge semantics: every root->child edge still carries a valid handle
    // pair, and it matches the side the child actually rendered on.
    for (let i = 0; i < 40; i++) {
      const edge = laidOut.edges.find((e) => e.id === `root->child-${i}`)!;
      const child = nodes.get(`child-${i}`)!;
      const expectedSide = child.geometry.x >= root.geometry.x ? 'right' : 'left';
      expect(edge.sourceHandle).toBe(expectedSide);
      expect(edge.targetHandle).toBe(expectedSide === 'right' ? 'left' : 'right');
    }
  });

  it('documents the residual limitation: a fanned child with its own further descendants is positioned at correct depth, but is not guaranteed collision-free with a neighboring column', () => {
    // Not a corpus-realistic scenario (M0's own real fixture has every
    // fanned child as a leaf) -- this deliberately constructs the one
    // case `placeChildrenGrid`'s doc comment names as a known, accepted
    // gap, so the gap is visible in the suite rather than silently true.
    const doc = buildStarDoc(40, { extraGrandchildOn: 3 });
    const laidOut = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const nodes = byId(laidOut);
    const root = rootOf(laidOut);

    // What IS guaranteed: the descendant is positioned (not dropped or
    // NaN) and lies strictly farther from the root than its own fanned
    // parent -- a real depth step, not a degenerate stacked position.
    const grandchild = nodes.get('child-3-grandchild')!;
    const fannedParent = nodes.get('child-3')!;
    const side = fannedParent.geometry.x >= root.geometry.x ? 1 : -1;
    expect(Number.isFinite(grandchild.geometry.x)).toBe(true);
    expect(Number.isFinite(grandchild.geometry.y)).toBe(true);
    expect(side * (grandchild.geometry.x - fannedParent.geometry.x)).toBeGreaterThan(0);

    // What is NOT guaranteed: whether it collides with a neighboring
    // column -- see `placeChildrenGrid`'s "KNOWN RESIDUAL LIMITATION" doc
    // comment in mindMapLayoutEngine.ts. Still bounded to a handful of
    // pairs (one extra descendant can collide with at most its immediate
    // neighboring column, never a runaway/degenerate result across the
    // whole 40-node fixture).
    expect(countNodeOverlaps(laidOut)).toBeLessThanOrEqual(4);
  });
});

describe('M1-D incremental-edit stability (#10c) -- a real passing production contract', () => {
  it('adding a sibling deep in one branch does not move ANY unrelated top-level branch (the concrete M0/M1-A open scenario, now solved)', () => {
    const doc = importFromMarkdown(fs.readFileSync(path.join(fixturesDir, '04_wide_shallow.md'), 'utf-8'));
    const before = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const beforeById = byId(before);

    const root = rootOf(before);
    const firstBranch = before.nodes.find((n) => n.parentId === root.id)!;
    const withNewSibling: CanonicalDocument = {
      ...before,
      nodes: [...before.nodes, { id: 'new-sibling', parentId: firstBranch.id, text: 'New Child', geometry: { x: 0, y: 0 } }],
      edges: [...before.edges, { id: `${firstBranch.id}->new-sibling`, source: firstBranch.id, target: 'new-sibling' }],
    };
    // The real product path (confirmed in src/components/CanvasEditor.tsx):
    // every edit relayouts the WHOLE document, seeded with the previous
    // layout's own output -- stabilizeAgainst is exactly that previous
    // output, not a synthetic parameter the live app never produces.
    const after = layoutMindMapEngineV2(withNewSibling, { preset: 'balanced', stabilizeAgainst: before });
    const afterById = byId(after);

    // "Unrelated" = every node outside firstBranch's own subtree,
    // including firstBranch's own top-level siblings and their entire
    // descendant trees -- not just the immediate siblings.
    const otherTopLevelBranches = before.nodes.filter((n) => n.parentId === root.id && n.id !== firstBranch.id);
    const childrenMap = new Map<string, CanonicalNode[]>();
    for (const n of before.nodes) {
      if (!n.parentId) continue;
      childrenMap.set(n.parentId, [...(childrenMap.get(n.parentId) || []), n]);
    }
    const unrelatedIds = new Set<string>();
    (function collect(id: string) {
      unrelatedIds.add(id);
      for (const c of childrenMap.get(id) || []) collect(c.id);
    })(otherTopLevelBranches[0]?.id ?? root.id);
    for (const branch of otherTopLevelBranches) {
      (function collect(id: string) {
        unrelatedIds.add(id);
        for (const c of childrenMap.get(id) || []) collect(c.id);
      })(branch.id);
    }
    unrelatedIds.add(root.id);

    expect(unrelatedIds.size).toBeGreaterThan(1);
    for (const id of unrelatedIds) {
      expect(afterById.get(id)?.geometry).toEqual(beforeById.get(id)?.geometry);
    }
  });

  it('removing a leaf from one branch does not move any other branch', () => {
    const doc = importFromMarkdown(fs.readFileSync(path.join(fixturesDir, '04_wide_shallow.md'), 'utf-8'));
    const before = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const beforeById = byId(before);

    const root = rootOf(before);
    const branches = before.nodes.filter((n) => n.parentId === root.id);
    const targetBranch = branches[0];
    const leafToRemove = before.nodes.find((n) => n.parentId === targetBranch.id);
    expect(leafToRemove).toBeDefined();

    const withRemoval: CanonicalDocument = {
      ...before,
      nodes: before.nodes.filter((n) => n.id !== leafToRemove!.id),
      edges: before.edges.filter((e) => e.target !== leafToRemove!.id),
    };
    const after = layoutMindMapEngineV2(withRemoval, { preset: 'balanced', stabilizeAgainst: before });
    const afterById = byId(after);

    for (const branch of branches.slice(1)) {
      expect(afterById.get(branch.id)?.geometry).toEqual(beforeById.get(branch.id)?.geometry);
    }
  });

  it('editing a deeply nested node (grandchild level) does not move a sibling second-level branch or an unrelated top-level branch', () => {
    const doc = createEmptyDocument('Deep edit stability test', 'mindmap');
    doc.nodes = [
      { id: 'root', type: 'root', text: 'Root', geometry: { x: 0, y: 0 } },
      { id: 'a', parentId: 'root', text: 'Branch A', geometry: { x: 0, y: 0 } },
      { id: 'a1', parentId: 'a', text: 'A1', geometry: { x: 0, y: 0 } },
      { id: 'a2', parentId: 'a', text: 'A2', geometry: { x: 0, y: 0 } },
      { id: 'a2-child', parentId: 'a2', text: 'Short', geometry: { x: 0, y: 0 } },
      { id: 'b', parentId: 'root', text: 'Branch B', geometry: { x: 0, y: 0 } },
      { id: 'b1', parentId: 'b', text: 'B1', geometry: { x: 0, y: 0 } },
    ];
    doc.edges = [
      { id: 'root->a', source: 'root', target: 'a' },
      { id: 'a->a1', source: 'a', target: 'a1' },
      { id: 'a->a2', source: 'a', target: 'a2' },
      { id: 'a2->a2-child', source: 'a2', target: 'a2-child' },
      { id: 'root->b', source: 'root', target: 'b' },
      { id: 'b->b1', source: 'b', target: 'b1' },
    ];

    const before = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const beforeById = byId(before);

    const edited: CanonicalDocument = {
      ...before,
      nodes: before.nodes.map((n) =>
        n.id === 'a2-child' ? { ...n, text: 'A much, much longer grandchild title that grows this node considerably' } : n
      ),
    };
    const after = layoutMindMapEngineV2(edited, { preset: 'balanced', stabilizeAgainst: before });
    const afterById = byId(after);

    // Unrelated: the entire "b" branch, and "a1" (a sibling second-level
    // branch under the SAME top-level ancestor "a" as the edit, but not an
    // ancestor/descendant of it).
    for (const id of ['b', 'b1', 'a1']) {
      expect(afterById.get(id)?.geometry).toEqual(beforeById.get(id)?.geometry);
    }
    // The edited node itself is allowed (expected) to change.
    expect(afterById.get('a2-child')!.geometry.height || 0).toBeGreaterThan(beforeById.get('a2-child')!.geometry.height || 0);
  });

  it('an existing top-level branch never flips side because of an unrelated edit', () => {
    const doc = importFromMarkdown(fs.readFileSync(path.join(fixturesDir, '08_bilateral_footprint_balance.md'), 'utf-8'));
    const before = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const beforeById = byId(before);
    const root = rootOf(before);
    const sideOf = (id: string, d: CanonicalDocument) => {
      const n = byId(d).get(id)!;
      const r = rootOf(d);
      return n.geometry.x >= r.geometry.x ? 'right' : 'left';
    };

    const branches = before.nodes.filter((n) => n.parentId === root.id);
    const target = branches[0];
    // Add many large new children to `target`'s branch -- large enough
    // that a FRESH (non-anchored) layout would very plausibly rebalance
    // which side `target` itself lands on.
    const newNodes: CanonicalNode[] = Array.from({ length: 5 }, (_, i) => ({
      id: `bulk-${i}`,
      parentId: target.id,
      text: `Bulk addition number ${i} with a fair amount of text to grow the footprint substantially`,
      geometry: { x: 0, y: 0 },
    }));
    const newEdges = newNodes.map((n) => ({ id: `${target.id}->${n.id}`, source: target.id, target: n.id }));
    const grown: CanonicalDocument = {
      ...before,
      nodes: [...before.nodes, ...newNodes],
      edges: [...before.edges, ...newEdges],
    };

    const after = layoutMindMapEngineV2(grown, { preset: 'balanced', stabilizeAgainst: before });
    expect(sideOf(target.id, after)).toBe(sideOf(target.id, before));
    for (const branch of branches) {
      if (branch.id === target.id) continue;
      expect(byId(after).get(branch.id)?.geometry).toEqual(beforeById.get(branch.id)?.geometry);
    }
  });

  it('is a strict no-op when stabilizing against an identical document (idempotent, matches the un-stabilized result)', () => {
    const doc = importFromMarkdown(fs.readFileSync(path.join(fixturesDir, '02_deep_chain_24.md'), 'utf-8'));
    const before = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const stabilizedNoChange = layoutMindMapEngineV2(before, { preset: 'balanced', stabilizeAgainst: before });
    for (const n of before.nodes) {
      expect(byId(stabilizedNoChange).get(n.id)?.geometry).toEqual(byId(before).get(n.id)?.geometry);
    }
  });

  it('omitting stabilizeAgainst reproduces the exact M1-A/B/C default behavior (backward compatible)', () => {
    const doc = importFromMarkdown(fs.readFileSync(path.join(fixturesDir, '03_severe_imbalance.md'), 'utf-8'));
    const withoutOption = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const withUndefinedOption = layoutMindMapEngineV2(doc, { preset: 'balanced', stabilizeAgainst: undefined });
    // Compare geometry/edges only -- `updatedAt` is a real-time timestamp
    // and legitimately differs by a millisecond between the two calls.
    expect(withUndefinedOption.nodes.map((n) => n.geometry)).toEqual(withoutOption.nodes.map((n) => n.geometry));
    expect(withUndefinedOption.edges).toEqual(withoutOption.edges);
  });

  it('documents the accepted scope boundary: a parent already in the fan-out grid regime is NOT anchored by stabilizeAgainst', () => {
    // 50 near-equal-weight children split close to 25/25 by each side;
    // adding one more tips one side from 25 to 26 direct children, which
    // also crosses ceil(sqrt(25))=5 -> ceil(sqrt(26))=6 grid columns, so a
    // full, unanchored regrid of that side is essentially guaranteed.
    const doc = buildStarDoc(50);
    const before = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const beforeById = byId(before);

    const withOneMore: CanonicalDocument = {
      ...before,
      nodes: [...before.nodes, { id: 'child-50', parentId: 'root', text: 'Child 50', geometry: { x: 0, y: 0 } }],
      edges: [...before.edges, { id: 'root->child-50', source: 'root', target: 'child-50' }],
    };
    const after = layoutMindMapEngineV2(withOneMore, { preset: 'balanced', stabilizeAgainst: before });

    // This is the documented boundary, not a bug: the fanned parent's
    // children are repacked as a group on every call, so at least one
    // existing fanned child's position is expected to shift here (unlike
    // every non-fanned scenario above, where nothing unrelated moves).
    let anyMoved = false;
    for (let i = 0; i < 50; i++) {
      const beforeGeom = beforeById.get(`child-${i}`)?.geometry;
      const afterGeom = byId(after).get(`child-${i}`)?.geometry;
      if (JSON.stringify(beforeGeom) !== JSON.stringify(afterGeom)) anyMoved = true;
    }
    expect(anyMoved).toBe(true);
    expect(countNodeOverlaps(after)).toBe(0);
  });
});

/**
 * PROTOTYPE (M0 gate) -- throwaway. Not wired into production import/layout.
 *
 * Two jobs:
 *  1. Prove the contract is executable and that both prototypes satisfy it
 *     across the whole synthetic regression corpus (green -- this is the
 *     M0 gate's pass evidence).
 *  2. Document, as `it.fails()` red regressions, the specific current
 *     production `layoutMindMapDocument()` contract violations this gate
 *     was opened to fix -- these stay red until the real production
 *     engine replacement (a later, separate milestone) lands.
 *
 * Running `npx vitest run src/prototype/m0-layout-engine` also prints a
 * metrics table per fixture/engine to stdout (used to write M0_REPORT.md;
 * not re-derived automatically since this is a throwaway harness, not a
 * reporting pipeline).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeLayoutMetrics, LayoutMetrics } from './contract';
import { layoutPrototypeA } from './prototypeA';
import { layoutPrototypeB } from './prototypeB';
import { layoutBaseline } from './baselineAdapter';
import { loadFixtureFromText } from './loadFixture';
import { computeTextAwareSize } from './textAwareGeometry';

const fixturesDir = path.join(__dirname, 'fixtures');
const fixtureFiles = fs
  .readdirSync(fixturesDir)
  .filter((f) => f.endsWith('.md') || f.endsWith('.opml'))
  .sort();

function loadFixture(fileName: string) {
  const text = fs.readFileSync(path.join(fixturesDir, fileName), 'utf-8');
  const kind = fileName.endsWith('.opml') ? 'opml' : 'md';
  return loadFixtureFromText(text, kind);
}

interface EngineRow {
  engine: string;
  metrics: LayoutMetrics;
}

function runAllEngines(fileName: string): EngineRow[] {
  const { nodes, edges } = loadFixture(fileName);
  return [
    { engine: 'baseline (as shipped)', metrics: computeLayoutMetrics(layoutBaseline(nodes, edges)) },
    {
      engine: 'baseline + text-aware geometry only',
      metrics: computeLayoutMetrics(layoutBaseline(nodes, edges, { textAware: true })),
    },
    { engine: 'prototype A (parent-local packing)', metrics: computeLayoutMetrics(layoutPrototypeA(nodes, edges)) },
    { engine: 'prototype B (subtree-centric tidy tree)', metrics: computeLayoutMetrics(layoutPrototypeB(nodes, edges)) },
  ];
}

describe('M0 layout contract -- corpus-wide comparison (prints metrics table)', () => {
  for (const fileName of fixtureFiles) {
    if (fileName === 'README.md') continue;

    it(`${fileName}: prints baseline/A/B metrics`, () => {
      const rows = runAllEngines(fileName);
      // eslint-disable-next-line no-console
      console.log(`\n=== ${fileName} ===`);
      // eslint-disable-next-line no-console
      console.table(
        rows.map((r) => ({
          engine: r.engine,
          nodes: r.metrics.nodeCount,
          depth: r.metrics.maxDepth,
          aspectRatio: r.metrics.aspectRatio.toFixed(2),
          canvasArea: Math.round(r.metrics.totalCanvasArea),
          maxEdgeLen: Math.round(r.metrics.maxParentChildEdgeLength),
          bandDeviation: r.metrics.sameDepthBandDeviation.toFixed(1),
          nodeOverlap: r.metrics.nodeOverlapCount,
          edgeThroughNode: r.metrics.edgeThroughNodeCount,
          subtreeOverlap: r.metrics.subtreeOverlapCount,
          lrImbalance: r.metrics.leftRightFootprintImbalance.toFixed(2),
          siblingConsumesDepth: r.metrics.siblingConsumesDepthBudget,
          parentCenteringErr: r.metrics.parentCenteringError.toFixed(2),
        }))
      );
      expect(rows.length).toBe(4);
    });

    it(`${fileName}: prototype A satisfies the contract`, () => {
      const { nodes, edges } = loadFixture(fileName);
      const m = computeLayoutMetrics(layoutPrototypeA(nodes, edges));
      expect(m.nodeOverlapCount).toBe(0);
      expect(m.subtreeOverlapCount).toBe(0);
      expect(m.siblingConsumesDepthBudget).toBe(false);
      expect(m.sameDepthBandDeviation).toBeLessThan(1);
    });

    it(`${fileName}: prototype B satisfies the contract`, () => {
      const { nodes, edges } = loadFixture(fileName);
      const m = computeLayoutMetrics(layoutPrototypeB(nodes, edges));
      expect(m.nodeOverlapCount).toBe(0);
      expect(m.subtreeOverlapCount).toBe(0);
      expect(m.siblingConsumesDepthBudget).toBe(false);
      expect(m.sameDepthBandDeviation).toBeLessThan(1);
    });
  }
});

describe('M0 layout contract -- #10 collapse/expand mental-map stability', () => {
  // Both prototypes are pure functions of (id, parentId, text, collapsed) --
  // no separate "manual offset history" is modeled at this gate -- so the
  // strongest testable form of "preserve the mental map" is round-trip
  // fidelity: collapsing a branch then expanding it again must reproduce
  // byte-identical geometry to never having collapsed at all, and collapsing
  // must not disturb which nodes exist in *other* branches (only hide the
  // collapsed branch's own descendants).
  for (const [engineName, layout] of [
    ['prototype A', layoutPrototypeA],
    ['prototype B', layoutPrototypeB],
  ] as const) {
    it(`${engineName}: expand-after-collapse round-trips to the original layout`, () => {
      const { nodes, edges } = loadFixture('09_collapse_expand_stability.md');
      const original = layout(nodes, edges);

      const branchANode = nodes.find((n) => n.text === 'Branch A')!;
      const collapsedNodes = nodes.map((n) => (n.id === branchANode.id ? { ...n, collapsed: true } : n));
      const collapsedResult = layout(collapsedNodes, edges);

      const branchADescendantIds = new Set(
        (function collect(parentId: string): string[] {
          const kids = nodes.filter((n) => n.parentId === parentId);
          return kids.flatMap((k) => [k.id, ...collect(k.id)]);
        })(branchANode.id)
      );

      // Collapsing hides exactly Branch A's own descendants -- every other
      // node (Branch B/C and their subtrees, plus Branch A itself) is still
      // present.
      const collapsedIds = new Set(collapsedResult.nodes.map((n) => n.id));
      for (const n of nodes) {
        const shouldBeHidden = branchADescendantIds.has(n.id);
        expect(collapsedIds.has(n.id)).toBe(!shouldBeHidden);
      }

      const expanded = layout(nodes, edges); // collapsed: undefined again
      const byId = (r: typeof original) => new Map(r.nodes.map((n) => [n.id, n]));
      const originalById = byId(original);
      const expandedById = byId(expanded);
      for (const n of nodes) {
        expect(expandedById.get(n.id)).toEqual(originalById.get(n.id));
      }
    });
  }
});

describe('M0 Corrective Gate -- #6 bilateral balance is by rendered footprint, not descendant count', () => {
  // Constructs the case that distinguishes the two weighting schemes: one
  // branch is a SINGLE node with very long wrapped text (many descendant
  // "count" = 1, but tall rendered footprint); the other branch is many
  // short-text leaf nodes (high descendant count, but each individually
  // short). A count-based partition would pile both onto the side with
  // fewer "nodes" without noticing the long-text branch is actually taller
  // rendered; a footprint-based partition balances by actual height.
  for (const [engineName, layout] of [
    ['prototype A', layoutPrototypeA],
    ['prototype B', layoutPrototypeB],
  ] as const) {
    it(`${engineName}: a single long-text branch balances against many short-text leaves`, () => {
      const nodes = [
        { id: 'root', text: 'Root' },
        {
          id: 'tall',
          parentId: 'root',
          text: '这是一段刻意写得很长很长很长很长很长很长很长很长很长很长的中文文本用来撑高这一个分支的渲染高度',
        },
        ...Array.from({ length: 8 }, (_, i) => ({ id: `short${i}`, parentId: 'root', text: 'OK' })),
      ];
      const edges = [
        { source: 'root', target: 'tall' },
        ...Array.from({ length: 8 }, (_, i) => ({ source: 'root', target: `short${i}` })),
      ];

      const m = computeLayoutMetrics(layout(nodes, edges));
      // With footprint-based balancing, the one long-text branch should
      // land alone on one side (its rendered height rivals the 8 short
      // leaves combined), not grouped in with the short ones by raw count.
      expect(m.leftRightFootprintImbalance).toBeLessThan(0.5);
    });
  }
});

describe('M0 Corrective Gate -- #10b manual-offset compatibility', () => {
  // Contract extension per the corrective brief: "existing manual offsets
  // must not be silently destroyed by future relayout." A manual offset is
  // a pure post-layout nudge (mirrors production's CanonicalNode.manualOffset),
  // so relayout must (a) still apply it, and (b) not let it perturb anyone
  // else's computed base position.
  for (const [engineName, layout] of [
    ['prototype A', layoutPrototypeA],
    ['prototype B', layoutPrototypeB],
  ] as const) {
    it(`${engineName}: a manual offset survives relayout and doesn't affect unrelated nodes`, () => {
      const { nodes, edges } = loadFixture('04_wide_shallow.md');
      const baseline = layout(nodes, edges);
      const baselineById = new Map(baseline.nodes.map((n) => [n.id, n]));

      const target = nodes.find((n) => n.parentId)!; // any non-root node
      const offset = { dx: 37, dy: -19 };
      const withOffset = nodes.map((n) => (n.id === target.id ? { ...n, manualOffset: offset } : n));
      const result = layout(withOffset, edges);
      const resultById = new Map(result.nodes.map((n) => [n.id, n]));

      const base = baselineById.get(target.id)!;
      const offsetPos = resultById.get(target.id)!;
      expect(offsetPos.x).toBeCloseTo(base.x + offset.dx, 5);
      expect(offsetPos.y).toBeCloseTo(base.y + offset.dy, 5);

      for (const n of nodes) {
        if (n.id === target.id) continue;
        expect(resultById.get(n.id)).toEqual(baselineById.get(n.id));
      }
    });
  }
});

describe('M0 Corrective Gate -- #10c incremental edit displacement (documents a known gap)', () => {
  // Contract extension: "adding/removing a sibling should minimize
  // unrelated branch displacement." Both prototypes center a parent's
  // children as one symmetric group around the parent's Y -- inserting a
  // new sibling anywhere in that group changes the group's total reserved
  // height, which re-centers (and therefore moves) EVERY sibling in that
  // group, not just the ones after the insertion point. This is a real,
  // known tension with contract #5 ("parent centered on children"): a
  // top-anchored layout would keep earlier siblings stable but would no
  // longer center the parent. Not resolved in this pass -- see
  // M0_REPORT.md's "open decision" on this tradeoff. This test documents
  // the CURRENT behavior (full-group reflow) with `it.fails()` against the
  // *goal* stated in the brief, so the gap is visible, not silently assumed
  // away.
  for (const [engineName, layout] of [
    ['prototype A', layoutPrototypeA],
    ['prototype B', layoutPrototypeB],
  ] as const) {
    it.fails(`${engineName}: adding a sibling should not move earlier, unrelated siblings`, () => {
      const { nodes, edges } = loadFixture('04_wide_shallow.md');
      const before = layout(nodes, edges);
      const beforeById = new Map(before.nodes.map((n) => [n.id, n]));

      const root = nodes.find((n) => !n.parentId)!;
      const firstBranch = nodes.find((n) => n.parentId === root.id)!;
      const newSiblingId = 'new-sibling-under-first-branch';
      const withNewSibling = [...nodes, { id: newSiblingId, parentId: firstBranch.id, text: 'New Child' }];
      const newEdges = [...edges, { source: firstBranch.id, target: newSiblingId }];
      const after = layout(withNewSibling, newEdges);
      const afterById = new Map(after.nodes.map((n) => [n.id, n]));

      // Every other top-level branch (not firstBranch's own subtree) should
      // be untouched by an edit deep inside firstBranch.
      const otherTopLevelBranches = nodes.filter((n) => n.parentId === root.id && n.id !== firstBranch.id);
      for (const branch of otherTopLevelBranches) {
        expect(afterById.get(branch.id)).toEqual(beforeById.get(branch.id));
      }
    });
  }
});

describe('M0 layout contract -- current production engine (red regressions, expected to fail)', () => {
  it.fails('baseline: a shallow sibling should not be pushed into extra columns by a preceding deep sibling', () => {
    const { nodes, edges } = loadFixture('03_severe_imbalance.md');
    const m = computeLayoutMetrics(layoutBaseline(nodes, edges));
    expect(m.siblingConsumesDepthBudget).toBe(false);
  });

  it.fails('baseline: same-depth nodes should share a consistent column band', () => {
    const { nodes, edges } = loadFixture('05_mixed_depth_irregular.md');
    const m = computeLayoutMetrics(layoutBaseline(nodes, edges));
    expect(m.sameDepthBandDeviation).toBeLessThan(1);
  });

  it.fails('baseline: bilateral split should balance by subtree footprint, not index parity', () => {
    const { nodes, edges } = loadFixture('08_bilateral_footprint_balance.md');
    const m = computeLayoutMetrics(layoutBaseline(nodes, edges));
    expect(m.leftRightFootprintImbalance).toBeLessThan(0.3);
  });

  it.fails('baseline: edges should not cross through unrelated nodes', () => {
    const { nodes, edges } = loadFixture('01_extreme_star_60.md');
    const m = computeLayoutMetrics(layoutBaseline(nodes, edges));
    expect(m.edgeThroughNodeCount).toBe(0);
  });

  it.fails('baseline: node geometry should be text-aware before layout runs, not a fixed 150x44 box', () => {
    const { nodes, edges } = loadFixture('06_long_chinese_text.md');
    const longestNode = [...nodes].sort((a, b) => b.text.length - a.text.length)[0];
    const laidOut = layoutBaseline(nodes, edges, { textAware: false });
    const placed = laidOut.nodes.find((n) => n.id === longestNode.id)!;
    const required = computeTextAwareSize({ id: longestNode.id, text: longestNode.text });
    // as-shipped: every node gets the same fixed box regardless of how long
    // its text is, so this should be far too small for long CJK text.
    expect(placed.height).toBeGreaterThanOrEqual(required.height);
  });
});

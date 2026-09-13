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

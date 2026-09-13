/**
 * PROTOTYPE (M0 Corrective Gate) -- throwaway. Not wired into production.
 *
 * Compares the two candidate high-fan-out strategies (grid, radial)
 * against the plain single-column band ("none") on the corpus's extreme
 * fan-out fixture, and sweeps synthetic fan-out sizes to find where the
 * plain-band approach's edge-through-node count starts degrading badly --
 * the empirical basis for a decision-boundary threshold.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeLayoutMetrics } from './contract';
import { layoutPrototypeAAdaptive, FanoutStrategy } from './prototypeAAdaptive';
import { loadFixtureFromText } from './loadFixture';
import { ProtoEdgeInput, ProtoNodeInput } from './treeUtils';

function makeStarFanout(n: number): { nodes: ProtoNodeInput[]; edges: ProtoEdgeInput[] } {
  const nodes: ProtoNodeInput[] = [{ id: 'root', text: 'Root Topic' }];
  const edges: ProtoEdgeInput[] = [];
  for (let i = 0; i < n; i++) {
    nodes.push({ id: `c${i}`, parentId: 'root', text: `Direct Child ${i + 1}` });
    edges.push({ source: 'root', target: `c${i}` });
  }
  return { nodes, edges };
}

describe('M0 Corrective Gate -- high-fan-out strategy comparison', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const text = fs.readFileSync(path.join(fixturesDir, '01_extreme_star_60.md'), 'utf-8');
  const { nodes, edges } = loadFixtureFromText(text, 'md');

  for (const strategy of ['none', 'grid', 'radial'] as FanoutStrategy[]) {
    it(`strategy=${strategy} on 01_extreme_star_60.md`, () => {
      const result = layoutPrototypeAAdaptive(nodes, edges, { fanoutThreshold: 12, fanoutStrategy: strategy });
      const m = computeLayoutMetrics(result);
      // eslint-disable-next-line no-console
      console.log(
        `fanout strategy=${strategy}: aspect=${m.aspectRatio.toFixed(2)} area=${Math.round(m.totalCanvasArea)} ` +
          `maxEdge=${Math.round(m.maxParentChildEdgeLength)} edgeThroughNode=${m.edgeThroughNodeCount} ` +
          `nodeOverlap=${m.nodeOverlapCount} subtreeOverlap=${m.subtreeOverlapCount}`
      );
      expect(m.nodeCount).toBe(nodes.length);
    });
  }

  it('sweeps synthetic fan-out sizes with strategy=none to find where it degrades', () => {
    for (const n of [6, 12, 16, 24, 40, 60]) {
      const { nodes: sNodes, edges: sEdges } = makeStarFanout(n);
      const m = computeLayoutMetrics(layoutPrototypeAAdaptive(sNodes, sEdges, { fanoutStrategy: 'none' }));
      // eslint-disable-next-line no-console
      console.log(
        `n=${n}: aspect=${m.aspectRatio.toFixed(2)} maxEdge=${Math.round(m.maxParentChildEdgeLength)} ` +
          `edgeThroughNode=${m.edgeThroughNodeCount}`
      );
    }
    expect(true).toBe(true);
  });

  it('sweeps synthetic fan-out sizes comparing none vs grid vs radial at each size', () => {
    for (const n of [6, 12, 16, 24, 40, 60]) {
      const { nodes: sNodes, edges: sEdges } = makeStarFanout(n);
      for (const strategy of ['none', 'grid', 'radial'] as FanoutStrategy[]) {
        const m = computeLayoutMetrics(
          layoutPrototypeAAdaptive(sNodes, sEdges, { fanoutThreshold: 12, fanoutStrategy: strategy })
        );
        // eslint-disable-next-line no-console
        console.log(
          `n=${n} strategy=${strategy}: aspect=${m.aspectRatio.toFixed(2)} area=${Math.round(m.totalCanvasArea)} ` +
            `maxEdge=${Math.round(m.maxParentChildEdgeLength)} edgeThroughNode=${m.edgeThroughNodeCount} ` +
            `nodeOverlap=${m.nodeOverlapCount}`
        );
      }
    }
    expect(true).toBe(true);
  });
});

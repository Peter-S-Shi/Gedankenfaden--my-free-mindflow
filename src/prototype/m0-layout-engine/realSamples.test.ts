/**
 * PROTOTYPE (M0 gate) -- throwaway. Not wired into production import/layout.
 *
 * Reproduces the real-local-sample numbers quoted in M0_REPORT.md §4, on
 * demand, from real outline files that live *outside* this repo (per the
 * privacy rule: don't commit real personal documents into what could be a
 * public GitHub repo). Nothing here embeds their content or their absolute
 * path -- only aggregate metrics.
 *
 * Opt-in: set GEDANKENFADEN_REAL_SAMPLES_DIR to a directory of .md outline
 * files before running. Skips cleanly (not a failure) when unset or the
 * directory doesn't exist, so this suite is a no-op on any machine other
 * than the one that produced M0_REPORT.md's real-sample row.
 *
 *   GEDANKENFADEN_REAL_SAMPLES_DIR="/path/to/outlines" npx vitest run \
 *     src/prototype/m0-layout-engine/realSamples.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeLayoutMetrics } from './contract';
import { layoutPrototypeA } from './prototypeA';
import { layoutPrototypeB } from './prototypeB';
import { layoutBaseline } from './baselineAdapter';
import { loadFixtureFromText } from './loadFixture';

const realDir = process.env.GEDANKENFADEN_REAL_SAMPLES_DIR;
const available = !!realDir && fs.existsSync(realDir);

describe.skipIf(!available)('M0 layout contract -- real local sample reproduction (opt-in)', () => {
  const files = available
    ? fs.readdirSync(realDir!).filter((f) => f.endsWith('.md') && !f.includes('imported'))
    : [];

  for (const fileName of files) {
    it(`prototype A/B satisfy the contract on a real sample (${fileName.length}-char filename)`, () => {
      const text = fs.readFileSync(path.join(realDir!, fileName), 'utf-8');
      const { nodes, edges } = loadFixtureFromText(text, 'md');

      const baselineMetrics = computeLayoutMetrics(layoutBaseline(nodes, edges));
      const aMetrics = computeLayoutMetrics(layoutPrototypeA(nodes, edges));
      const bMetrics = computeLayoutMetrics(layoutPrototypeB(nodes, edges));

      // eslint-disable-next-line no-console
      console.log(
        `real sample (${nodes.length} nodes, depth ${aMetrics.maxDepth}): ` +
          `baseline edgeThroughNode=${baselineMetrics.edgeThroughNodeCount} band=${baselineMetrics.sameDepthBandDeviation.toFixed(1)} | ` +
          `A edgeThroughNode=${aMetrics.edgeThroughNodeCount} band=${aMetrics.sameDepthBandDeviation.toFixed(1)} | ` +
          `B edgeThroughNode=${bMetrics.edgeThroughNodeCount} band=${bMetrics.sameDepthBandDeviation.toFixed(1)}`
      );

      for (const m of [aMetrics, bMetrics]) {
        expect(m.nodeOverlapCount).toBe(0);
        expect(m.subtreeOverlapCount).toBe(0);
        expect(m.siblingConsumesDepthBudget).toBe(false);
        expect(m.sameDepthBandDeviation).toBeLessThan(1);
      }
    });
  }
});

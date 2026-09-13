/**
 * M1-A production regression suite for `layoutMindMapEngineV2`
 * (`src/model/mindMapLayoutEngine.ts`).
 *
 * Uses the committed neutral corpus at
 * `src/prototype/m0-layout-engine/fixtures/` (synthetic, safe to commit --
 * see that directory's own README) run through the real
 * `importFromMarkdown`/`importFromOPML` importers, then relaid-out with
 * the new engine. This suite does not depend on any prototype code --
 * assertions are written directly against the production
 * `CanonicalDocument` geometry the new engine produces.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importFromMarkdown, importFromOPML } from '../model/importers';
import { CanonicalDocument, CanonicalNode } from '../model/types';
import { createEmptyDocument } from '../model/document';
import { autoLayoutDocument, layoutMindMapDocument } from '../model/layout';
import { decideFanoutStrategy, layoutMindMapEngineV2, PROVISIONAL_FANOUT_THRESHOLD } from '../model/mindMapLayoutEngine';

const fixturesDir = path.join(__dirname, '..', 'prototype', 'm0-layout-engine', 'fixtures');

function loadCorpusDoc(fileName: string): CanonicalDocument {
  const text = fs.readFileSync(path.join(fixturesDir, fileName), 'utf-8');
  const doc = fileName.endsWith('.opml') ? importFromOPML(text) : importFromMarkdown(text);
  return layoutMindMapEngineV2(doc, { preset: 'balanced', horizontalGap: 60, verticalGap: 24 });
}

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

describe('M1-A mind map engine -- normal LR corpus keeps depth semantics without sibling-depth drift', () => {
  for (const fileName of ['02_deep_chain_24.md', '04_wide_shallow.md', '10_parent_local_packing.md']) {
    it(`${fileName}: same-depth, same-side nodes share one x band`, () => {
      const doc = loadCorpusDoc(fileName);
      const nodes = byId(doc);
      const root = rootOf(doc);
      const depthOf = new Map<string, number>();
      const childrenMap = new Map<string, CanonicalNode[]>();
      for (const n of doc.nodes) {
        if (!n.parentId) continue;
        childrenMap.set(n.parentId, [...(childrenMap.get(n.parentId) || []), n]);
      }
      const stack = [{ id: root.id, depth: 0 }];
      while (stack.length) {
        const { id, depth } = stack.pop()!;
        depthOf.set(id, depth);
        for (const c of childrenMap.get(id) || []) stack.push({ id: c.id, depth: depth + 1 });
      }

      const bands = new Map<string, number[]>();
      for (const n of doc.nodes) {
        if (n.id === root.id) continue;
        const side = n.geometry.x >= root.geometry.x ? 'right' : 'left';
        const key = `${side}:${depthOf.get(n.id)}`;
        const near = side === 'right' ? n.geometry.x : n.geometry.x + (n.geometry.width || 150);
        bands.set(key, [...(bands.get(key) || []), near]);
      }
      for (const [, xs] of bands) {
        const spread = Math.max(...xs) - Math.min(...xs);
        expect(spread).toBeLessThan(1);
      }
      expect(nodes.size).toBe(doc.nodes.length);
    });
  }

  it('03_severe_imbalance.md: no subtree overlaps and max edge length stays bounded (unlike the legacy global-cursor engine)', () => {
    const legacyDoc = layoutMindMapDocument(
      importFromMarkdown(fs.readFileSync(path.join(fixturesDir, '03_severe_imbalance.md'), 'utf-8')),
      { preset: 'balanced', horizontalGap: 60, verticalGap: 24 }
    );
    const v2Doc = loadCorpusDoc('03_severe_imbalance.md');

    function maxEdgeLength(doc: CanonicalDocument): number {
      const nodes = byId(doc);
      let max = 0;
      for (const e of doc.edges) {
        const s = nodes.get(e.source);
        const t = nodes.get(e.target);
        if (!s || !t) continue;
        const sx = s.geometry.x + (s.geometry.width || 150) / 2;
        const sy = s.geometry.y + (s.geometry.height || 44) / 2;
        const tx = t.geometry.x + (t.geometry.width || 150) / 2;
        const ty = t.geometry.y + (t.geometry.height || 44) / 2;
        max = Math.max(max, Math.hypot(tx - sx, ty - sy));
      }
      return max;
    }

    const legacyMax = maxEdgeLength(legacyDoc);
    const v2Max = maxEdgeLength(v2Doc);
    // The legacy engine's global column cursor lets one deep sibling push a
    // later, shallower sibling into extra fake columns -- this is exactly
    // the bug M1-A's engine fixes.
    expect(v2Max).toBeLessThan(legacyMax * 0.5);

    let overlaps = 0;
    for (let i = 0; i < v2Doc.nodes.length; i++) {
      for (let j = i + 1; j < v2Doc.nodes.length; j++) {
        if (rectsOverlap(v2Doc.nodes[i], v2Doc.nodes[j])) overlaps++;
      }
    }
    expect(overlaps).toBe(0);
  });
});

describe('M1-A mind map engine -- root obeys the same text-aware geometry contract as every other node', () => {
  it('a long root title grows the root box instead of staying fixed at a declared 160x48', () => {
    const doc = createEmptyDocument('Long root title test', 'mindmap');
    doc.nodes = [
      {
        id: 'root',
        type: 'root',
        text: 'This is a deliberately long root title meant to force multiple wrapped lines and grow well past the default fixed root box',
        geometry: { x: 0, y: 0 },
      },
      { id: 'child', parentId: 'root', text: 'Child', geometry: { x: 0, y: 0 } },
    ];
    doc.edges = [{ id: 'root->child', source: 'root', target: 'child' }];

    const laidOut = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const root = rootOf(laidOut);
    // A fixed 160x48 root would never exceed this; text-aware wrapping must.
    expect(root.geometry.height).toBeGreaterThan(48);
  });
});

describe('M1-A mind map engine -- text-aware footprint balancing is real', () => {
  it('06_long_chinese_text.md: node height grows to fit wrapped text before layout runs', () => {
    const doc = loadCorpusDoc('06_long_chinese_text.md');
    const longestNode = [...doc.nodes].sort((a, b) => b.text.length - a.text.length)[0];
    expect(longestNode.geometry.height).toBeGreaterThan(44);
  });

  it('07_mixed_cjk_english.md: mixed CJK/English text wraps to real heights with no node overlap', () => {
    const doc = loadCorpusDoc('07_mixed_cjk_english.md');
    // Mixed-script wrapping is exactly where a pure-CJK or pure-Latin-only
    // char-width assumption would break -- assert every node still ends up
    // with a real, non-degenerate box and none overlap once laid out.
    for (const n of doc.nodes) {
      expect(n.geometry.height).toBeGreaterThanOrEqual(44);
      expect(n.geometry.width).toBeGreaterThan(0);
    }
    let overlaps = 0;
    for (let i = 0; i < doc.nodes.length; i++) {
      for (let j = i + 1; j < doc.nodes.length; j++) {
        if (rectsOverlap(doc.nodes[i], doc.nodes[j])) overlaps++;
      }
    }
    expect(overlaps).toBe(0);

    const longestMixedNode = doc.nodes.find((n) => n.text.includes('中英文混排之后同层节点'))!;
    expect(longestMixedNode.geometry.height).toBeGreaterThan(44);
  });

  it('08_bilateral_footprint_balance.md: left/right split balances rendered footprint, not descendant count', () => {
    const doc = loadCorpusDoc('08_bilateral_footprint_balance.md');
    const root = rootOf(doc);
    const childrenMap = new Map<string, CanonicalNode[]>();
    for (const n of doc.nodes) {
      if (!n.parentId) continue;
      childrenMap.set(n.parentId, [...(childrenMap.get(n.parentId) || []), n]);
    }
    function subtreeBBoxHeight(id: string): number {
      const stack = [id];
      let minY = Infinity;
      let maxY = -Infinity;
      const nodes = byId(doc);
      while (stack.length) {
        const cur = stack.pop()!;
        const n = nodes.get(cur)!;
        minY = Math.min(minY, n.geometry.y);
        maxY = Math.max(maxY, n.geometry.y + (n.geometry.height || 44));
        for (const c of childrenMap.get(cur) || []) stack.push(c.id);
      }
      return maxY - minY;
    }
    let leftFootprint = 0;
    let rightFootprint = 0;
    for (const child of childrenMap.get(root.id) || []) {
      const side = child.geometry.x >= root.geometry.x ? 'right' : 'left';
      const h = subtreeBBoxHeight(child.id);
      if (side === 'left') leftFootprint += h;
      else rightFootprint += h;
    }
    const imbalance = Math.abs(rightFootprint - leftFootprint) / Math.max(rightFootprint, leftFootprint);
    expect(imbalance).toBeLessThan(0.3);
  });
});

describe('M1-A mind map engine -- collapsed-state and manual-offset semantics preserved', () => {
  it('09_collapse_expand_stability.md: collapsed descendants keep their data (not removed) and stay unrepositioned; expanding round-trips exactly', () => {
    const doc = importFromMarkdown(fs.readFileSync(path.join(fixturesDir, '09_collapse_expand_stability.md'), 'utf-8'));
    const original = layoutMindMapEngineV2(doc, { preset: 'balanced' });

    const branchA = doc.nodes.find((n) => n.text === 'Branch A')!;
    const collapsedInput: CanonicalDocument = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === branchA.id ? { ...n, collapsed: true } : n)),
    };
    const collapsed = layoutMindMapEngineV2(collapsedInput, { preset: 'balanced' });

    const descendantIds = new Set<string>();
    const childrenMap = new Map<string, CanonicalNode[]>();
    for (const n of doc.nodes) {
      if (!n.parentId) continue;
      childrenMap.set(n.parentId, [...(childrenMap.get(n.parentId) || []), n]);
    }
    (function collect(id: string) {
      for (const c of childrenMap.get(id) || []) {
        descendantIds.add(c.id);
        collect(c.id);
      }
    })(branchA.id);

    // Collapsing is a view-state concern, not a document-structure one:
    // hidden nodes must still exist in doc.nodes (their data isn't
    // deleted), simply left with whatever geometry they already had
    // rather than freshly repositioned -- same contract the legacy engine
    // already honors.
    expect(collapsed.nodes.length).toBe(doc.nodes.length);
    const collapsedInputById = byId(collapsedInput);
    const collapsedResultById = byId(collapsed);
    for (const id of descendantIds) {
      expect(collapsedResultById.get(id)?.geometry).toEqual(collapsedInputById.get(id)?.geometry);
    }

    const expanded = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const originalById = byId(original);
    const expandedById = byId(expanded);
    for (const n of doc.nodes) {
      expect(expandedById.get(n.id)?.geometry).toEqual(originalById.get(n.id)?.geometry);
    }
  });

  it('an extremely wide hidden descendant does not inflate the band its visible siblings render in', () => {
    const hugeText = 'W'.repeat(200);
    const doc = createEmptyDocument('Hidden width test', 'mindmap');
    doc.nodes = [
      { id: 'root', type: 'root', text: 'Root', geometry: { x: 0, y: 0 } },
      // A large dominant branch: pushes the two smaller branches below onto
      // the opposite side together (bilateral balance), so they share a
      // band on that side.
      { id: 'big', parentId: 'root', text: 'Big Branch', geometry: { x: 0, y: 0 } },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `big-child-${i}`,
        parentId: 'big',
        text: `Big Child ${i}`,
        geometry: { x: 0, y: 0 },
      })),
      // collapsedParent hides hiddenWide's extreme-width text entirely.
      { id: 'collapsedParent', parentId: 'root', text: 'Collapsed Parent', collapsed: true, geometry: { x: 0, y: 0 } },
      { id: 'hiddenWide', parentId: 'collapsedParent', text: hugeText, geometry: { x: 0, y: 0 } },
      // visibleParent's chain stays fully visible and shares a (side,
      // depth) band with hiddenWide -- the band this bug would pollute.
      { id: 'visibleParent', parentId: 'root', text: 'Visible Parent', geometry: { x: 0, y: 0 } },
      { id: 'visibleChild', parentId: 'visibleParent', text: 'Normal', geometry: { x: 0, y: 0 } },
      { id: 'visibleGrandchild', parentId: 'visibleChild', text: 'Normal Grandchild', geometry: { x: 0, y: 0 } },
    ];
    doc.edges = [
      { id: 'root->big', source: 'root', target: 'big' },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `big->big-child-${i}`, source: 'big', target: `big-child-${i}` })),
      { id: 'root->collapsedParent', source: 'root', target: 'collapsedParent' },
      { id: 'collapsedParent->hiddenWide', source: 'collapsedParent', target: 'hiddenWide' },
      { id: 'root->visibleParent', source: 'root', target: 'visibleParent' },
      { id: 'visibleParent->visibleChild', source: 'visibleParent', target: 'visibleChild' },
      { id: 'visibleChild->visibleGrandchild', source: 'visibleChild', target: 'visibleGrandchild' },
    ];

    const laidOut = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const nodes = byId(laidOut);
    const root = rootOf(laidOut);

    const collapsedParent = nodes.get('collapsedParent')!;
    const visibleParent = nodes.get('visibleParent')!;
    const sideOf = (n: CanonicalNode) => (n.geometry.x >= root.geometry.x ? 'right' : 'left');
    // Sanity check on the fixture itself: this test only exercises the bug
    // if collapsedParent and visibleParent actually share a side/band.
    expect(sideOf(collapsedParent)).toBe(sideOf(visibleParent));

    const visibleChild = nodes.get('visibleChild')!;
    const visibleGrandchild = nodes.get('visibleGrandchild')!;
    const side = sideOf(visibleParent);
    const nearEdge = (n: CanonicalNode) =>
      side === 'right' ? n.geometry.x : n.geometry.x + (n.geometry.width || 150);
    const gap = Math.abs(nearEdge(visibleGrandchild) - nearEdge(visibleChild));
    // hiddenWide's 200-char width would blow this gap past ~1500px if it
    // leaked into the shared (side, depth) band; bounded here proves the
    // hidden node was excluded.
    expect(gap).toBeLessThan(400);
  });

  it('a manual offset survives relayout and does not perturb any other node', () => {
    const doc = importFromMarkdown(fs.readFileSync(path.join(fixturesDir, '04_wide_shallow.md'), 'utf-8'));
    const baseline = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const baselineById = byId(baseline);

    const target = doc.nodes.find((n) => n.parentId)!;
    const offset = { dx: 42, dy: -17 };
    const withOffset: CanonicalDocument = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === target.id ? { ...n, manualOffset: offset } : n)),
    };
    const result = layoutMindMapEngineV2(withOffset, { preset: 'balanced' });
    const resultById = byId(result);

    const base = baselineById.get(target.id)!;
    const offsetPos = resultById.get(target.id)!;
    expect(offsetPos.geometry.x).toBeCloseTo(base.geometry.x + offset.dx, 5);
    expect(offsetPos.geometry.y).toBeCloseTo(base.geometry.y + offset.dy, 5);

    for (const n of doc.nodes) {
      if (n.id === target.id) continue;
      expect(resultById.get(n.id)?.geometry).toEqual(baselineById.get(n.id)?.geometry);
    }
  });
});

describe('M1-A mind map engine -- fan-out decision seam (M0 open item #1, not yet load-bearing)', () => {
  it('01_extreme_star_60.md: the seam is consulted but always resolves to "none" in production today', () => {
    expect(decideFanoutStrategy(60)).toEqual({ strategy: 'none' });
    expect(decideFanoutStrategy(5)).toEqual({ strategy: 'none' });
    // The provisional threshold exists for a future strategy to consult --
    // it must not silently change today's behavior.
    expect(PROVISIONAL_FANOUT_THRESHOLD).toBeGreaterThan(0);
    const doc = loadCorpusDoc('01_extreme_star_60.md');
    expect(doc.nodes.length).toBeGreaterThan(0);
  });

  it('rejects single-direction presets rather than silently mishandling them', () => {
    const doc = createEmptyDocument('LR preset test', 'mindmap');
    expect(() => layoutMindMapEngineV2(doc, { preset: 'LR' as never })).toThrow();
  });
});

describe('M1-A mind map engine -- open item #2, incremental-edit displacement (production contract, not a fake pass)', () => {
  // Carried forward from M0 exactly as the corrective brief asked: this is
  // a genuine, documented open tradeoff against contract #5 (parent
  // centered on children), not resolved in M1-A. it.fails() keeps it
  // visible in the production suite rather than silently passing.
  it.fails('adding a sibling should not move earlier, unrelated siblings', () => {
    const doc = importFromMarkdown(fs.readFileSync(path.join(fixturesDir, '04_wide_shallow.md'), 'utf-8'));
    const before = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const beforeById = byId(before);

    const root = rootOf(doc);
    const firstBranch = doc.nodes.find((n) => n.parentId === root.id)!;
    const withNewSibling: CanonicalDocument = {
      ...doc,
      nodes: [...doc.nodes, { id: 'new-sibling', parentId: firstBranch.id, text: 'New Child', geometry: { x: 0, y: 0 } }],
      edges: [...doc.edges, { id: `${firstBranch.id}->new-sibling`, source: firstBranch.id, target: 'new-sibling' }],
    };
    const after = layoutMindMapEngineV2(withNewSibling, { preset: 'balanced' });
    const afterById = byId(after);

    const otherTopLevelBranches = doc.nodes.filter((n) => n.parentId === root.id && n.id !== firstBranch.id);
    for (const branch of otherTopLevelBranches) {
      expect(afterById.get(branch.id)?.geometry).toEqual(beforeById.get(branch.id)?.geometry);
    }
  });
});

describe('M1-A mind map engine -- flowchart/Dagre isolation', () => {
  it('flowchart documents still dispatch to Dagre, unaffected by this module existing', () => {
    // layoutMindMapEngineV2 has no knowledge of flowchart mode at all, and
    // autoLayoutDocument (layout.ts) was not modified to know about it
    // either -- this confirms the dispatch is still exactly what it was.
    const doc = createEmptyDocument('Flowchart isolation check', 'flowchart');
    doc.nodes = [
      { id: 'a', text: 'A', geometry: { x: 0, y: 0, width: 160, height: 48 } },
      { id: 'b', text: 'B', geometry: { x: 0, y: 0, width: 160, height: 48 } },
    ];
    doc.edges = [{ id: 'a->b', source: 'a', target: 'b' }];

    const laidOut = autoLayoutDocument(doc);
    // Dagre's own TB default ranks 'b' below 'a' by a real margin -- proof
    // this went through the flowchart path, not the mind-map one (which
    // would have placed both around a "root" at fixed x=400,y=300).
    const a = laidOut.nodes.find((n) => n.id === 'a')!;
    const b = laidOut.nodes.find((n) => n.id === 'b')!;
    expect(b.geometry.y).toBeGreaterThan(a.geometry.y);
    expect(layoutMindMapDocument).toBeTypeOf('function');
  });
});

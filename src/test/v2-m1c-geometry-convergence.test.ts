/**
 * M1-C — Live Geometry Convergence & Acceptance Suite
 *
 * Tests the complete product path:
 *   importer → autoLayoutDocument(preset:'balanced')
 *     → node.geometry (canonical)
 *       → nodeGeometryConverges() predicate (layout ↔ export agreement)
 *       → exportToSVG (SVG box dimensions ↔ canonical geometry)
 *
 * Scope: balanced mind maps only. Flowchart/Dagre, LR/RL/TB, and the
 * legacy engine are not touched here (see M1-A/M1-B suites).
 *
 * The key acceptance question: does the canonical geometry.height the
 * V2 layout engine writes agree with what computeEffectiveNodeBoxes in the
 * exporter would derive? `nodeGeometryConverges()` is the formal predicate
 * for this. All tests here drive the real importer → layout → export path,
 * not the engine directly.
 *
 * ───────────────────────────────────────────────────────────────────────
 * DIVERGENCE A DOCUMENTATION (Canvas DOM — cannot be tested in Vitest):
 * ───────────────────────────────────────────────────────────────────────
 * The Canvas layer passes node.geometry.{width, height} to React Flow as
 * style.{width, height}. CustomNode renders text as a CSS break-words span
 * inside that container. In a live browser, if the real rendered font
 * metrics differ from the estimatedCharWidth model (Latin: 0.56em, CJK:
 * 1em), the DOM may overflow the container. This cannot be tested with Vitest
 * (no real DOM text measurement). The convergence contract tested here
 * (layout height = export effective height) is the testable proxy. The
 * full Canvas-DOM convergence proof requires a CDP/Puppeteer browser-in-
 * the-loop smoke test, deferred to a future milestone.
 * ───────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { importFromMarkdown, importFromOPML } from '../model/importers';
import { autoLayoutDocument } from '../model/layout';
import {
  computeTextAwareNodeSize,
  nodeGeometryConverges,
} from '../model/textMeasurement';
import { exportToSVG } from '../export/exporter';
import { CanonicalDocument, CanonicalNode } from '../model/types';

const fixturesDir = path.join(__dirname, '..', 'prototype', 'm0-layout-engine', 'fixtures');

function loadMarkdownFixture(fileName: string): CanonicalDocument {
  const text = fs.readFileSync(path.join(fixturesDir, fileName), 'utf-8');
  return importFromMarkdown(text);
}

function loadOpmlFixture(fileName: string): CanonicalDocument {
  const text = fs.readFileSync(path.join(fixturesDir, fileName), 'utf-8');
  return importFromOPML(text);
}

function rootOf(doc: CanonicalDocument): CanonicalNode {
  return doc.nodes.find((n) => n.type === 'root') || doc.nodes.find((n) => !n.parentId) || doc.nodes[0];
}

/** Returns nodes whose canonical geometry.height diverges from what
 *  computeTextAwareNodeSize would produce by more than 1 pixel. */
function divergentNodes(doc: CanonicalDocument): CanonicalNode[] {
  return doc.nodes.filter((n) => !nodeGeometryConverges(n));
}

// ─── Suite 1: Import width chain (Divergence B) ───────────────────────────────

describe('M1-C geometry convergence — import width chain', () => {
  it('non-root nodes from importFromMarkdown have explicit geometry.width=140, not the 150 fallback', () => {
    const doc = importFromMarkdown(`
# Root Title
- Branch A
  - Child A1
- Branch B
`);
    const root = rootOf(doc);
    const nonRoot = doc.nodes.filter((n) => n.id !== root.id);
    for (const n of nonRoot) {
      expect(n.geometry.width, `node "${n.text}" width should be 140`).toBe(140);
    }
  });

  it('root node from importFromMarkdown has geometry.width=160', () => {
    const doc = importFromMarkdown(`# A long root title\n- Branch\n`);
    const root = rootOf(doc);
    expect(root.geometry.width).toBe(160);
  });

  it('width used for layout sizing matches declared geometry.width (no silent 150 substitution)', () => {
    const doc = importFromMarkdown(`
# Root
- This is a moderately long branch label that may wrap at width 140
`);
    const branch = doc.nodes.find((n) => n.text.startsWith('This is a moderately'));
    expect(branch).toBeDefined();
    if (!branch) return;
    const actualWidth = branch.geometry.width ?? 150;
    const layoutHeight = branch.geometry.height ?? 44;
    const exporterHeight = computeTextAwareNodeSize(branch.text, {
      width: actualWidth,
      fontSize: branch.style?.fontSize,
    }).height;
    expect(Math.abs(layoutHeight - exporterHeight)).toBeLessThanOrEqual(1);
  });
});

// ─── Suite 2: Markdown import → layout → geometry convergence ─────────────────

describe('M1-C geometry convergence — Markdown import path', () => {
  it('every node after importFromMarkdown + balanced layout has height = text-wrap height', () => {
    const doc = importFromMarkdown(`
# Geometry Convergence Test Root — A Deliberately Long Title That Must Wrap
- First branch with moderate length text
  - Nested child with short text
  - Another child with a slightly longer label for wrapping
- Second branch
  - Deep 1
    - Deep 2
      - Deep 3
- Third branch with a very long label designed to push height beyond the default 44px minimum value
`);
    const bad = divergentNodes(doc);
    expect(bad, `Divergent nodes: ${bad.map((n) => `"${n.text}" (h=${n.geometry.height})`).join(', ')}`).toHaveLength(0);
  });

  it('long root title: root geometry.height > 44 AND converges', () => {
    const doc = importFromMarkdown(`
# This is a deliberately long root title that forces the root box to grow beyond its default 48px height because the text wraps
- Branch
`);
    const root = rootOf(doc);
    expect(root.geometry.height).toBeGreaterThan(44);
    expect(nodeGeometryConverges(root)).toBe(true);
  });

  it('03_severe_imbalance.md (uneven-depth tree): all nodes converge', () => {
    const doc = loadMarkdownFixture('03_severe_imbalance.md');
    const bad = divergentNodes(doc);
    expect(bad, `Divergent: ${bad.map((n) => `"${n.text}" (h=${n.geometry.height})`).join(', ')}`).toHaveLength(0);
  });
});

// ─── Suite 3: OPML import → layout → geometry convergence ─────────────────────

describe('M1-C geometry convergence — OPML import path', () => {
  it('every node after importFromOPML + balanced layout has height = text-wrap height', () => {
    const doc = loadOpmlFixture('11_opml_import_parity.opml');
    const bad = divergentNodes(doc);
    expect(bad, `Divergent: ${bad.map((n) => `"${n.text}" (h=${n.geometry.height})`).join(', ')}`).toHaveLength(0);
  });

  it('OPML with a long title: root converges at grown height', () => {
    const doc = importFromOPML(`
<opml version="2.0">
  <head><title>A deliberately long OPML root title that must wrap into multiple lines after balanced layout runs</title></head>
  <body>
    <outline text="Branch One"><outline text="Child A" /></outline>
    <outline text="Branch Two" />
  </body>
</opml>
`);
    const root = rootOf(doc);
    expect(root.geometry.height).toBeGreaterThan(44);
    expect(nodeGeometryConverges(root)).toBe(true);
    const bad = divergentNodes(doc);
    expect(bad, `Divergent: ${bad.map((n) => `"${n.text}"`).join(', ')}`).toHaveLength(0);
  });
});

// ─── Suite 4: CJK corpus fixtures ─────────────────────────────────────────────

describe('M1-C geometry convergence — CJK corpus fixtures', () => {
  it('06_long_chinese_text.md: every node converges (CJK text wraps to real heights)', () => {
    const doc = loadMarkdownFixture('06_long_chinese_text.md');
    const longNode = doc.nodes.find((n) => n.text.length > 30);
    expect(longNode?.geometry.height).toBeGreaterThan(44);
    const bad = divergentNodes(doc);
    expect(bad, `Divergent CJK nodes: ${bad.map((n) => `"${n.text.slice(0, 20)}…" h=${n.geometry.height}`).join(', ')}`).toHaveLength(0);
  });

  it('07_mixed_cjk_english.md: every node converges (mixed script)', () => {
    const doc = loadMarkdownFixture('07_mixed_cjk_english.md');
    const bad = divergentNodes(doc);
    expect(bad, `Divergent mixed-script: ${bad.map((n) => `"${n.text.slice(0, 20)}…" h=${n.geometry.height}`).join(', ')}`).toHaveLength(0);
  });
});

// ─── Suite 5: Collapsed node geometry ─────────────────────────────────────────

describe('M1-C geometry convergence — collapsed node semantics', () => {
  it('collapsed parent geometry converges; hidden descendants keep their pre-collapse geometry', () => {
    const base = importFromMarkdown(`
# Root
- Visible Branch
  - Visible Child
- Collapsible Branch
  - Hidden Child One
  - Hidden Child Two with longer text that would grow height
`);
    const beforeCollapse = autoLayoutDocument(base, { preset: 'balanced' });

    const collapsibleNode = beforeCollapse.nodes.find((n) => n.text === 'Collapsible Branch')!;
    expect(collapsibleNode).toBeDefined();

    const withCollapse: CanonicalDocument = {
      ...beforeCollapse,
      nodes: beforeCollapse.nodes.map((n) =>
        n.id === collapsibleNode.id ? { ...n, collapsed: true } : n
      ),
    };

    const afterCollapse = autoLayoutDocument(withCollapse, { preset: 'balanced' });

    const collapsedParent = afterCollapse.nodes.find((n) => n.id === collapsibleNode.id)!;
    expect(nodeGeometryConverges(collapsedParent)).toBe(true);

    // Hidden descendants must keep the geometry layout wrote before collapse
    const hiddenTexts = ['Hidden Child One', 'Hidden Child Two with longer text that would grow height'];
    for (const text of hiddenTexts) {
      const before = beforeCollapse.nodes.find((n) => n.text === text)!;
      const after = afterCollapse.nodes.find((n) => n.text === text)!;
      expect(after.geometry, `"${text}" should keep its pre-collapse geometry`).toEqual(before.geometry);
    }
  });
});

// ─── Suite 6: Manual offset ───────────────────────────────────────────────────

describe('M1-C geometry convergence — manual offset nodes', () => {
  it("an offset node's geometry.height still converges; position shifted by offset", () => {
    const base = importFromMarkdown(`
# Root
- Branch A with medium text label
- Branch B
`);
    const target = base.nodes.find((n) => n.text === 'Branch A with medium text label')!;
    expect(target).toBeDefined();

    const offset = { dx: 30, dy: -15 };
    const withOffset: CanonicalDocument = {
      ...base,
      nodes: base.nodes.map((n) =>
        n.id === target.id ? { ...n, manualOffset: offset } : n
      ),
    };

    const laid = autoLayoutDocument(withOffset, { preset: 'balanced' });
    const baseLayout = autoLayoutDocument(base, { preset: 'balanced' });

    const positioned = laid.nodes.find((n) => n.id === target.id)!;
    const baseTarget = baseLayout.nodes.find((n) => n.id === target.id)!;

    expect(positioned.geometry.x).toBeCloseTo(baseTarget.geometry.x + offset.dx, 5);
    expect(positioned.geometry.y).toBeCloseTo(baseTarget.geometry.y + offset.dy, 5);
    // Size must still converge (offset changes position, not size)
    expect(nodeGeometryConverges(positioned)).toBe(true);
  });
});

// ─── Suite 7: SVG export geometry ─────────────────────────────────────────────

describe('M1-C geometry convergence — SVG export effective boxes', () => {
  it('SVG <rect> height for each node equals its canonical geometry.height (grownBy=0 for V2 path)', () => {
    const doc = importFromMarkdown(`
# A long root title that must grow beyond the default root height
- Branch One with moderate text
  - Nested child
- Branch Two with a somewhat longer label for variety
`);

    const svg = exportToSVG(doc);

    // Parse <g id="..."><rect ... height="N"
    const gWithRect = /<g id="([^"]+)"[^>]*>[\s\S]*?<rect[^>]+height="([^"]+)"/g;
    let match;
    const exportedHeights = new Map<string, number>();
    while ((match = gWithRect.exec(svg)) !== null) {
      exportedHeights.set(match[1], Number(match[2]));
    }

    expect(exportedHeights.size).toBeGreaterThan(0);

    for (const node of doc.nodes) {
      const svgHeight = exportedHeights.get(node.id);
      if (svgHeight === undefined) continue;
      const canonicalHeight = node.geometry.height ?? 44;
      // V2 balanced path: grownBy ≈ 0, so SVG rect height ≈ canonical height
      expect(
        svgHeight,
        `node "${node.text.slice(0, 30)}" SVG h=${svgHeight} vs canonical h=${canonicalHeight}`
      ).toBeGreaterThanOrEqual(canonicalHeight);
      const computed = computeTextAwareNodeSize(node.text, {
        width: node.geometry.width,
        fontSize: node.style?.fontSize,
      });
      expect(svgHeight).toBeLessThanOrEqual(computed.height + 1);
    }
  });

  it('SVG edge start-y is close to root geometry center y (no y-shift from grownBy)', () => {
    const doc = importFromMarkdown(`
# Root
- Branch One
- Branch Two
`);
    const svg = exportToSVG(doc);
    const root = rootOf(doc);
    const rootCenterY = root.geometry.y + (root.geometry.height ?? 44) / 2;

    // Extract d="..." attribute values from <path data-edge-id="..."> elements only
    // (the SVG also contains a marker arrowhead path in <defs> which we must skip)
    const edgePathDs: string[] = [];
    const edgePathRe = /<path\s[^>]*data-edge-id="[^"]*"[^>]*\sd="([^"]+)"/g;
    let m;
    while ((m = edgePathRe.exec(svg)) !== null) {
      edgePathDs.push(m[1]);
    }

    expect(edgePathDs.length, 'SVG must contain at least one edge path element').toBeGreaterThan(0);

    // Parse first M coordinate: "M <x> <y>" — coords are floats, possibly negative
    const firstPath = edgePathDs[0];
    // Match: M optionally-signed-number optionally-signed-number
    const startCoords = firstPath.match(/^M\s+([-\d.]+)\s+([-\d.]+)/);
    expect(startCoords, `Could not parse M coord from path: "${firstPath.slice(0, 60)}"`).not.toBeNull();
    if (!startCoords) return;

    const svgStartY = Number(startCoords[2]);
    // grownBy=0 for V2 balanced docs → effective y = geometry.y → center unchanged
    expect(
      Math.abs(svgStartY - rootCenterY),
      `SVG edge start y ${svgStartY} should be close to root center y ${rootCenterY}`
    ).toBeLessThanOrEqual(2);
  });

  it('long CJK nodes: SVG rect height matches canonical geometry (no re-expansion for V2 docs)', () => {
    const doc = loadMarkdownFixture('06_long_chinese_text.md');
    const svg = exportToSVG(doc);

    const gWithRect = /<g id="([^"]+)"[^>]*>[\s\S]*?<rect[^>]+height="([^"]+)"/g;
    let match;
    const exportedHeights = new Map<string, number>();
    while ((match = gWithRect.exec(svg)) !== null) {
      exportedHeights.set(match[1], Number(match[2]));
    }

    for (const node of doc.nodes) {
      const svgHeight = exportedHeights.get(node.id);
      if (svgHeight === undefined) continue;
      const canonicalHeight = node.geometry.height ?? 44;
      expect(
        svgHeight,
        `CJK "${node.text.slice(0, 20)}…" SVG h=${svgHeight}, canonical h=${canonicalHeight}`
      ).toBeGreaterThanOrEqual(canonicalHeight);
      expect(svgHeight).toBeLessThanOrEqual(canonicalHeight + 1);
    }
  });
});

// ─── Suite 8: nodeGeometryConverges predicate contract ───────────────────────

describe('M1-C — nodeGeometryConverges predicate contract', () => {
  it('returns true for a short node with correct height', () => {
    expect(nodeGeometryConverges({ text: 'Short', geometry: { width: 140, height: 44 } })).toBe(true);
  });

  it('returns false for a node with stale fixed height that text-wrap has outgrown', () => {
    const longText = 'A very long text that must certainly wrap at width 140 and produce more than 44px height value'.repeat(2);
    expect(nodeGeometryConverges({ text: longText, geometry: { width: 140, height: 44 } })).toBe(false);
  });

  it('returns true when height equals computeTextAwareNodeSize output', () => {
    const text = 'This is a moderately long label';
    const width = 140;
    const { height } = computeTextAwareNodeSize(text, { width });
    expect(nodeGeometryConverges({ text, geometry: { width, height } })).toBe(true);
  });

  it('returns true within 1px tolerance; false at 2px deviation', () => {
    const text = 'Node';
    const width = 140;
    const { height } = computeTextAwareNodeSize(text, { width });
    expect(nodeGeometryConverges({ text, geometry: { width, height: height + 1 } })).toBe(true);
    expect(nodeGeometryConverges({ text, geometry: { width, height: height - 1 } })).toBe(true);
    expect(nodeGeometryConverges({ text, geometry: { width, height: height + 2 } })).toBe(false);
  });
});

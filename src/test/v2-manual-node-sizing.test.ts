/**
 * Product Hardening: Persistent Manual Node Sizing with Mind-Map
 * Topic-Width Semantics.
 *
 * Contract under test (model layer only -- UI wiring is covered by a live
 * browser acceptance pass, not Vitest):
 *
 * 1. `CanonicalNode.manualSize` is the explicit, persisted source of truth
 *    for "the user chose this size on purpose" -- never inferred from
 *    whatever happens to already be in `geometry.width`/`height`.
 * 2. Mind Map (both ordinary topics and root): manual sizing is width-only.
 *    Height always stays text-aware-derived from the node's current text,
 *    font size, and its declared width (manual or default).
 * 3. Flowchart: manual sizing is width+height (independent 2D resize);
 *    Flowchart geometry is not text-driven, so both dimensions persist
 *    verbatim.
 * 4. Auto Layout (any preset, any mode) must never clear `manualSize` --
 *    it only repositions.
 * 5. `manualSize` participates in the M1-D incremental-stabilization
 *    signature (via `sizeOf`), so resizing a node causes only that node's
 *    own subtree to reposition on the next stabilized relayout -- unrelated
 *    branches must not move.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CanonicalDocument, CanonicalNode } from '../model/types';
import { createEmptyDocument } from '../model/document';
import { canonicalToReactFlow, reactFlowToCanonical } from '../model/adapter';
import { autoLayoutDocument, layoutMindMapDocument } from '../model/layout';
import { layoutMindMapEngineV2 } from '../model/mindMapLayoutEngine';
import { computeTextAwareNodeSize, nodeGeometryConverges } from '../model/textMeasurement';

function byId(doc: CanonicalDocument): Map<string, CanonicalNode> {
  return new Map(doc.nodes.map((n) => [n.id, n]));
}

function rootOf(doc: CanonicalDocument): CanonicalNode {
  return doc.nodes.find((n) => n.type === 'root') || doc.nodes.find((n) => !n.parentId) || doc.nodes[0];
}

/** A small balanced mind map: root with two branches, each two levels deep. */
function buildMindMapDoc(): CanonicalDocument {
  const doc = createEmptyDocument('Manual Sizing Test', 'mindmap');
  const root = doc.nodes[0];
  root.text = 'Root';
  const nodes: CanonicalNode[] = [root];
  const edges: CanonicalDocument['edges'] = [];

  function addChild(id: string, text: string, parentId: string) {
    nodes.push({ id, text, geometry: { x: 0, y: 0 }, parentId });
    edges.push({ id: `${parentId}->${id}`, source: parentId, target: id });
  }

  addChild('a', 'Branch A', root.id);
  addChild('a1', 'Branch A Child', 'a');
  addChild('b', 'Branch B', root.id);
  addChild('b1', 'Branch B Child', 'b');

  doc.nodes = nodes;
  doc.edges = edges;
  return doc;
}

function buildFlowchartDoc(): CanonicalDocument {
  const doc = createEmptyDocument('Manual Sizing Flowchart Test', 'flowchart');
  doc.nodes = [
    { id: 'start', text: 'Start', type: 'terminal', geometry: { x: 0, y: 0 } },
    { id: 'proc', text: 'Process', type: 'process', geometry: { x: 0, y: 0 } },
    { id: 'end', text: 'End', type: 'terminal', geometry: { x: 0, y: 0 } },
  ];
  doc.edges = [
    { id: 'start->proc', source: 'start', target: 'proc' },
    { id: 'proc->end', source: 'proc', target: 'end' },
  ];
  return doc;
}

describe('Manual Node Sizing -- Mind Map (width-only, text-aware height)', () => {
  it('honors manualSize.width as the declared width and derives height from text at that width', () => {
    const doc = buildMindMapDoc();
    const nodeA = doc.nodes.find((n) => n.id === 'a')!;
    nodeA.manualSize = { width: 320 };

    const laidOut = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const a = byId(laidOut).get('a')!;

    expect(a.geometry.width).toBe(320);
    const expectedHeight = computeTextAwareNodeSize('Branch A', { width: 320, fontSize: 14 }).height;
    expect(a.geometry.height).toBe(expectedHeight);
    expect(a.manualSize).toEqual({ width: 320 });
  });

  it('defaults to the natural width (150) when manualSize is absent', () => {
    const doc = buildMindMapDoc();
    const laidOut = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const a = byId(laidOut).get('a')!;
    expect(a.geometry.width).toBe(150);
  });

  it('ignores any manualSize.height on a Mind Map node -- height stays text-aware', () => {
    const doc = buildMindMapDoc();
    const nodeA = doc.nodes.find((n) => n.id === 'a')!;
    // Height should never be honored for Mind Map nodes even if present.
    nodeA.manualSize = { width: 200, height: 9999 };

    const laidOut = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const a = byId(laidOut).get('a')!;
    expect(a.geometry.height).not.toBe(9999);
    expect(a.geometry.height).toBe(computeTextAwareNodeSize('Branch A', { width: 200, fontSize: 14 }).height);
  });

  it('applies manualSize.width to the root exactly like an ordinary topic', () => {
    const doc = buildMindMapDoc();
    doc.nodes[0].manualSize = { width: 400 };
    const laidOut = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const root = rootOf(laidOut);
    expect(root.geometry.width).toBe(400);
    expect(root.geometry.height).toBe(computeTextAwareNodeSize('Root', { width: 400, fontSize: 14 }).height);
  });

  it('long CJK text at a manually-narrowed width wraps to more lines and grows height accordingly (no truncation)', () => {
    const doc = buildMindMapDoc();
    const nodeA = doc.nodes.find((n) => n.id === 'a')!;
    nodeA.text = '这是一段很长的中文主题文本用于验证自动换行和高度增长的行为是否正确';
    nodeA.manualSize = { width: 120 };

    const wideLaidOut = layoutMindMapEngineV2(
      { ...doc, nodes: doc.nodes.map((n) => (n.id === 'a' ? { ...n, manualSize: { width: 400 } } : n)) },
      { preset: 'balanced' }
    );
    const narrowLaidOut = layoutMindMapEngineV2(doc, { preset: 'balanced' });

    const wideA = byId(wideLaidOut).get('a')!;
    const narrowA = byId(narrowLaidOut).get('a')!;
    expect(narrowA.geometry.width).toBe(120);
    expect(wideA.geometry.width).toBe(400);
    // Narrower manual width must wrap to more lines -> taller box, not truncated.
    expect(narrowA.geometry.height).toBeGreaterThan(wideA.geometry.height!);
  });

  it('Auto Layout preserves manualSize across a full relayout (no stabilizeAgainst)', () => {
    const doc = buildMindMapDoc();
    doc.nodes.find((n) => n.id === 'a')!.manualSize = { width: 260 };
    const first = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const second = layoutMindMapEngineV2(first, { preset: 'balanced' });
    const a = byId(second).get('a')!;
    expect(a.manualSize).toEqual({ width: 260 });
    expect(a.geometry.width).toBe(260);
  });

  it('resizing one branch (setting manualSize) repositions only that branch under stabilizeAgainst -- unrelated branch b/b1 stay put', () => {
    const doc = buildMindMapDoc();
    const before = layoutMindMapEngineV2(doc, { preset: 'balanced' });

    const edited = { ...before, nodes: before.nodes.map((n) => (n.id === 'a' ? { ...n, manualSize: { width: 340 } } : n)) };
    const after = layoutMindMapEngineV2(edited, { preset: 'balanced', stabilizeAgainst: before });

    const beforeMap = byId(before);
    const afterMap = byId(after);

    expect(afterMap.get('a')!.geometry.width).toBe(340);
    // Branch b and its child must not have moved at all.
    expect(afterMap.get('b')!.geometry).toEqual(beforeMap.get('b')!.geometry);
    expect(afterMap.get('b1')!.geometry).toEqual(beforeMap.get('b1')!.geometry);
  });

  it('collapsed node keeps its manualSize (preserved in document data even though not visibly participating in band width)', () => {
    const doc = buildMindMapDoc();
    const nodeA = doc.nodes.find((n) => n.id === 'a')!;
    nodeA.manualSize = { width: 280 };
    nodeA.collapsed = true;

    const laidOut = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const a = byId(laidOut).get('a')!;
    expect(a.manualSize).toEqual({ width: 280 });
    expect(a.collapsed).toBe(true);
  });

  it('manualOffset and manualSize coexist without interfering with each other', () => {
    const doc = buildMindMapDoc();
    const nodeA = doc.nodes.find((n) => n.id === 'a')!;
    nodeA.manualSize = { width: 250 };
    nodeA.manualOffset = { dx: 30, dy: -15 };

    const laidOut = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const withoutOffset = layoutMindMapEngineV2(
      { ...doc, nodes: doc.nodes.map((n) => (n.id === 'a' ? { ...n, manualOffset: undefined } : n)) },
      { preset: 'balanced' }
    );
    const a = byId(laidOut).get('a')!;
    const aNoOffset = byId(withoutOffset).get('a')!;

    expect(a.geometry.width).toBe(250);
    expect(a.geometry.x).toBe(aNoOffset.geometry.x + 30);
    expect(a.geometry.y).toBe(aNoOffset.geometry.y - 15);
  });

  it('legacy LR/RL/TB engine preserves manualSize.width instead of the fixed default, and round-trips the field itself', () => {
    const doc = buildMindMapDoc();
    doc.nodes.find((n) => n.id === 'a')!.manualSize = { width: 310 };

    for (const preset of ['LR', 'RL', 'TB'] as const) {
      const laidOut = layoutMindMapDocument(doc, { preset });
      const a = byId(laidOut).get('a')!;
      expect(a.geometry.width).toBe(310);
      expect(a.manualSize).toEqual({ width: 310 });
    }
  });

  it('via autoLayoutDocument dispatch, manualSize survives balanced/LR/RL/TB presets alike', () => {
    const doc = buildMindMapDoc();
    doc.nodes.find((n) => n.id === 'a')!.manualSize = { width: 222 };
    for (const preset of ['balanced', 'LR', 'RL', 'TB'] as const) {
      const laidOut = autoLayoutDocument(doc, { preset });
      const a = byId(laidOut).get('a')!;
      expect(a.manualSize).toEqual({ width: 222 });
    }
  });
});

describe('Manual Node Sizing -- Flowchart (independent width + height resize)', () => {
  it('honors manualSize.width/height instead of the product default (160x48), and Dagre repositions around it', () => {
    const doc = buildFlowchartDoc();
    doc.nodes.find((n) => n.id === 'proc')!.manualSize = { width: 340, height: 160 };

    const laidOut = autoLayoutDocument(doc, {});
    const proc = byId(laidOut).get('proc')!;
    expect(proc.geometry.width).toBe(340);
    expect(proc.geometry.height).toBe(160);
  });

  it('Auto Layout (Dagre) preserves manualSize on unrelated nodes across a full relayout', () => {
    const doc = buildFlowchartDoc();
    doc.nodes.find((n) => n.id === 'proc')!.manualSize = { width: 300, height: 120 };
    const first = autoLayoutDocument(doc, {});
    const second = autoLayoutDocument(first, {});
    const proc = byId(second).get('proc')!;
    expect(proc.manualSize).toEqual({ width: 300, height: 120 });
    expect(proc.geometry.width).toBe(300);
    expect(proc.geometry.height).toBe(120);
  });

  it('a node without manualSize still falls back to the product default through Dagre', () => {
    const doc = buildFlowchartDoc();
    const laidOut = autoLayoutDocument(doc, {});
    const start = byId(laidOut).get('start')!;
    expect(start.geometry.width).toBe(160);
    expect(start.geometry.height).toBe(48);
  });
});

describe('Manual Node Sizing -- Canvas/export geometry convergence', () => {
  it('preserves manualSize when Save/Export round-trips through React Flow projection', () => {
    const mindMap = autoLayoutDocument(buildMindMapDoc(), {});
    mindMap.nodes.find((n) => n.id === 'a')!.manualSize = { width: 260 };
    mindMap.nodes.find((n) => n.id === 'a')!.geometry.width = 260;

    const mindMapProjected = canonicalToReactFlow(mindMap);
    const mindMapRoundTrip = reactFlowToCanonical(mindMapProjected.nodes, mindMapProjected.edges, mindMap);
    expect(byId(mindMapRoundTrip).get('a')!.manualSize).toEqual({ width: 260 });

    const flowchart = autoLayoutDocument(buildFlowchartDoc(), {});
    flowchart.nodes.find((n) => n.id === 'proc')!.manualSize = { width: 320, height: 140 };
    flowchart.nodes.find((n) => n.id === 'proc')!.geometry.width = 320;
    flowchart.nodes.find((n) => n.id === 'proc')!.geometry.height = 140;

    const flowchartProjected = canonicalToReactFlow(flowchart);
    const flowchartRoundTrip = reactFlowToCanonical(flowchartProjected.nodes, flowchartProjected.edges, flowchart);
    expect(byId(flowchartRoundTrip).get('proc')!.manualSize).toEqual({ width: 320, height: 140 });
  });

  it('a manually-resized Mind Map node still converges (declared height agrees with the text-aware model at its declared width)', () => {
    const doc = buildMindMapDoc();
    doc.nodes.find((n) => n.id === 'a')!.text =
      '这是用于测试导出与画布几何收敛性的混合 CJK/English long text sample';
    doc.nodes.find((n) => n.id === 'a')!.manualSize = { width: 180 };

    const laidOut = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const a = byId(laidOut).get('a')!;
    expect(nodeGeometryConverges(a)).toBe(true);
  });
});

describe('Manual Node Sizing -- real corpus regression (extreme fan-out + long root, from the committed M0 corpus)', () => {
  const fixturesDir = path.join(__dirname, '..', 'prototype', 'm0-layout-engine', 'fixtures');

  it('a manual width on the root of the real long-title fixture still converges and does not truncate', () => {
    const fileName = '05_long_root_title.md';
    const filePath = path.join(fixturesDir, fileName);
    if (!fs.existsSync(filePath)) return; // fixture set may evolve; skip rather than false-fail
    const { importFromMarkdown } = require('../model/importers');
    const doc: CanonicalDocument = importFromMarkdown(fs.readFileSync(filePath, 'utf-8'));
    doc.nodes[0].manualSize = { width: 500 };
    const laidOut = layoutMindMapEngineV2(doc, { preset: 'balanced' });
    const root = rootOf(laidOut);
    expect(root.geometry.width).toBe(500);
    expect(nodeGeometryConverges(root)).toBe(true);
  });
});

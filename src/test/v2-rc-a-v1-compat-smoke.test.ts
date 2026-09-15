/**
 * RC-A isolated compatibility smoke test.
 *
 * Proves the V2.0.0 release candidate can open a representative v1.0.0
 * `.mflow` container / persisted document and continue to save it -- using
 * an entirely synthetic, hand-built fixture that reproduces exactly what
 * V1's container writer (`meta.generator: 'Gedankenfaden 1.0'`, schema
 * version '1.0', no V2-only optional fields such as `annotations`) would
 * have produced. This test never reads or writes any real user file, path,
 * or library directory -- everything here is an in-memory byte buffer.
 */
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseMflowFromBytes, packageDocumentToMflow } from '../model/container';
import { deserializeDocument, serializeDocument } from '../model/document';
import { validateCanonicalDocument } from '../model/validator';
import { CanonicalDocument } from '../model/types';

function buildV1ShapedDocument(): CanonicalDocument {
  // Deliberately V1-era shape: no `annotations` field, no manualSize, no
  // F6-F10/EX-01..EX-11-era optional fields -- only what V1.0.0's schema
  // v1.0 canonical model actually wrote.
  return {
    schemaVersion: '1.0',
    id: 'doc_v1_fixture_0001',
    title: 'V1 Compatibility Fixture',
    mode: 'mindmap',
    createdAt: '2025-06-01T12:00:00.000Z',
    updatedAt: '2025-06-01T12:05:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    theme: {
      paletteId: 'nordic-slate',
      canvasBackground: 'dots',
      fontFamily: 'sans',
      defaultEdgeRouting: 'smoothstep',
    },
    nodes: [
      {
        id: 'node_root',
        text: 'Central Topic',
        type: 'root',
        geometry: { x: 400, y: 300, width: 160, height: 48 },
        style: { backgroundColor: '#2563eb', borderColor: '#1d4ed8', textColor: '#ffffff', borderRadius: 8 },
      },
      {
        id: 'node_child_1',
        text: 'Legacy Child Topic',
        parentId: 'node_root',
        geometry: { x: 640, y: 260, width: 140, height: 44 },
      },
    ],
    edges: [
      { id: 'edge_root_child_1', source: 'node_root', target: 'node_child_1', type: 'smoothstep' },
    ],
    groups: [],
  };
}

/** Hand-builds a .mflow zip byte buffer matching V1's exact container shape (not using V2's packager). */
function buildV1ShapedMflowBytes(doc: CanonicalDocument): Uint8Array {
  const meta = {
    schemaVersion: doc.schemaVersion,
    id: doc.id,
    title: doc.title,
    mode: doc.mode,
    nodeCount: doc.nodes.length,
    edgeCount: doc.edges.length,
    updatedAt: doc.updatedAt,
    paletteId: doc.theme.paletteId,
    generator: 'Gedankenfaden 1.0',
  };
  return zipSync({
    'document.json': strToU8(JSON.stringify(doc, null, 2)),
    'meta.json': strToU8(JSON.stringify(meta, null, 2)),
  });
}

describe('RC-A: v1.0.0 -> v2.0.0 candidate compatibility smoke', () => {
  it('a representative v1.0.0-shaped canonical document passes the current validator unchanged', () => {
    const doc = buildV1ShapedDocument();
    const result = validateCanonicalDocument(doc);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('the V2 candidate opens a byte-for-byte v1.0.0-shaped .mflow container (hand-built, not V2-authored)', () => {
    const doc = buildV1ShapedDocument();
    const v1Bytes = buildV1ShapedMflowBytes(doc);

    const parsed = parseMflowFromBytes(v1Bytes);

    expect(parsed.document.id).toBe(doc.id);
    expect(parsed.document.title).toBe('V1 Compatibility Fixture');
    expect(parsed.document.nodes).toHaveLength(2);
    expect(parsed.document.edges).toHaveLength(1);
    expect(parsed.meta.generator).toBe('Gedankenfaden 1.0');
  });

  it('the opened v1.0.0 document can be resaved through the current .mflow packager and reopened losslessly', () => {
    const doc = buildV1ShapedDocument();
    const v1Bytes = buildV1ShapedMflowBytes(doc);
    const opened = parseMflowFromBytes(v1Bytes).document;

    // "Continue to save" -- round-trip through V2's current packager.
    const resavedBytes = packageDocumentToMflow(opened);
    const reopened = parseMflowFromBytes(resavedBytes).document;

    expect(reopened.id).toBe(doc.id);
    expect(reopened.title).toBe(doc.title);
    expect(reopened.nodes).toEqual(doc.nodes);
    expect(reopened.edges).toEqual(doc.edges);
    expect(reopened.groups).toEqual(doc.groups);
  });

  it('the V2 candidate opens a raw v1.0.0-shaped .json document export the same way', () => {
    const doc = buildV1ShapedDocument();
    const json = JSON.stringify(doc, null, 2); // what V1's exportToJSON/serializeDocument produced verbatim
    const opened = deserializeDocument(json);
    expect(opened.id).toBe(doc.id);
    expect(opened.nodes).toHaveLength(2);

    // Continues to save through the current serializer without alteration.
    const resaved = serializeDocument(opened);
    expect(deserializeDocument(resaved).nodes).toEqual(doc.nodes);
  });

  it('a v1.0.0 Flowchart-mode document (no annotations, no manualSize) also opens and resaves cleanly', () => {
    const flowchartDoc: CanonicalDocument = {
      ...buildV1ShapedDocument(),
      id: 'doc_v1_flowchart_fixture',
      mode: 'flowchart',
      nodes: [
        { id: 'n1', text: 'Start', geometry: { x: 0, y: 0, width: 120, height: 44 } },
        { id: 'n2', text: 'End', geometry: { x: 200, y: 0, width: 120, height: 44 } },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', type: 'orthogonal' }],
    };
    const v1Bytes = buildV1ShapedMflowBytes(flowchartDoc);
    const opened = parseMflowFromBytes(v1Bytes).document;
    expect(opened.mode).toBe('flowchart');

    const resaved = packageDocumentToMflow(opened);
    const reopened = parseMflowFromBytes(resaved).document;
    expect(reopened.nodes).toEqual(flowchartDoc.nodes);
    expect(reopened.edges).toEqual(flowchartDoc.edges);
  });
});

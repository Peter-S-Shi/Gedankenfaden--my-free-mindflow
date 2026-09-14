import { describe, it, expect } from 'vitest';
import {
  CanonicalDocument,
  BoundaryAnnotation,
} from '../model/types';
import { createEmptyDocument, serializeDocument, deserializeDocument, cloneDocument } from '../model/document';
import { validateCanonicalDocument } from '../model/validator';
import {
  createBoundaryAnnotations,
  createBraceAnnotations,
  createRelationshipLineAnnotation,
  computeBoundaryBox,
  computeBraceGeometry,
  computeRelationshipCurve,
  pruneOrphanAnnotations,
} from '../model/annotations';
import { reactFlowToCanonical, canonicalToReactFlow } from '../model/adapter';
import { autoLayoutDocument } from '../model/layout';
import { deleteNodePreservingChildren } from '../model/deletion';

describe('V2 Mind Map Annotations Integration (Tickets 2, 3, 4, 5)', () => {
  function createTestMindMap(): CanonicalDocument {
    const doc = createEmptyDocument('Annotations Test Doc', 'mindmap');
    // Root + 4 children
    doc.nodes = [
      { id: 'root', text: 'Central Root', type: 'root', geometry: { x: 0, y: 0, width: 140, height: 44 } },
      { id: 'topic_1', parentId: 'root', text: 'Topic 1', geometry: { x: 200, y: -80, width: 100, height: 36 }, mindMapSide: 'right' },
      { id: 'topic_2', parentId: 'root', text: 'Topic 2', geometry: { x: 200, y: -20, width: 100, height: 36 }, mindMapSide: 'right' },
      { id: 'topic_3', parentId: 'root', text: 'Topic 3', geometry: { x: 200, y: 40, width: 100, height: 36 }, mindMapSide: 'right' },
      { id: 'sub_1_1', parentId: 'topic_1', text: 'Sub 1.1', geometry: { x: 360, y: -80, width: 80, height: 32 }, mindMapSide: 'right' },
    ];
    doc.edges = [
      { id: 'root->topic_1', source: 'root', target: 'topic_1' },
      { id: 'root->topic_2', source: 'root', target: 'topic_2' },
      { id: 'root->topic_3', source: 'root', target: 'topic_3' },
      { id: 'topic_1->sub_1_1', source: 'topic_1', target: 'sub_1_1' },
    ];
    return doc;
  }

  describe('Model Validation and Persistence Round-Trip', () => {
    it('validates and serializes a canonical document with annotations', () => {
      const doc = createTestMindMap();
      const boundaries = createBoundaryAnnotations(['topic_1', 'topic_2'], doc.nodes);
      const braces = createBraceAnnotations(['topic_2', 'topic_3'], doc.nodes);
      const relLine = createRelationshipLineAnnotation('sub_1_1', 'topic_3')!;

      doc.annotations = [...boundaries, ...braces, relLine];

      const validation = validateCanonicalDocument(doc);
      expect(validation.valid).toBe(true);

      const serialized = serializeDocument(doc);
      expect(serialized).toContain('"kind": "boundary"');
      expect(serialized).toContain('"kind": "brace"');
      expect(serialized).toContain('"kind": "relationshipLine"');

      const restored = deserializeDocument(serialized);
      expect(restored.annotations).toHaveLength(3);
      expect(restored.annotations?.[0].kind).toBe('boundary');
      expect(restored.annotations?.[1].kind).toBe('brace');
      expect(restored.annotations?.[2].kind).toBe('relationshipLine');
    });

    it('preserves annotations across cloneDocument and reactFlowToCanonical projection round-trip', () => {
      const doc = createTestMindMap();
      const boundary = createBoundaryAnnotations(['topic_1'], doc.nodes)[0];
      doc.annotations = [boundary];

      const cloned = cloneDocument(doc);
      expect(cloned.annotations).toHaveLength(1);
      expect(cloned.annotations?.[0].id).toBe(boundary.id);

      const rf = canonicalToReactFlow(doc);
      const roundTrippedDoc = reactFlowToCanonical(rf.nodes, rf.edges, doc);
      expect(roundTrippedDoc.annotations).toHaveLength(1);
      expect(roundTrippedDoc.annotations?.[0].id).toBe(boundary.id);
    });
  });

  describe('Dynamic Layout & Geometry Tracking', () => {
    it('boundary bounding box automatically reflows when Auto Layout updates node coordinates', () => {
      const doc = createTestMindMap();
      const [boundary] = createBoundaryAnnotations(['topic_1'], doc.nodes);
      doc.annotations = [boundary];

      const initialBox = computeBoundaryBox(boundary, doc.nodes, 12)!;
      expect(initialBox).toBeDefined();

      // Run Auto Layout
      const layoutedDoc = autoLayoutDocument(doc, { preset: 'balanced' });
      const reflowedBox = computeBoundaryBox(boundary, layoutedDoc.nodes, 12)!;

      expect(reflowedBox).toBeDefined();
      // Bounding box dynamically matches new layouted topic_1 and sub_1_1 positions
      const topic1 = layoutedDoc.nodes.find((n) => n.id === 'topic_1')!;
      const sub1 = layoutedDoc.nodes.find((n) => n.id === 'sub_1_1')!;
      const minX = Math.min(topic1.geometry.x, sub1.geometry.x);
      expect(reflowedBox.x).toBe(minX - 12);
    });

    it('relationship line curve tracks moving endpoints across layout changes', () => {
      const doc = createTestMindMap();
      const relLine = createRelationshipLineAnnotation('sub_1_1', 'topic_3')!;
      doc.annotations = [relLine];

      const curveBefore = computeRelationshipCurve(relLine, doc.nodes)!;
      const layoutedDoc = autoLayoutDocument(doc, { preset: 'balanced' });
      const curveAfter = computeRelationshipCurve(relLine, layoutedDoc.nodes)!;

      expect(curveBefore).toBeDefined();
      expect(curveAfter).toBeDefined();
      expect(curveAfter.p1).not.toEqual(curveBefore.p1);
    });

    it('brace geometry tracks vertical span of grouped nodes', () => {
      const doc = createTestMindMap();
      const [brace] = createBraceAnnotations(['topic_1', 'topic_2', 'topic_3'], doc.nodes);
      doc.annotations = [brace];

      const geom = computeBraceGeometry(brace, doc.nodes, 16)!;
      expect(geom).toBeDefined();
      expect(geom.topY).toBe(-80); // top of topic_1
      expect(geom.bottomY).toBe(76); // bottom of topic_3 (40 + 36)
      expect(geom.side).toBe('right');
    });
  });

  describe('Deletion Cascade and Pruning', () => {
    it('prunes orphan relationship line when source or target node is deleted', () => {
      const doc = createTestMindMap();
      const relLine = createRelationshipLineAnnotation('sub_1_1', 'topic_3')!;
      doc.annotations = [relLine];

      // Delete sub_1_1
      const survivingNodeIds = new Set(doc.nodes.filter((n) => n.id !== 'sub_1_1').map((n) => n.id));
      const pruned = pruneOrphanAnnotations(doc.annotations, survivingNodeIds);

      expect(pruned).toHaveLength(0);
    });

    it('shrinks boundary nodeIds and preserves valid nodes when one anchor is deleted', () => {
      const doc = createTestMindMap();
      const [boundary] = createBoundaryAnnotations(['topic_1', 'topic_2'], doc.nodes);
      doc.annotations = [boundary];

      // Delete topic_2
      const survivingNodeIds = new Set(doc.nodes.filter((n) => n.id !== 'topic_2').map((n) => n.id));
      const pruned = pruneOrphanAnnotations(doc.annotations, survivingNodeIds);

      expect(pruned).toHaveLength(1);
      expect((pruned[0] as BoundaryAnnotation).nodeIds).toEqual(['topic_1']);
    });

    it('deleteNodePreservingChildren automatically prunes dependent annotations', () => {
      const doc = createTestMindMap();
      const relLine = createRelationshipLineAnnotation('topic_1', 'topic_3')!;
      doc.annotations = [relLine];

      const nextDoc = deleteNodePreservingChildren(doc, 'topic_1');
      expect(nextDoc.annotations).toHaveLength(0);
    });
  });

  describe('Annotation Style Updates & Control Points', () => {
    it('supports customizing boundary visual styling', () => {
      const doc = createTestMindMap();
      const [boundary] = createBoundaryAnnotations(['topic_1'], doc.nodes);
      boundary.title = 'Key Highlights';
      boundary.style = {
        borderColor: '#10b981',
        borderStyle: 'solid',
        borderWidth: 2,
        fillColor: '#10b981',
        fillOpacity: 0.12,
        borderRadius: 16,
      };

      expect(boundary.title).toBe('Key Highlights');
      expect(boundary.style.borderStyle).toBe('solid');
      expect(boundary.style.fillOpacity).toBe(0.12);
    });

    it('supports customizing relationship line control points offset route', () => {
      const doc = createTestMindMap();
      const relLine = createRelationshipLineAnnotation('topic_1', 'topic_3')!;
      relLine.route = {
        c1Offset: { dx: 40, dy: -20 },
        c2Offset: { dx: -30, dy: 15 },
      };

      const curve = computeRelationshipCurve(relLine, doc.nodes)!;
      expect(curve).toBeDefined();
      expect(curve.pathD).toContain('C');
    });

    it('supports relationship line label text customization and round-trip persistence', () => {
      const doc = createTestMindMap();
      const relLine = createRelationshipLineAnnotation('topic_1', 'topic_3')!;
      relLine.label = 'Depends on';
      doc.annotations = [relLine];

      const serialized = serializeDocument(doc);
      expect(serialized).toContain('"label": "Depends on"');

      const restored = deserializeDocument(serialized);
      expect(restored.annotations?.[0].label).toBe('Depends on');
    });
  });
});

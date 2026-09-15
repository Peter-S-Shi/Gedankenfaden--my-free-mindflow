import { describe, it, expect } from 'vitest';
import { CanonicalNode } from '../model/types';
import {
  collectSubtreeNodeIds,
  groupNodesForBoundary,
  createBoundaryAnnotations,
  groupNodesForBrace,
  createBraceAnnotations,
  createRelationshipLineAnnotation,
  computeBoundaryBox,
  computeBraceGeometry,
  computeRelationshipCurve,
  pruneOrphanAnnotations,
} from '../model/annotations';

describe('V2 Mind Map Annotations Model & Grouping Algorithms (Ticket 1)', () => {
  // Setup standard tree:
  // Root
  //  ├── P1 (id: p1)
  //  │    ├── A (id: a)
  //  │    ├── B (id: b)
  //  │    ├── C (id: c)
  //  │    ├── D (id: d)
  //  │    ├── E (id: e)
  //  │    └── F (id: f)
  //  └── P2 (id: p2)
  //       ├── X (id: x)
  //       └── Y (id: y)
  const mockNodes: CanonicalNode[] = [
    { id: 'root', text: 'Root', geometry: { x: 0, y: 0, width: 100, height: 40 } },
    { id: 'p1', parentId: 'root', text: 'P1', geometry: { x: 200, y: -100, width: 80, height: 36 }, mindMapSide: 'right' },
    { id: 'a', parentId: 'p1', text: 'A', geometry: { x: 350, y: -180, width: 60, height: 30 }, mindMapSide: 'right' },
    { id: 'b', parentId: 'p1', text: 'B', geometry: { x: 350, y: -140, width: 60, height: 30 }, mindMapSide: 'right' },
    { id: 'c', parentId: 'p1', text: 'C', geometry: { x: 350, y: -100, width: 60, height: 30 }, mindMapSide: 'right' },
    { id: 'd', parentId: 'p1', text: 'D', geometry: { x: 350, y: -60, width: 60, height: 30 }, mindMapSide: 'right' },
    { id: 'e', parentId: 'p1', text: 'E', geometry: { x: 350, y: -20, width: 60, height: 30 }, mindMapSide: 'right' },
    { id: 'f', parentId: 'p1', text: 'F', geometry: { x: 350, y: 20, width: 60, height: 30 }, mindMapSide: 'right' },
    { id: 'p2', parentId: 'root', text: 'P2', geometry: { x: 200, y: 100, width: 80, height: 36 }, mindMapSide: 'right' },
    { id: 'x', parentId: 'p2', text: 'X', geometry: { x: 350, y: 80, width: 60, height: 30 }, mindMapSide: 'right' },
    { id: 'y', parentId: 'p2', text: 'Y', geometry: { x: 350, y: 120, width: 60, height: 30 }, mindMapSide: 'right' },
  ];

  describe('Boundary Grouping', () => {
    it('creates a single boundary group for a single selected node', () => {
      const groups = groupNodesForBoundary(['a'], mockNodes);
      expect(groups).toEqual([['a']]);
    });

    it('creates a single boundary group for contiguous siblings under the same parent', () => {
      const groups = groupNodesForBoundary(['a', 'b', 'c'], mockNodes);
      expect(groups).toEqual([['a', 'b', 'c']]);
    });

    it('splits discontinuous siblings into separate boundary groups per contiguity rule', () => {
      // Sibling order is A, B, C, D, E, F. Selected: A, B, C, F.
      // Expected groups: [A, B, C] and [F].
      const groups = groupNodesForBoundary(['a', 'b', 'c', 'f'], mockNodes);
      expect(groups).toEqual([['a', 'b', 'c'], ['f']]);
    });

    it('splits multiple isolated siblings into individual boundary groups', () => {
      // Selected: A, C, E
      const groups = groupNodesForBoundary(['a', 'c', 'e'], mockNodes);
      expect(groups).toEqual([['a'], ['c'], ['e']]);
    });

    it('splits selections across different parents into separate boundary groups', () => {
      // Selected: A, B under P1; X under P2
      const groups = groupNodesForBoundary(['a', 'b', 'x'], mockNodes);
      expect(groups).toEqual([['a', 'b'], ['x']]);
    });

    it('creates boundary annotations with default styling', () => {
      const annotations = createBoundaryAnnotations(['a', 'b', 'f'], mockNodes);
      expect(annotations).toHaveLength(2);
      expect(annotations[0].kind).toBe('boundary');
      expect(annotations[0].nodeIds).toEqual(['a', 'b']);
      expect(annotations[0].style?.borderStyle).toBe('dashed');
      expect(annotations[1].nodeIds).toEqual(['f']);
    });
  });

  describe('Brace Grouping', () => {
    it('creates a single brace for contiguous siblings under the same parent', () => {
      const groups = groupNodesForBrace(['a', 'b', 'c'], mockNodes);
      expect(groups).toEqual([{ parentId: 'p1', nodeIds: ['a', 'b', 'c'] }]);
    });

    it('creates a SINGLE shared brace for discontinuous siblings under the same parent', () => {
      // Sibling contiguity is NOT required for braces
      const groups = groupNodesForBrace(['a', 'c', 'f'], mockNodes);
      expect(groups).toEqual([{ parentId: 'p1', nodeIds: ['a', 'c', 'f'] }]);
    });

    it('splits cross-parent selections into one brace per parent', () => {
      // Selected: A, B under P1; X, Y under P2
      const groups = groupNodesForBrace(['a', 'b', 'x', 'y'], mockNodes);
      expect(groups).toHaveLength(2);
      expect(groups[0]).toEqual({ parentId: 'p1', nodeIds: ['a', 'b'] });
      expect(groups[1]).toEqual({ parentId: 'p2', nodeIds: ['x', 'y'] });
    });

    it('creates brace annotations with default summary label and styling', () => {
      const annotations = createBraceAnnotations(['a', 'c'], mockNodes);
      expect(annotations).toHaveLength(1);
      expect(annotations[0].kind).toBe('brace');
      expect(annotations[0].label).toBe('Summary');
      expect(annotations[0].nodeIds).toEqual(['a', 'c']);
    });
  });

  describe('Subtree & Spatial Coverage Calculations', () => {
    it('collects anchor nodes and their descendants', () => {
      const subtreeIds = collectSubtreeNodeIds(['p1'], mockNodes);
      expect(subtreeIds).toContain('p1');
      expect(subtreeIds).toContain('a');
      expect(subtreeIds).toContain('b');
      expect(subtreeIds).toContain('f');
      expect(subtreeIds).not.toContain('p2');
    });

    it('computes correct boundary bounding box covering nodes and descendants', () => {
      const [boundary] = createBoundaryAnnotations(['a', 'b'], mockNodes);
      const box = computeBoundaryBox(boundary, mockNodes, 10);
      expect(box).not.toBeNull();
      // A is x:350, y:-180, w:60, h:30 (max x: 410, max y: -150)
      // B is x:350, y:-140, w:60, h:30 (max x: 410, max y: -110)
      // minX = 350, minY = -180, maxX = 410, maxY = -110
      // with padding 10:
      expect(box?.x).toBe(340);
      expect(box?.y).toBe(-190);
      expect(box?.width).toBe(80);
      expect(box?.height).toBe(90);
    });

    it('computes brace geometry with curly path and summary label placement', () => {
      const [brace] = createBraceAnnotations(['a', 'b', 'c'], mockNodes);
      const geom = computeBraceGeometry(brace, mockNodes, 16);
      expect(geom).not.toBeNull();
      expect(geom?.side).toBe('right');
      expect(geom?.topY).toBe(-180);
      expect(geom?.bottomY).toBe(-70);
      expect(geom?.midY).toBe(-125);
      expect(geom?.pathD).toContain('M');
      expect(geom?.labelPosition.x).toBeGreaterThan(geom?.x || 0);
    });
  });

  describe('Relationship Line Model & Geometry', () => {
    it('creates a relationship line between two distinct nodes', () => {
      const line = createRelationshipLineAnnotation('a', 'x');
      expect(line).not.toBeNull();
      expect(line?.kind).toBe('relationshipLine');
      expect(line?.sourceNodeId).toBe('a');
      expect(line?.targetNodeId).toBe('x');
      expect(line?.style?.lineStyle).toBe('dashed');
    });

    it('rejects self-targeting (source === target)', () => {
      const line = createRelationshipLineAnnotation('a', 'a');
      expect(line).toBeNull();
    });

    it('computes cubic Bezier curve with control points and midpoint', () => {
      const line = createRelationshipLineAnnotation('a', 'x')!;
      const curve = computeRelationshipCurve(line, mockNodes);
      expect(curve).not.toBeNull();
      expect(curve?.pathD).toContain('C');
      expect(curve?.p1).toBeDefined();
      expect(curve?.p2).toBeDefined();
      expect(curve?.c1).toBeDefined();
      expect(curve?.c2).toBeDefined();
      expect(curve?.midPoint).toBeDefined();
    });

    it('selects natural vertical anchors (bottom -> top) for vertically stacked sibling nodes', () => {
      // a: y = -180..-150, b: y = -140..-110 (both x = 350, width = 60, midX = 380)
      const line = createRelationshipLineAnnotation('a', 'b')!;
      const curve = computeRelationshipCurve(line, mockNodes);
      expect(curve).not.toBeNull();
      // p1 should be at the bottom face of node a: (380, -150)
      expect(curve?.p1.x).toBe(380);
      expect(curve?.p1.y).toBe(-150);
      // p2 should be at the top face of node b: (380, -140)
      expect(curve?.p2.x).toBe(380);
      expect(curve?.p2.y).toBe(-140);
      // midPoint should be midway between the nodes vertically
      expect(curve?.midPoint.y).toBe(-145);
      expect(curve?.midPoint.x).toBeCloseTo(372.5, 1);
    });

    it('renders straight line (M ... L ...) when curvature is 0', () => {
      const line = createRelationshipLineAnnotation('a', 'x')!;
      line.style = { ...line.style, curvature: 0 };
      const curve = computeRelationshipCurve(line, mockNodes);
      expect(curve).not.toBeNull();
      expect(curve?.pathD).toContain('L');
      expect(curve?.pathD).not.toContain('C');
      expect(curve?.c1).toEqual(curve?.p1);
      expect(curve?.c2).toEqual(curve?.p2);
    });

    it('modulates Bezier curve geometry for deep arc (curvature = 2) and inverted arc (curvature = -1)', () => {
      const line = createRelationshipLineAnnotation('a', 'x')!;
      const defaultCurve = computeRelationshipCurve(line, mockNodes)!;

      const deepLine = { ...line, style: { ...line.style, curvature: 2 } };
      const deepCurve = computeRelationshipCurve(deepLine, mockNodes)!;

      const invertedLine = { ...line, style: { ...line.style, curvature: -1 } };
      const invertedCurve = computeRelationshipCurve(invertedLine, mockNodes)!;

      expect(defaultCurve.pathD).toContain('C');
      expect(deepCurve.pathD).toContain('C');
      expect(invertedCurve.pathD).toContain('C');

      // Midpoints should diverge based on curvature factor
      expect(deepCurve.midPoint).not.toEqual(defaultCurve.midPoint);
      expect(invertedCurve.midPoint).not.toEqual(defaultCurve.midPoint);
    });

    it('applies route offset adjustments to Bezier control points', () => {
      const line = createRelationshipLineAnnotation('a', 'x')!;
      line.route = {
        c1Offset: { dx: 25, dy: -15 },
        c2Offset: { dx: -10, dy: 30 },
      };
      const unshifted = computeRelationshipCurve({ ...line, route: undefined }, mockNodes)!;
      const shifted = computeRelationshipCurve(line, mockNodes)!;

      expect(shifted.c1.x).toBe(unshifted.c1.x + 25);
      expect(shifted.c1.y).toBe(unshifted.c1.y - 15);
      expect(shifted.c2.x).toBe(unshifted.c2.x - 10);
      expect(shifted.c2.y).toBe(unshifted.c2.y + 30);
    });
  });

  describe('Pruning Orphan Annotations', () => {
    it('prunes deleted nodes from boundary and brace, and drops empty annotations', () => {
      const boundary = createBoundaryAnnotations(['a', 'b'], mockNodes)[0];
      const brace = createBraceAnnotations(['x'], mockNodes)[0];
      const rel = createRelationshipLineAnnotation('a', 'x')!;

      // Keep only node 'a'
      const validNodes = new Set(['a']);
      const pruned = pruneOrphanAnnotations([boundary, brace, rel], validNodes);

      expect(pruned).toHaveLength(1);
      expect(pruned[0].kind).toBe('boundary');
      expect((pruned[0] as typeof boundary).nodeIds).toEqual(['a']);
    });
  });
});

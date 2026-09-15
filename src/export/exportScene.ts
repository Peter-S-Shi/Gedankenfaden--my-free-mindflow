/**
 * Shared export scene builder (Final Export Product Hardening Closure).
 *
 * Cross-format consistency rule: fix the shared seam once, not five times.
 * SVG and PDF both consume this module instead of re-deriving numbering,
 * node visuals, text layout, scene bounds, and annotation geometry
 * independently -- the divergence between Canvas/SVG/PDF (EX-03, EX-05,
 * EX-08, EX-09, EX-10, EX-12) all trace back to exactly that duplication.
 *
 * This module only computes geometry/presentation data; it renders nothing
 * itself (no SVG strings, no PDF operators) so both consumers stay free to
 * express the same scene in their own vector primitives.
 */
import {
  CanonicalDocument,
  CanonicalNode,
  CanonicalGroup,
  BoundaryAnnotation,
  BraceAnnotation,
  RelationshipLineAnnotation,
} from '../model/types';
import { resolveNodeVisuals, ResolvedNodeVisuals, resolveCanvasBackgroundProjection } from '../model/theme';
import { computeDocumentNumbering, formatNumberedLabel } from '../model/numbering';
import { wrapNodeText } from '../model/textMeasurement';
import { resolveGroupBounds, GroupBounds } from '../model/groups';
import {
  computeBoundaryBox,
  computeBraceGeometry,
  computeRelationshipCurve,
  BraceGeometry,
  RelationshipCurveGeometry,
} from '../model/annotations';

export interface SceneImageArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SceneNode {
  node: CanonicalNode;
  /** Text-aware effective box (F6 hard-break + soft-wrap semantics), grown
   *  symmetrically around the declared vertical center -- the same seam
   *  `computeEffectiveNodeBoxes` used to provide to SVG alone. */
  box: { x: number; y: number; width: number; height: number };
  lines: string[];
  lineHeight: number;
  visuals: ResolvedNodeVisuals;
  /** Numbering-prefixed display text for the node's first line (EX-03). */
  displayLines: string[];
  /** Reserved top slice for an embedded node image, when the node has a
   *  resolvable `assetRef` (EX-11). Text is pushed below this area. */
  imageArea?: SceneImageArea;
}

export interface SceneGroup {
  group: CanonicalGroup;
  bounds: GroupBounds;
}

export interface SceneBoundary {
  kind: 'boundary';
  annotation: BoundaryAnnotation;
  box: { x: number; y: number; width: number; height: number };
}

export interface SceneBrace {
  kind: 'brace';
  annotation: BraceAnnotation;
  geometry: BraceGeometry;
}

export interface SceneRelationshipLine {
  kind: 'relationshipLine';
  annotation: RelationshipLineAnnotation;
  geometry: RelationshipCurveGeometry;
}

export type SceneAnnotation = SceneBoundary | SceneBrace | SceneRelationshipLine;

export interface SceneBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SceneBackground {
  fill: string;
  pattern: 'dots' | 'lines' | 'none';
  patternColor: string;
}

export interface ExportScene {
  nodes: SceneNode[];
  groups: SceneGroup[];
  annotations: SceneAnnotation[];
  bounds: SceneBounds;
  background: SceneBackground;
}

const IMAGE_AREA_MAX_HEIGHT = 100;
const IMAGE_AREA_RATIO = 0.45;

function expandBounds(bounds: SceneBounds, box: { x: number; y: number; width: number; height: number }): void {
  bounds.minX = Math.min(bounds.minX, box.x);
  bounds.minY = Math.min(bounds.minY, box.y);
  bounds.maxX = Math.max(bounds.maxX, box.x + box.width);
  bounds.maxY = Math.max(bounds.maxY, box.y + box.height);
}

/**
 * Builds the shared presentation scene for a canonical document: text-aware
 * node boxes, resolved visuals (EX-10), numbering-prefixed labels (EX-03),
 * annotation geometry (EX-05), background projection (EX-08), and final
 * scene bounds computed from every kind of visible geometry that can extend
 * the document (EX-05/EX-12) -- nodes, groups, and annotations alike.
 *
 * `hasImage(node)` lets callers report whether a node's `assetRef` actually
 * resolves to embeddable image bytes (SVG/PDF each hold their own asset
 * lookup), so a node with a dangling reference doesn't reserve dead space.
 */
export function buildExportScene(
  doc: CanonicalDocument,
  hasImage: (node: CanonicalNode) => boolean = (n) => Boolean(n.assetRef)
): ExportScene {
  const numberingMap = computeDocumentNumbering(doc);
  const bounds: SceneBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  const sceneNodes: SceneNode[] = doc.nodes.map((node) => {
    const width = node.geometry.width || 150;
    const declaredHeight = node.geometry.height || 44;
    const fontSize = node.style?.fontSize || 14;
    const visuals = resolveNodeVisuals(node, doc.theme);

    const nodeHasImage = hasImage(node);
    const imageAreaHeight = nodeHasImage
      ? Math.min(IMAGE_AREA_MAX_HEIGHT, declaredHeight * IMAGE_AREA_RATIO)
      : 0;
    // Numbering (EX-03): the Canvas computes it via the numbering model and
    // renders it as an ordinary text prefix -- never mutates node.text --
    // so exported text must use the same presentation string.
    const badge = numberingMap.get(node.id);
    const displayText = formatNumberedLabel(badge, node.text || '');

    const { lines, lineHeight } = wrapNodeText(displayText, width, fontSize);
    const textBlockHeight = lines.length * lineHeight;
    const requiredContentHeight = textBlockHeight + 16 + imageAreaHeight;
    const requiredHeight = Math.max(declaredHeight, requiredContentHeight);
    const grownBy = requiredHeight - declaredHeight;

    const box = {
      x: node.geometry.x,
      y: node.geometry.y - grownBy / 2,
      width,
      height: requiredHeight,
    };
    expandBounds(bounds, box);

    const imageArea: SceneImageArea | undefined = nodeHasImage
      ? { x: box.x + 8, y: box.y + 6, width: Math.max(1, width - 16), height: Math.max(1, imageAreaHeight - 6) }
      : undefined;

    return {
      node,
      box,
      lines,
      lineHeight,
      visuals,
      displayLines: lines,
      imageArea,
    };
  });

  const sceneGroups: SceneGroup[] = doc.groups.map((group) => {
    const groupBounds = resolveGroupBounds(group, doc.nodes);
    expandBounds(bounds, groupBounds);
    return { group, bounds: groupBounds };
  });

  const annotations: SceneAnnotation[] = [];
  for (const annotation of doc.annotations || []) {
    if (annotation.kind === 'boundary') {
      const box = computeBoundaryBox(annotation, doc.nodes);
      if (box) {
        expandBounds(bounds, box);
        annotations.push({ kind: 'boundary', annotation, box });
      }
    } else if (annotation.kind === 'brace') {
      const geometry = computeBraceGeometry(annotation, doc.nodes);
      if (geometry) {
        // Brace geometry is a path, not an axis box -- expand bounds from
        // its own extent plus the outward label position so the label
        // itself is never clipped.
        const braceExtentX = geometry.side === 'right' ? geometry.x + 40 : geometry.x - 40;
        bounds.minX = Math.min(bounds.minX, Math.min(geometry.x, braceExtentX, geometry.labelPosition.x));
        bounds.maxX = Math.max(bounds.maxX, Math.max(geometry.x, braceExtentX, geometry.labelPosition.x));
        bounds.minY = Math.min(bounds.minY, geometry.topY);
        bounds.maxY = Math.max(bounds.maxY, geometry.bottomY);
        annotations.push({ kind: 'brace', annotation, geometry });
      }
    } else if (annotation.kind === 'relationshipLine') {
      const geometry = computeRelationshipCurve(annotation, doc.nodes);
      if (geometry) {
        for (const point of [geometry.p1, geometry.p2, geometry.c1, geometry.c2]) {
          bounds.minX = Math.min(bounds.minX, point.x);
          bounds.minY = Math.min(bounds.minY, point.y);
          bounds.maxX = Math.max(bounds.maxX, point.x);
          bounds.maxY = Math.max(bounds.maxY, point.y);
        }
        annotations.push({ kind: 'relationshipLine', annotation, geometry });
      }
    }
  }

  if (!isFinite(bounds.minX)) {
    // Empty document: a stable, non-degenerate default scene.
    bounds.minX = 0;
    bounds.minY = 0;
    bounds.maxX = 800;
    bounds.maxY = 600;
  }

  const canvasProjection = resolveCanvasBackgroundProjection(doc.theme?.canvasBackground);
  const background: SceneBackground = {
    fill: doc.theme?.canvasBgColor || '#ffffff',
    pattern: canvasProjection.patternSize === 0 ? 'none' : canvasProjection.variant,
    patternColor: doc.theme?.edgeColor || '#cbd5e1',
  };

  return { nodes: sceneNodes, groups: sceneGroups, annotations, bounds, background };
}

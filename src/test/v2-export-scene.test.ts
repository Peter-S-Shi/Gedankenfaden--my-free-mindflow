import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { buildExportScene } from '../export/exportScene';
import { CanonicalNode, CanonicalGroup, BoundaryAnnotation, BraceAnnotation, RelationshipLineAnnotation } from '../model/types';

describe('Export Closure: shared export scene builder', () => {
  it('numbers node display text using the same numbering model Canvas uses (EX-03), without mutating node.text', () => {
    const doc = createEmptyDocument('Numbering Scene', 'mindmap');
    const root = doc.nodes[0];
    root.numbering = { level1Style: 'decimal' };
    const child: CanonicalNode = { id: 'c1', text: '人物', parentId: root.id, geometry: { x: 100, y: 100, width: 120, height: 40 } };
    doc.nodes.push(child);

    const scene = buildExportScene(doc);
    const sceneChild = scene.nodes.find((n) => n.node.id === 'c1')!;
    expect(sceneChild.displayLines.join(' ')).toContain('1.');
    expect(sceneChild.displayLines.join(' ')).toContain('人物');
    // Canonical text itself must remain untouched.
    expect(child.text).toBe('人物');
  });

  it('resolves node visuals via resolveNodeVisuals so exported color/font matches Canvas precedence (EX-10)', () => {
    const doc = createEmptyDocument('Visuals Scene', 'flowchart');
    doc.theme = { ...doc.theme, nodeBackground: '#123456', nodeTextColor: '#abcdef' };
    doc.nodes = [{ id: 'n1', text: 'Step', type: 'default', geometry: { x: 0, y: 0, width: 120, height: 40 } }];
    const scene = buildExportScene(doc);
    expect(scene.nodes[0].visuals.backgroundColor).toBe('#123456');
    expect(scene.nodes[0].visuals.textColor).toBe('#abcdef');
  });

  it('grows node box height for hard-broken/long text using the same wrapNodeText seam as Canvas (F6/EX-09)', () => {
    const doc = createEmptyDocument('Wrap Scene', 'flowchart');
    doc.nodes = [{ id: 'n1', text: 'Line One\nLine Two\nLine Three', type: 'default', geometry: { x: 0, y: 0, width: 120, height: 40 } }];
    const scene = buildExportScene(doc);
    expect(scene.nodes[0].box.height).toBeGreaterThan(40);
    expect(scene.nodes[0].lines.length).toBeGreaterThanOrEqual(3);
  });

  it('resolves an explicit group bounds and an auto-computed group bounds alike (F2 + EX-12)', () => {
    const doc = createEmptyDocument('Group Scene', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'A', geometry: { x: 0, y: 0, width: 100, height: 40 } },
      { id: 'n2', text: 'B', geometry: { x: 500, y: 500, width: 100, height: 40 } },
    ];
    const explicitGroup: CanonicalGroup = { id: 'g1', title: 'Explicit', nodeIds: ['n1'], bounds: { x: -10, y: -10, width: 200, height: 100 } };
    const autoGroup: CanonicalGroup = { id: 'g2', title: 'Auto', nodeIds: ['n2'] };
    doc.groups = [explicitGroup, autoGroup];

    const scene = buildExportScene(doc);
    const sceneExplicit = scene.groups.find((g) => g.group.id === 'g1')!;
    const sceneAuto = scene.groups.find((g) => g.group.id === 'g2')!;
    expect(sceneExplicit.bounds).toEqual({ x: -10, y: -10, width: 200, height: 100 });
    expect(sceneAuto.bounds.width).toBeGreaterThan(0);
    // Auto group bounds must extend the overall scene bounds too.
    expect(scene.bounds.maxX).toBeGreaterThanOrEqual(sceneAuto.bounds.x + sceneAuto.bounds.width);
  });

  it('computes geometry for all three annotation kinds and extends scene bounds beyond ordinary node bounds (EX-05/EX-12)', () => {
    const doc = createEmptyDocument('Annotation Scene', 'mindmap');
    doc.nodes = [
      { id: 'root_a', text: 'A', type: 'root', geometry: { x: 0, y: 0, width: 100, height: 40 } },
      { id: 'n1', text: 'B', parentId: 'root_a', geometry: { x: 300, y: 0, width: 100, height: 40 } },
      { id: 'n2', text: 'C', parentId: 'root_a', geometry: { x: 300, y: 200, width: 100, height: 40 } },
    ];
    const boundary: BoundaryAnnotation = { id: 'b1', kind: 'boundary', title: 'Region', nodeIds: ['n1'] };
    const brace: BraceAnnotation = { id: 'br1', kind: 'brace', nodeIds: ['n1', 'n2'], label: 'Group' };
    // Positioned far to the right so its curve clearly extends past node bounds.
    const relationship: RelationshipLineAnnotation = {
      id: 'rl1',
      kind: 'relationshipLine',
      sourceNodeId: 'n1',
      targetNodeId: 'n2',
      label: 'relates to',
    };
    doc.annotations = [boundary, brace, relationship];

    const scene = buildExportScene(doc);
    expect(scene.annotations).toHaveLength(3);
    const boundaryScene = scene.annotations.find((a) => a.kind === 'boundary');
    const braceScene = scene.annotations.find((a) => a.kind === 'brace');
    const relScene = scene.annotations.find((a) => a.kind === 'relationshipLine');
    expect(boundaryScene).toBeDefined();
    expect(braceScene).toBeDefined();
    expect(relScene).toBeDefined();

    // Brace extends geometry to the side of its member nodes -- bounds must
    // reach past the rightmost node edge (300 + 100 = 400).
    expect(scene.bounds.maxX).toBeGreaterThan(400);
  });

  it('projects background pattern/color the same way Canvas does (F7/EX-08)', () => {
    const doc = createEmptyDocument('Background Scene', 'flowchart');
    doc.theme = { ...doc.theme, canvasBackground: 'grid', canvasBgColor: '#101418' };
    doc.nodes = [{ id: 'n1', text: 'A', geometry: { x: 0, y: 0, width: 100, height: 40 } }];
    const scene = buildExportScene(doc);
    expect(scene.background.pattern).toBe('lines');
    expect(scene.background.fill).toBe('#101418');
  });

  it('reports "none" pattern for blank background', () => {
    const doc = createEmptyDocument('Blank Background Scene', 'flowchart');
    doc.theme = { ...doc.theme, canvasBackground: 'blank' };
    doc.nodes = [{ id: 'n1', text: 'A', geometry: { x: 0, y: 0, width: 100, height: 40 } }];
    const scene = buildExportScene(doc);
    expect(scene.background.pattern).toBe('none');
  });

  it('reserves an image area only for nodes hasImage() reports as resolvable (EX-11)', () => {
    const doc = createEmptyDocument('Image Scene', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'With Image', assetRef: 'asset://img_1.png', geometry: { x: 0, y: 0, width: 120, height: 80 } },
      { id: 'n2', text: 'Dangling Ref', assetRef: 'asset://missing.png', geometry: { x: 200, y: 0, width: 120, height: 80 } },
    ];
    const scene = buildExportScene(doc, (n) => n.assetRef === 'asset://img_1.png');
    expect(scene.nodes.find((n) => n.node.id === 'n1')!.imageArea).toBeDefined();
    expect(scene.nodes.find((n) => n.node.id === 'n2')!.imageArea).toBeUndefined();
  });

  it('returns a stable non-degenerate default scene for an empty document', () => {
    const doc = createEmptyDocument('Empty Scene', 'flowchart');
    doc.nodes = [];
    const scene = buildExportScene(doc);
    expect(scene.bounds.maxX).toBeGreaterThan(scene.bounds.minX);
    expect(scene.bounds.maxY).toBeGreaterThan(scene.bounds.minY);
  });
});

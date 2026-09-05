import { describe, it, expect } from 'vitest';
import { CanonicalNode } from '../model/types';
import { createEmptyDocument } from '../model/document';
import { validateDocumentInvariants } from '../model/validator';
import { BUILTIN_THEMES, resolveNodeVisuals, resetNodeToTheme } from '../model/theme';
import { packageDocumentToMflow, parseMflowFromBytes } from '../model/container';
import { AssetStore } from '../model/assets';

describe('Milestone 1: Canonical Foundation & Invariant Engine', () => {
  it('provides all four built-in theme presets with complete styling tokens', () => {
    const requiredThemes = ['nordic-slate', 'warm-paper', 'deep-midnight', 'forest-sage'];
    for (const key of requiredThemes) {
      const theme = BUILTIN_THEMES[key];
      expect(theme).toBeDefined();
      expect(theme.name).toBeTruthy();
      expect(theme.canvasBackground).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.primaryColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.nodeBackground).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(theme.edgeColor).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('correctly resolves two-layer styling: theme defaults overridden by local inspector styles', () => {
    const theme = BUILTIN_THEMES['nordic-slate'];
    const defaultNode: CanonicalNode = {
      id: 'node_default',
      text: 'Default Idea',
      geometry: { x: 0, y: 0, width: 140, height: 44 },
      type: 'default',
    };

    const defaultVisuals = resolveNodeVisuals(defaultNode, {
      paletteId: 'nordic-slate',
      canvasBackground: 'dots',
      fontFamily: 'sans',
      defaultEdgeRouting: 'smoothstep',
    });
    expect(defaultVisuals.backgroundColor).toBe(theme.nodeBackground);
    expect(defaultVisuals.textColor).toBe(theme.nodeTextColor);
    expect(defaultVisuals.shape).toBe('rounded');

    const customizedNode: CanonicalNode = {
      id: 'node_custom',
      text: 'Custom Idea',
      geometry: { x: 0, y: 0, width: 140, height: 44 },
      type: 'default',
      shape: 'diamond',
      style: {
        backgroundColor: '#ef4444',
        borderColor: '#b91c1c',
        borderWidth: 4,
        textColor: '#ffffff',
        fontSize: 18,
      },
    };

    const customVisuals = resolveNodeVisuals(customizedNode, {
      paletteId: 'nordic-slate',
      canvasBackground: 'dots',
      fontFamily: 'sans',
      defaultEdgeRouting: 'smoothstep',
    });
    expect(customVisuals.backgroundColor).toBe('#ef4444');
    expect(customVisuals.borderColor).toBe('#b91c1c');
    expect(customVisuals.borderWidth).toBe(4);
    expect(customVisuals.textColor).toBe('#ffffff');
    expect(customVisuals.fontSize).toBe(18);
    expect(customVisuals.shape).toBe('diamond');

    // Test Reset-to-Theme action
    const resetNode = resetNodeToTheme(customizedNode);
    expect(resetNode.style).toBeUndefined();
    expect(resetNode.shape).toBeUndefined();

    const afterResetVisuals = resolveNodeVisuals(resetNode, {
      paletteId: 'nordic-slate',
      canvasBackground: 'dots',
      fontFamily: 'sans',
      defaultEdgeRouting: 'smoothstep',
    });
    expect(afterResetVisuals.backgroundColor).toBe(theme.nodeBackground);
    expect(afterResetVisuals.textColor).toBe(theme.nodeTextColor);
    expect(afterResetVisuals.shape).toBe('rounded');
  });

  it('validates invariants and detects cycles in Mind Map mode', () => {
    const doc = createEmptyDocument('Cycle Test', 'mindmap');
    const rootId = doc.nodes[0].id;

    // Create a circular parent-child loop: root -> A -> B -> A
    doc.nodes.push(
      {
        id: 'node_a',
        text: 'A',
        geometry: { x: 100, y: 100, width: 100, height: 40 },
        parentId: 'node_b',
      },
      {
        id: 'node_b',
        text: 'B',
        geometry: { x: 200, y: 100, width: 100, height: 40 },
        parentId: 'node_a',
      }
    );
    doc.edges.push(
      { id: 'e1', source: rootId, target: 'node_a' },
      { id: 'e2', source: 'node_a', target: 'node_b' },
      { id: 'e3', source: 'node_b', target: 'node_a' }
    );

    const validation = validateDocumentInvariants(doc);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.some((err: string) => err.toLowerCase().includes('cycle'))).toBe(true);
  });

  it('validates node geometry, duplicate IDs, and edge connectivity invariants', () => {
    const validDoc = createEmptyDocument('Valid Doc', 'flowchart');
    expect(validateDocumentInvariants(validDoc).isValid).toBe(true);

    // Duplicate Node ID
    const duplicateDoc = createEmptyDocument('Duplicate ID Doc', 'flowchart');
    duplicateDoc.nodes.push({
      id: duplicateDoc.nodes[0].id,
      text: 'Duplicate',
      geometry: { x: 0, y: 0, width: 100, height: 40 },
    });
    const dupCheck = validateDocumentInvariants(duplicateDoc);
    expect(dupCheck.isValid).toBe(false);
    expect(dupCheck.errors.some((err: string) => err.includes('Duplicate node ID'))).toBe(true);

    // Dangling Edge
    const danglingDoc = createEmptyDocument('Dangling Edge Doc', 'flowchart');
    danglingDoc.edges.push({
      id: 'dangling_edge',
      source: 'non_existent_1',
      target: 'non_existent_2',
    });
    const edgeCheck = validateDocumentInvariants(danglingDoc);
    expect(edgeCheck.isValid).toBe(false);
    expect(edgeCheck.errors.some((err: string) => err.includes('non_existent'))).toBe(true);

    // Invalid Geometry
    const invalidGeomDoc = createEmptyDocument('Invalid Geom', 'flowchart');
    invalidGeomDoc.nodes.push({
      id: 'bad_geom',
      text: 'Bad Geom',
      geometry: { x: NaN, y: 0, width: -20, height: 40 },
    });
    const geomCheck = validateDocumentInvariants(invalidGeomDoc);
    expect(geomCheck.isValid).toBe(false);
    expect(geomCheck.errors.some((err: string) => err.includes('bad_geom'))).toBe(true);
  });
});

describe('Milestone 1: Native Document Container (.mflow)', () => {
  it('packages and parses native .mflow container losslessly with embedded assets', () => {
    const doc = createEmptyDocument('Container Spec Test', 'mindmap');
    doc.theme = {
      paletteId: 'forest-sage',
      canvasBackground: 'dots',
      fontFamily: 'sans',
      defaultEdgeRouting: 'smoothstep',
      name: 'Forest Sage',
    };

    // Add mock asset
    const assetStore = new AssetStore();
    const mockImageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
    const { ref } = assetStore.addAsset('test_diagram.png', 'image/png', mockImageBytes);

    doc.nodes.push({
      id: 'node_with_asset',
      text: 'Diagram Section',
      geometry: { x: 250, y: 150, width: 180, height: 60 },
      parentId: doc.nodes[0].id,
      assetRef: ref,
      shape: 'rounded',
    });

    // Package to .mflow (ZIP)
    const mflowBytes = packageDocumentToMflow(doc, assetStore.toBytesMap());
    expect(mflowBytes).toBeInstanceOf(Uint8Array);
    expect(mflowBytes.length).toBeGreaterThan(100);

    // Parse from bytes
    const container = parseMflowFromBytes(mflowBytes);
    expect(container.document.id).toBe(doc.id);
    expect(container.document.title).toBe('Container Spec Test');
    expect(container.document.mode).toBe('mindmap');
    expect(container.document.theme?.paletteId).toBe('forest-sage');
    expect(container.document.nodes.length).toBe(doc.nodes.length);

    // Verify metadata
    expect(container.meta.title).toBe('Container Spec Test');
    expect(container.meta.mode).toBe('mindmap');
    expect(container.meta.nodeCount).toBe(doc.nodes.length);
    expect(container.meta.generator).toContain('Gedankenfaden');

    // Verify embedded asset in container
    expect(container.assets.size).toBe(1);
    const assetKey = Array.from(container.assets.keys())[0];
    expect(assetKey).toContain('.png');
    const restoredBytes = container.assets.get(assetKey)!;
    expect(restoredBytes).toEqual(mockImageBytes);

    // Reconstruct AssetStore
    const restoredStore = AssetStore.fromBytesMap(container.assets);
    const restoredAsset = restoredStore.getAsset(ref);
    expect(restoredAsset).toBeDefined();
    expect(restoredAsset?.data).toEqual(mockImageBytes);
  });

  it('rejects corrupt or invalid containers with descriptive error messages', () => {
    const invalidBytes = new Uint8Array([1, 2, 3, 4, 5]);
    expect(() => parseMflowFromBytes(invalidBytes)).toThrow();
  });
});

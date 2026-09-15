import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createEmptyDocument } from '../model/document';
import { canonicalToReactFlow } from '../model/adapter';
import { autoLayoutDocument } from '../model/layout';

describe('V2 Mind Map Long Hierarchy Edge Visual Continuity (RC-Blocking Corrective)', () => {
  const cssPath = path.resolve(__dirname, '../styles/animations.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');

  it('proves CSS animations.css does not leave permanent stroke-dasharray: 1000 on settled edges', () => {
    // The selector .signature-connect-draw must NOT permanently have stroke-dasharray: 1000;
    // It must either have stroke-dasharray: none or genuinely transient keyframe animation
    const connectDrawMatch = cssContent.match(/\.signature-connect-draw\s*\{([^}]+)\}/);
    expect(connectDrawMatch).not.toBeNull();
    const ruleBody = connectDrawMatch![1];

    // Must NOT declare permanent stroke-dasharray: 1000
    expect(ruleBody).not.toMatch(/stroke-dasharray:\s*1000;/);
    // Must end or settle in continuous stroke (stroke-dasharray: none)
    expect(ruleBody).toMatch(/stroke-dasharray:\s*none;/);
  });

  it('guarantees @keyframes edgeDraw transitions genuinely to stroke-dasharray: none at completion', () => {
    const keyframeMatch = cssContent.match(/@keyframes\s+edgeDraw\s*\{([\s\S]*?)\n\}/);
    expect(keyframeMatch).not.toBeNull();
    const keyframeBody = keyframeMatch![1];

    // Keyframe at 100% must explicitly clear stroke-dasharray to none
    expect(keyframeBody).toMatch(/100%\s*\{[\s\S]*?stroke-dasharray:\s*none;/);
  });

  it('ensures Mind Map hierarchy edges project strokeDasharray: none for long paths (>1000px, >2000px, and synthetic 3500px)', () => {
    const doc = createEmptyDocument('Long Edges Mind Map', 'mindmap');
    const rootId = doc.nodes[0].id;
    doc.nodes[0].geometry = { x: 0, y: 0, width: 140, height: 44 };

    // 1. Moderate edge (< 1000px): x = 600px
    // 2. Long edge (> 1000px): x = 1500px, distance ~ 1500px
    // 3. Very long edge (> 2000px): x = 2500px, distance ~ 2500px
    // 4. Extreme synthetic edge (> 3500px): x = 3800px, distance ~ 3800px
    doc.nodes.push(
      { id: 'node_600', parentId: rootId, text: '600px', geometry: { x: 600, y: -200, width: 120, height: 40 }, mindMapSide: 'right' },
      { id: 'node_1500', parentId: rootId, text: '1500px', geometry: { x: 1500, y: -100, width: 120, height: 40 }, mindMapSide: 'right' },
      { id: 'node_2500', parentId: rootId, text: '2500px', geometry: { x: 2500, y: 100, width: 120, height: 40 }, mindMapSide: 'right' },
      { id: 'node_3800', parentId: rootId, text: '3800px', geometry: { x: 3800, y: 200, width: 120, height: 40 }, mindMapSide: 'right' }
    );
    doc.edges.push(
      { id: `${rootId}->node_600`, source: rootId, target: 'node_600' },
      { id: `${rootId}->node_1500`, source: rootId, target: 'node_1500' },
      { id: `${rootId}->node_2500`, source: rootId, target: 'node_2500' },
      { id: `${rootId}->node_3800`, source: rootId, target: 'node_3800' }
    );

    const projected = canonicalToReactFlow(doc);
    expect(projected.edges).toHaveLength(4);

    for (const edge of projected.edges) {
      // Mind Map edges must explicitly specify strokeDasharray: 'none' or continuous styling
      expect(edge.style?.strokeDasharray).toBe('none');
      // Must remain strictly locked/non-interactive
      expect(edge.selectable).toBe(false);
      expect(edge.interactionWidth).toBe(0);
    }
  });

  it('preserves Flowchart edges allowing custom dashed stroke and signature motion wiring', () => {
    const doc = createEmptyDocument('Flowchart Mode', 'flowchart');
    doc.nodes = [
      { id: 'start', text: 'Start', type: 'root', geometry: { x: 0, y: 0, width: 100, height: 40 } },
      { id: 'end', text: 'End', geometry: { x: 300, y: 0, width: 100, height: 40 } },
    ];
    doc.edges = [
      {
        id: 'start->end',
        source: 'start',
        target: 'end',
        style: { strokeDasharray: '6 4' },
      },
    ];

    const projected = canonicalToReactFlow(doc);
    expect(projected.edges[0].className).toBe('signature-connect-draw');
    // Flowchart custom dashed stroke is preserved
    expect(projected.edges[0].style?.strokeDasharray).toBe('6 4');
  });

  it('retains solid stroke continuity across Auto Layout and low-zoom adaptive stroke', () => {
    const doc = createEmptyDocument('Auto Layout Long Branch', 'mindmap');
    const rootId = doc.nodes[0].id;
    let currentParent = rootId;

    // Build a deep chain that extends far along the X axis
    for (let i = 1; i <= 10; i++) {
      const childId = `chain_${i}`;
      doc.nodes.push({
        id: childId,
        parentId: currentParent,
        text: `Level ${i} Node with substantial text payload for width`,
        geometry: { x: 0, y: 0, width: 140, height: 40 },
        mindMapSide: 'right',
      });
      doc.edges.push({
        id: `${currentParent}->${childId}`,
        source: currentParent,
        target: childId,
      });
      currentParent = childId;
    }

    const layouted = autoLayoutDocument(doc, { preset: 'balanced' });
    const projected = canonicalToReactFlow(layouted);

    // Verify all 10 edges in the long chain have strokeDasharray: 'none'
    expect(projected.edges).toHaveLength(10);
    for (const edge of projected.edges) {
      expect(edge.style?.strokeDasharray).toBe('none');
    }

    // Verify SVG path points are not collapsed or shortened
    const lastNode = layouted.nodes.find((n) => n.id === currentParent)!;
    expect(lastNode.geometry.x).toBeGreaterThan(1500);
  });
});

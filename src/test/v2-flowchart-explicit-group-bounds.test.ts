import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEmptyDocument } from '../model/document';
import { CanonicalNode, CanonicalGroup, CanonicalDocument } from '../model/types';
import { resolveGroupBounds, computeGroupBounds, translateGroup } from '../model/groups';

describe('Flowchart PH Bug F2: Explicit Canonical Group Bounds Fidelity', () => {
  it('prefers explicit group.bounds over tight member bounding box', () => {
    const nodes: CanonicalNode[] = [
      { id: 'n1', text: 'Node 1', geometry: { x: 200, y: 300, width: 140, height: 44 } },
      { id: 'n2', text: 'Node 2', geometry: { x: 200, y: 400, width: 140, height: 44 } },
    ];
    // Member nodes occupy y: [300, 444], tight box height ~ 200
    // But group has explicit fixed swimlane/canto geometry 420x1040 at (100, 180)
    const explicitGroup: CanonicalGroup = {
      id: 'canto_1',
      title: 'Canto I',
      nodeIds: ['n1', 'n2'],
      bounds: { x: 100, y: 180, width: 420, height: 1040 },
    };

    const resolved = resolveGroupBounds(explicitGroup, nodes);
    expect(resolved).toEqual({ x: 100, y: 180, width: 420, height: 1040 });

    // computeGroupBounds remains available for direct calculation
    const computed = computeGroupBounds(explicitGroup, nodes);
    expect(computed.width).toBeLessThan(420);
    expect(computed.height).toBeLessThan(1040);
  });

  it('falls back to computeGroupBounds when group.bounds is undefined', () => {
    const nodes: CanonicalNode[] = [
      { id: 'n1', text: 'Step A', geometry: { x: 100, y: 100, width: 120, height: 40 } },
    ];
    const groupWithoutBounds: CanonicalGroup = {
      id: 'dynamic_group',
      title: 'Auto Group',
      nodeIds: ['n1'],
    };

    const resolved = resolveGroupBounds(groupWithoutBounds, nodes, 20, 30);
    const expected = computeGroupBounds(groupWithoutBounds, nodes, 20, 30);
    expect(resolved).toEqual(expected);
  });

  it('CanvasEditor source resolves group bounds via resolveGroupBounds preserving explicit bounds', () => {
    const canvasSource = readFileSync(new URL('../components/CanvasEditor.tsx', import.meta.url), 'utf8');
    expect(canvasSource).toContain('resolveGroupBounds');
    expect(canvasSource).toMatch(/resolveGroupBounds\s*\(\s*group\s*,\s*doc\.nodes\s*\)/);
    // F1 layer ordering must remain intact
    expect(canvasSource).toMatch(/data-testid=\{`group-container-\$\{group\.id\}`\}[\s\S]*?zIndex:\s*-1/);
  });

  it('translates explicit group bounds without altering fixed width and height', () => {
    const doc = createEmptyDocument('Swimlane Flowchart', 'flowchart');
    doc.nodes = [
      { id: 'm1', text: 'Task 1', geometry: { x: 150, y: 250, width: 140, height: 44 } },
    ];
    doc.groups = [
      {
        id: 'swimlane_1',
        title: 'Phase 1',
        nodeIds: ['m1'],
        bounds: { x: 100, y: 180, width: 420, height: 1040 },
      },
    ];

    const translated = translateGroup(doc, 'swimlane_1', 80, -40);
    const group = translated.groups.find((g) => g.id === 'swimlane_1')!;
    const member = translated.nodes.find((n) => n.id === 'm1')!;

    // Position shifts by (80, -40)
    expect(group.bounds).toEqual({
      x: 180,
      y: 140,
      width: 420,
      height: 1040,
    });
    expect(member.geometry.x).toBe(230);
    expect(member.geometry.y).toBe(210);
  });

  it('preserves all 8 Orlando Canto explicit 420x1040 group containers and round-trips through JSON', () => {
    const doc = createEmptyDocument('Orlando Furioso Flowchart', 'flowchart');
    const nodes: CanonicalNode[] = [];
    const groups: CanonicalGroup[] = [];

    for (let i = 0; i < 8; i++) {
      const gId = `canto_${i + 1}`;
      const nId = `node_${i + 1}_main`;
      const xPos = 80 + i * 460;
      nodes.push({
        id: nId,
        text: `Canto ${i + 1} Action`,
        geometry: { x: xPos + 100, y: 300, width: 180, height: 50 },
      });
      groups.push({
        id: gId,
        title: `Canto ${i + 1}`,
        nodeIds: [nId],
        bounds: { x: xPos, y: 180, width: 420, height: 1040 },
      });
    }

    doc.nodes = nodes;
    doc.groups = groups;

    // Simulate JSON save and reload round-trip
    const serialized = JSON.stringify(doc);
    const reloaded: CanonicalDocument = JSON.parse(serialized);

    expect(reloaded.groups.length).toBe(8);
    for (let i = 0; i < 8; i++) {
      const g = reloaded.groups[i];
      const resolved = resolveGroupBounds(g, reloaded.nodes);
      expect(resolved.width).toBe(420);
      expect(resolved.height).toBe(1040);
      expect(resolved.y).toBe(180);
      expect(resolved.x).toBe(80 + i * 460);
    }
  });
});

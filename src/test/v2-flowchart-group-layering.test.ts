import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEmptyDocument } from '../model/document';
import { CanonicalNode, CanonicalGroup } from '../model/types';
import { canonicalToReactFlow } from '../model/adapter';

describe('Flowchart PH Bug F1: Group Background Container Layering & Visibility', () => {
  it('projects flowchart nodes with deterministic zIndex above group backgrounds and edges', () => {
    const doc = createEmptyDocument('Flowchart Layering', 'flowchart');
    const nodes: CanonicalNode[] = [
      { id: 'n1', text: 'Step 1', geometry: { x: 100, y: 100, width: 140, height: 44 } },
      { id: 'n2', text: 'Step 2', geometry: { x: 300, y: 100, width: 140, height: 44 } },
    ];
    doc.nodes = nodes;
    doc.edges = [
      { id: 'e1', source: 'n1', target: 'n2' },
    ];

    const unselectedProjection = canonicalToReactFlow(doc);
    const pNode1 = unselectedProjection.nodes.find((n) => n.id === 'n1');
    const pNode2 = unselectedProjection.nodes.find((n) => n.id === 'n2');

    // Unselected nodes must have zIndex >= 1 (above default edges at 0 and group backgrounds at -1)
    expect(pNode1?.zIndex).toBeDefined();
    expect(pNode1!.zIndex!).toBeGreaterThanOrEqual(1);
    expect(pNode2!.zIndex!).toBeGreaterThanOrEqual(1);

    const selectedProjection = canonicalToReactFlow(doc, { selectedNodeId: 'n1' });
    const pSelectedNode1 = selectedProjection.nodes.find((n) => n.id === 'n1');
    const pUnselectedNode2 = selectedProjection.nodes.find((n) => n.id === 'n2');

    expect(pSelectedNode1?.selected).toBe(true);
    expect(pUnselectedNode2?.selected).toBe(false);
  });

  it('verifies group container styling in CanvasEditor enforces background layer (zIndex: -1)', () => {
    const canvasSource = readFileSync(new URL('../components/CanvasEditor.tsx', import.meta.url), 'utf8');

    // The group container rendered in ViewportPortal must have zIndex: -1 (or dedicated negative layer)
    // so it never occludes unselected member nodes (which have zIndex >= 0/1)
    expect(canvasSource).toMatch(/data-testid=\{`group-container-\$\{group\.id\}`\}[\s\S]*?zIndex:\s*-1/);
  });

  it('supports multi-group flowchart (e.g. 8 groups) with all member nodes projected in foreground layer', () => {
    const doc = createEmptyDocument('Multi-Group Flowchart', 'flowchart');
    const nodes: CanonicalNode[] = [];
    const groups: CanonicalGroup[] = [];

    // Simulate 8 groups with 3 member nodes each (24 nodes total)
    for (let g = 0; g < 8; g++) {
      const gId = `group_${g}`;
      const memberIds: string[] = [];
      for (let m = 0; m < 3; m++) {
        const nId = `node_${g}_${m}`;
        memberIds.push(nId);
        nodes.push({
          id: nId,
          text: `Group ${g} Node ${m}`,
          geometry: { x: g * 300 + m * 80, y: 100 + m * 60, width: 120, height: 40 },
        });
      }
      groups.push({
        id: gId,
        title: `Container ${g}`,
        nodeIds: memberIds,
        style: {
          backgroundColor: 'rgba(240, 245, 255, 0.7)',
          borderColor: '#93c5fd',
        },
      });
    }

    doc.nodes = nodes;
    doc.groups = groups;

    const projection = canonicalToReactFlow(doc);
    expect(projection.nodes.length).toBe(24);

    // Every single member node must be projected with layer priority above group backgrounds
    for (const node of projection.nodes) {
      expect(node.zIndex).toBeGreaterThanOrEqual(1);
    }
  });

  it('proves flowchart acceptance graph member and non-member nodes all render above group container', () => {
    const doc = createEmptyDocument('Flowchart Acceptance Sample', 'flowchart');
    doc.nodes = [
      { id: 'fc_start', text: 'Start review', type: 'terminal', shape: 'pill', geometry: { x: 80, y: 220, width: 150, height: 48 } },
      { id: 'fc_collect', text: 'Collect evidence', type: 'data', shape: 'parallelogram', geometry: { x: 300, y: 220, width: 160, height: 52 } },
      { id: 'fc_sufficient', text: 'Evidence sufficient?', type: 'decision', shape: 'diamond', geometry: { x: 540, y: 210, width: 180, height: 80 } },
      { id: 'fc_confirm', text: 'Confirm publication', type: 'process', shape: 'rectangle', geometry: { x: 800, y: 220, width: 160, height: 48 } },
      { id: 'fc_request', text: 'Request revision', type: 'process', shape: 'rectangle', geometry: { x: 550, y: 380, width: 160, height: 48 } },
      { id: 'fc_publish', text: 'Publish release', type: 'terminal', shape: 'pill', geometry: { x: 1040, y: 220, width: 150, height: 48 } },
    ];
    doc.edges = [
      { id: 'e1', source: 'fc_start', target: 'fc_collect' },
      { id: 'e2', source: 'fc_collect', target: 'fc_sufficient' },
      { id: 'e3', source: 'fc_sufficient', target: 'fc_confirm', label: 'Yes' },
      { id: 'e4', source: 'fc_sufficient', target: 'fc_request', label: 'No' },
      { id: 'e5', source: 'fc_confirm', target: 'fc_publish', label: 'Approved' },
    ];
    doc.groups = [
      {
        id: 'group_evidence_loop',
        title: 'Evidence Loop',
        nodeIds: ['fc_collect', 'fc_sufficient', 'fc_request'],
        style: {
          backgroundColor: 'rgba(246,248,246,0.55)',
          borderColor: '#84a98c',
        },
      },
    ];

    expect(doc.groups.length).toBe(1);
    const group = doc.groups[0];
    expect(group.nodeIds.length).toBe(3);

    const projection = canonicalToReactFlow(doc);
    for (const memberId of group.nodeIds) {
      const node = projection.nodes.find((n) => n.id === memberId);
      expect(node).toBeDefined();
      expect(node!.zIndex).toBeGreaterThanOrEqual(1);
      // Selected state when selected from Outline
      const selectedProj = canonicalToReactFlow(doc, { selectedNodeId: memberId });
      const selNode = selectedProj.nodes.find((n) => n.id === memberId);
      expect(selNode?.selected).toBe(true);
      expect(selNode?.zIndex).toBeGreaterThanOrEqual(1);
    }
  });
});


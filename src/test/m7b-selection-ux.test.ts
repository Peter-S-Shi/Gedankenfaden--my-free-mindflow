import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { canonicalToReactFlow, reactFlowToCanonical } from '../model/adapter';

describe('M7-B Selection UX Persistence Regression Suite', () => {
  it('canonicalToReactFlow sets selected: true on the designated selectedNodeId', () => {
    const doc = createEmptyDocument('Test Mindmap', 'mindmap');
    const rootId = doc.nodes[0].id;

    // Projection with selectedNodeId
    const projected = canonicalToReactFlow(doc, { selectedNodeId: rootId });
    const rootRfNode = projected.nodes.find((n) => n.id === rootId);
    expect(rootRfNode).toBeDefined();
    expect(rootRfNode?.selected).toBe(true);

    // Projection without selectedNodeId (or null)
    const unselectedProjected = canonicalToReactFlow(doc, { selectedNodeId: null });
    const unselectedRfNode = unselectedProjected.nodes.find((n) => n.id === rootId);
    expect(unselectedRfNode).toBeDefined();
    expect(unselectedRfNode?.selected).toBe(false);
  });

  it('preserves selection across consecutive node property modifications in mindmap mode', () => {
    let doc = createEmptyDocument('Mindmap Edit', 'mindmap');
    const rootId = doc.nodes[0].id;
    let selectedNodeId: string | null = rootId;

    // Initial projection
    let projected = canonicalToReactFlow(doc, { selectedNodeId });
    expect(projected.nodes.find((n) => n.id === selectedNodeId)?.selected).toBe(true);

    // 1st Edit: Change shape to 'pill' (borderRadius: 24)
    doc = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === selectedNodeId ? { ...n, style: { ...n.style, borderRadius: 24 } } : n)),
    };
    projected = canonicalToReactFlow(doc, { selectedNodeId });
    expect(projected.nodes.find((n) => n.id === selectedNodeId)?.selected).toBe(true);
    expect(projected.nodes.find((n) => n.id === selectedNodeId)?.data.visuals?.borderRadius).toBe(24);

    // 2nd Edit: Change background color
    doc = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === selectedNodeId ? { ...n, style: { ...n.style, backgroundColor: '#f43f5e' } } : n)),
    };
    projected = canonicalToReactFlow(doc, { selectedNodeId });
    expect(projected.nodes.find((n) => n.id === selectedNodeId)?.selected).toBe(true);
    expect(projected.nodes.find((n) => n.id === selectedNodeId)?.data.visuals?.backgroundColor).toBe('#f43f5e');

    // 3rd Edit: Change text color
    doc = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === selectedNodeId ? { ...n, style: { ...n.style, textColor: '#fbbf24' } } : n)),
    };
    projected = canonicalToReactFlow(doc, { selectedNodeId });
    expect(projected.nodes.find((n) => n.id === selectedNodeId)?.selected).toBe(true);
    expect(projected.nodes.find((n) => n.id === selectedNodeId)?.data.visuals?.textColor).toBe('#fbbf24');
  });

  it('preserves selection across consecutive property modifications in flowchart mode', () => {
    let doc = createEmptyDocument('Flowchart Edit', 'flowchart');
    const startNode = doc.nodes.find((n) => n.type === 'terminal') || doc.nodes[0];
    let selectedNodeId: string | null = startNode.id;

    // Initial projection
    let projected = canonicalToReactFlow(doc, { selectedNodeId });
    expect(projected.nodes.find((n) => n.id === selectedNodeId)?.selected).toBe(true);

    // Edit 1: change flowchart node type to decision
    doc = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === selectedNodeId ? { ...n, type: 'decision' } : n)),
    };
    projected = canonicalToReactFlow(doc, { selectedNodeId });
    expect(projected.nodes.find((n) => n.id === selectedNodeId)?.selected).toBe(true);
    expect(projected.nodes.find((n) => n.id === selectedNodeId)?.data.nodeType).toBe('decision');

    // Edit 2: change border color
    doc = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === selectedNodeId ? { ...n, style: { ...n.style, borderColor: '#10b981' } } : n)),
    };
    projected = canonicalToReactFlow(doc, { selectedNodeId });
    expect(projected.nodes.find((n) => n.id === selectedNodeId)?.selected).toBe(true);
    expect(projected.nodes.find((n) => n.id === selectedNodeId)?.data.visuals?.borderColor).toBe('#10b981');
  });

  it('updates node text via onUpdateLabel callback without dropping selection', () => {
    let doc = createEmptyDocument('Label Edit', 'mindmap');
    const rootId = doc.nodes[0].id;
    let selectedNodeId: string | null = rootId;

    const onUpdateLabel = (nodeId: string, label: string) => {
      doc = {
        ...doc,
        nodes: doc.nodes.map((n) => (n.id === nodeId ? { ...n, text: label } : n)),
      };
      selectedNodeId = nodeId;
    };

    let projected = canonicalToReactFlow(doc, {
      selectedNodeId,
      onUpdateLabel,
    });

    // Simulate input blur or enter dispatching onUpdateLabel
    const nodeData = projected.nodes.find((n) => n.id === rootId)?.data;
    expect(nodeData?.onUpdateLabel).toBeDefined();
    nodeData?.onUpdateLabel?.(rootId, 'Updated Topic Text');

    // Verify doc updated
    expect(doc.nodes.find((n) => n.id === rootId)?.text).toBe('Updated Topic Text');

    // Re-project with maintained selectedNodeId
    projected = canonicalToReactFlow(doc, { selectedNodeId, onUpdateLabel });
    expect(projected.nodes.find((n) => n.id === rootId)?.selected).toBe(true);
    expect(projected.nodes.find((n) => n.id === rootId)?.data.label).toBe('Updated Topic Text');
  });

  it('clears selection when deselected, and strips UI callbacks on canonical roundtrip', () => {
    const doc = createEmptyDocument('Deselect Test', 'mindmap');
    const rootId = doc.nodes[0].id;

    // Deselect
    const deselectedProjected = canonicalToReactFlow(doc, { selectedNodeId: null });
    expect(deselectedProjected.nodes.every((n) => !n.selected)).toBe(true);

    // Serialization roundtrip does not leak onUpdateLabel or transient UI properties
    const projectedWithCb = canonicalToReactFlow(doc, {
      selectedNodeId: rootId,
      onUpdateLabel: () => {},
    });
    const roundtripDoc = reactFlowToCanonical(projectedWithCb.nodes, projectedWithCb.edges, doc);

    // Ensure roundtrip matches canonical schema
    expect(roundtripDoc.nodes.find((n) => n.id === rootId)?.text).toBe(doc.nodes[0].text);
    expect((roundtripDoc.nodes[0] as any).onUpdateLabel).toBeUndefined();
    expect((roundtripDoc.nodes[0] as any).selected).toBeUndefined();
  });
});

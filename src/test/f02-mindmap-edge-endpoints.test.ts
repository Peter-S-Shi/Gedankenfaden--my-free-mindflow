import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from '@xyflow/react';
import { CustomNode } from '../components/CustomNode';
import { createEmptyDocument } from '../model/document';
import { layoutMindMapDocument } from '../model/layout';

describe('F02 mind-map edge endpoints', () => {
  it('registers both horizontal endpoint directions used by balanced mind-map edges', () => {
    const doc = createEmptyDocument('Bidirectional edge endpoints', 'mindmap');
    const rootId = doc.nodes[0].id;
    doc.nodes.push(
      { id: 'right', text: 'Right', parentId: rootId, geometry: { x: 0, y: 0, width: 150, height: 44 } },
      { id: 'left', text: 'Left', parentId: rootId, geometry: { x: 0, y: 0, width: 150, height: 44 } }
    );
    doc.edges.push(
      { id: 'root-right', source: rootId, target: 'right' },
      { id: 'root-left', source: rootId, target: 'left' }
    );

    const layouted = layoutMindMapDocument(doc, { preset: 'balanced' });
    const leftEdge = layouted.edges.find((edge) => edge.id === 'root-left')!;

    const markup = renderToStaticMarkup(createElement(
      ReactFlowProvider,
      null,
      createElement(CustomNode, {
        id: rootId,
        data: { label: 'Root' },
        selected: false,
        type: 'customNode',
        zIndex: 0,
        isConnectable: true,
        dragging: false,
        draggable: true,
        selectable: true,
        deletable: true,
        positionAbsoluteX: 0,
        positionAbsoluteY: 0,
      })
    ));

    expect(markup).toContain(`data-handleid="${leftEdge.sourceHandle}"`);
    expect(markup).toContain(`data-handleid="${leftEdge.targetHandle}"`);
  });
});

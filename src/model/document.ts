import { CanonicalDocument, CanonicalNode, CanonicalEdge, DocumentMode } from './types';
import { getDefaultTheme } from './theme';
import { validateCanonicalDocument } from './validator';

export function createEmptyDocument(title = 'Untitled Document', mode: DocumentMode = 'mindmap'): CanonicalDocument {
  const now = new Date().toISOString();
  const rootId = 'node_root';

  const initialNodes: CanonicalNode[] = mode === 'mindmap'
    ? [
        {
          id: rootId,
          text: 'Central Topic',
          type: 'root',
          geometry: { x: 400, y: 300, width: 160, height: 48 },
          style: {
            backgroundColor: '#2563eb',
            borderColor: '#1d4ed8',
            textColor: '#ffffff',
            borderRadius: 8,
          },
        },
      ]
    : [
        {
          id: 'node_start',
          text: 'Start',
          type: 'terminal',
          geometry: { x: 350, y: 150, width: 140, height: 44 },
          style: {
            backgroundColor: '#10b981',
            borderColor: '#059669',
            textColor: '#ffffff',
            borderRadius: 22,
          },
        },
        {
          id: 'node_process_1',
          text: 'Process Step',
          type: 'process',
          geometry: { x: 350, y: 260, width: 140, height: 44 },
          style: {
            backgroundColor: '#ffffff',
            borderColor: '#94a3b8',
            textColor: '#0f172a',
            borderRadius: 8,
          },
        },
      ];

  const initialEdges: CanonicalEdge[] = mode === 'flowchart'
    ? [
        {
          id: 'edge_start_to_p1',
          source: 'node_start',
          target: 'node_process_1',
          type: 'orthogonal',
        },
      ]
    : [];

  return {
    schemaVersion: '1.0',
    id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    mode,
    createdAt: now,
    updatedAt: now,
    viewport: { x: 0, y: 0, zoom: 1 },
    theme: getDefaultTheme(mode),
    nodes: initialNodes,
    edges: initialEdges,
    groups: [],
  };
}

export function serializeDocument(doc: CanonicalDocument): string {
  const validation = validateCanonicalDocument(doc);
  if (!validation.valid) {
    throw new Error(`Cannot serialize invalid canonical document: ${validation.errors.join('; ')}`);
  }
  return JSON.stringify(doc, null, 2);
}

export function deserializeDocument(jsonStr: string): CanonicalDocument {
  const parsed = JSON.parse(jsonStr) as CanonicalDocument;
  const validation = validateCanonicalDocument(parsed);
  if (!validation.valid) {
    throw new Error(`Invalid canonical document JSON: ${validation.errors.join('; ')}`);
  }
  return parsed;
}

export function cloneDocument(doc: CanonicalDocument): CanonicalDocument {
  return JSON.parse(JSON.stringify(doc));
}

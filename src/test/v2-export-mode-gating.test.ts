import { describe, it, expect } from 'vitest';
import { createEmptyDocument } from '../model/document';
import { createExportArtifact } from '../export/saveExport';

describe('Export Closure EX-01: Flowchart hierarchy-only export gating', () => {
  const flowchartDoc = () => {
    const doc = createEmptyDocument('Orlando Furioso', 'flowchart');
    doc.nodes = [
      { id: 'n1', text: 'Canto I', geometry: { x: 0, y: 0, width: 140, height: 44 } },
      { id: 'n2', text: 'Canto II', geometry: { x: 200, y: 0, width: 140, height: 44 } },
    ];
    doc.edges = [{ id: 'e1', source: 'n1', target: 'n2' }];
    return doc;
  };

  it.each(['markdown', 'opml', 'mm'] as const)(
    'rejects %s export for Flowchart documents at the export-artifact seam, not just the UI',
    async (format) => {
      const doc = flowchartDoc();
      await expect(createExportArtifact(doc, format)).rejects.toThrow(/Flowchart/i);
    }
  );

  // png/jpeg are excluded here: rasterization requires a browser/WebView
  // canvas runtime unrelated to EX-01 mode gating (see m5-import-export-assets.test.ts).
  it.each(['svg', 'pdf', 'html', 'mermaid', 'canvas', 'json', 'mflow'] as const)(
    'still allows %s export for Flowchart documents',
    async (format) => {
      const doc = flowchartDoc();
      const artifact = await createExportArtifact(doc, format);
      expect(artifact.filename).toContain('.');
    }
  );

  it.each(['markdown', 'opml', 'mm'] as const)('keeps %s export available for Mind Map documents', async (format) => {
    const doc = createEmptyDocument('A Mind Map', 'mindmap');
    const artifact = await createExportArtifact(doc, format);
    expect(artifact.filename).toContain('.');
  });
});

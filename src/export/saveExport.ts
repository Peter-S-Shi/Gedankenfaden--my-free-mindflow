import { CanonicalDocument } from '../model/types';
import { packageDocumentToMflow } from '../model/container';
import { INativeBridge } from '../platform/tauriBridge';
import {
  exportToHTML,
  exportToJPEG,
  exportToJSON,
  exportToJSONCanvas,
  exportToLegacyMindMapXML,
  exportToMarkdown,
  exportToMermaid,
  exportToOPML,
  exportToPDF,
  exportToPNG,
  exportToSVG,
} from './exporter';

export type ExportFormat = 'mflow' | 'json' | 'svg' | 'png' | 'jpeg' | 'pdf' | 'markdown' | 'html' | 'mermaid' | 'opml' | 'mm' | 'canvas';

export interface ExportArtifact {
  filename: string;
  extension: string;
  mimeType: string;
  contents: string | Uint8Array;
}

const FORMAT_INFO: Record<ExportFormat, { extension: string; mimeType: string }> = {
  mflow: { extension: 'mflow', mimeType: 'application/vnd.gedankenfaden.mflow' },
  json: { extension: 'json', mimeType: 'application/json' },
  svg: { extension: 'svg', mimeType: 'image/svg+xml' },
  png: { extension: 'png', mimeType: 'image/png' },
  jpeg: { extension: 'jpeg', mimeType: 'image/jpeg' },
  pdf: { extension: 'pdf', mimeType: 'application/pdf' },
  markdown: { extension: 'md', mimeType: 'text/markdown' },
  html: { extension: 'html', mimeType: 'text/html' },
  mermaid: { extension: 'mmd', mimeType: 'text/plain' },
  opml: { extension: 'opml', mimeType: 'text/xml' },
  mm: { extension: 'mm', mimeType: 'text/xml' },
  canvas: { extension: 'canvas', mimeType: 'application/json' },
};

export async function createExportArtifact(
  doc: CanonicalDocument,
  format: ExportFormat,
  assets: Map<string, Uint8Array> = new Map()
): Promise<ExportArtifact> {
  const info = FORMAT_INFO[format];
  const baseName = doc.title.toLowerCase().replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'gedankenfaden_doc';
  let contents: string | Uint8Array;
  switch (format) {
    case 'mflow': contents = packageDocumentToMflow(doc, assets); break;
    case 'json': contents = exportToJSON(doc); break;
    case 'svg': contents = exportToSVG(doc); break;
    case 'png': contents = await exportToPNG(doc); break;
    case 'jpeg': contents = await exportToJPEG(doc); break;
    case 'pdf': contents = await exportToPDF(doc); break;
    case 'markdown': contents = exportToMarkdown(doc); break;
    case 'html': contents = exportToHTML(doc); break;
    case 'mermaid': contents = exportToMermaid(doc); break;
    case 'opml': contents = exportToOPML(doc); break;
    case 'mm': contents = exportToLegacyMindMapXML(doc); break;
    case 'canvas': contents = exportToJSONCanvas(doc); break;
  }
  return { filename: `${baseName}.${info.extension}`, extension: info.extension, mimeType: info.mimeType, contents };
}

export async function saveExportWithNativeDialog(
  artifact: ExportArtifact,
  bridge: INativeBridge
): Promise<{ status: 'saved'; path: string } | { status: 'cancelled' }> {
  const path = await bridge.pickExportFile(artifact.filename, artifact.extension);
  if (!path) return { status: 'cancelled' };
  if (typeof artifact.contents === 'string') await bridge.writeTextFile(path, artifact.contents);
  else await bridge.writeBinaryFile(path, artifact.contents);
  return { status: 'saved', path };
}

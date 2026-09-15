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

/**
 * EX-01: Markdown outline, OPML, and legacy `.mm` are hierarchy/tree
 * exporters. A Flowchart document's structure lives in `edges` (a general
 * directed graph) and `groups`, not Mind Map `parentId` -- exporting it to
 * one of these formats would silently reduce it to a flat node list and
 * misrepresent it as a truthful structural export. Enforced here (the
 * export-artifact seam), not just in the UI, so a hidden/removed menu
 * option can't still be invoked programmatically to produce a misleading
 * export.
 */
const HIERARCHY_ONLY_FORMATS: ReadonlySet<ExportFormat> = new Set(['markdown', 'opml', 'mm']);

/**
 * EX-06: Windows-invalid filename characters and ASCII control characters
 * are the only things genuinely unsafe in a generated filename. Unicode/CJK
 * title characters, spaces, and ordinary punctuation are preserved as-is --
 * this must not transliterate or collapse them into underscores.
 */
export function sanitizeExportFilename(title: string): string {
  const withoutControlChars = (title || '').replace(/[\x00-\x1f\x7f]/g, '');
  // Windows-reserved characters: < > : " / \ | ? *
  const withoutInvalidChars = withoutControlChars.replace(/[<>:"/\\|?*]/g, '_');
  const trimmed = withoutInvalidChars.trim();
  // Windows disallows a filename ending in a dot or space.
  const withoutTrailingDotsOrSpaces = trimmed.replace(/[.\s]+$/, '');
  return withoutTrailingDotsOrSpaces || 'gedankenfaden_doc';
}

export async function createExportArtifact(
  doc: CanonicalDocument,
  format: ExportFormat,
  assets: Map<string, Uint8Array> = new Map()
): Promise<ExportArtifact> {
  if (doc.mode === 'flowchart' && HIERARCHY_ONLY_FORMATS.has(format)) {
    throw new Error(
      `${format.toUpperCase()} export is not available for Flowchart documents: it is a hierarchy/tree format and cannot truthfully represent a directed graph's edges and group semantics. Use Mermaid, JSON Canvas, SVG, PNG, JPEG, PDF, HTML, canonical JSON, or .mflow instead.`
    );
  }

  const info = FORMAT_INFO[format];
  const baseName = sanitizeExportFilename(doc.title);
  let contents: string | Uint8Array;
  switch (format) {
    case 'mflow': contents = packageDocumentToMflow(doc, assets); break;
    case 'json': contents = exportToJSON(doc); break;
    case 'svg': contents = exportToSVG(doc, assets); break;
    case 'png': contents = await exportToPNG(doc, assets); break;
    case 'jpeg': contents = await exportToJPEG(doc, assets); break;
    case 'pdf': contents = await exportToPDF(doc, assets); break;
    case 'markdown': contents = exportToMarkdown(doc); break;
    case 'html': contents = exportToHTML(doc, assets); break;
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

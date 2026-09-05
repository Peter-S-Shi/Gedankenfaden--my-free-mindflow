import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { CanonicalDocument } from './types';
import { serializeDocument, deserializeDocument } from './document';

export interface MflowPackageData {
  doc: CanonicalDocument;
  document: CanonicalDocument;
  meta: {
    schemaVersion: string;
    id: string;
    title: string;
    mode: string;
    nodeCount: number;
    edgeCount: number;
    updatedAt: string;
    paletteId: string;
    generator?: string;
  };
  assets: Map<string, Uint8Array>;
}

export type PackedContainer = MflowPackageData;

/**
 * Packages a canonical document and optional embedded assets into a single-file .mflow ZIP container.
 */
export function packageDocumentToMflow(
  doc: CanonicalDocument,
  assets: Map<string, Uint8Array> = new Map()
): Uint8Array {
  const docJson = serializeDocument(doc);

  const meta = {
    schemaVersion: doc.schemaVersion,
    id: doc.id,
    title: doc.title,
    mode: doc.mode,
    nodeCount: doc.nodes.length,
    edgeCount: doc.edges.length,
    updatedAt: doc.updatedAt,
    paletteId: doc.theme?.paletteId || 'nordic-slate',
    generator: 'Gedankenfaden 1.0',
  };

  const zipEntries: Record<string, Uint8Array> = {
    'document.json': strToU8(docJson),
    'meta.json': strToU8(JSON.stringify(meta, null, 2)),
  };

  // Add internal assets
  assets.forEach((bytes, assetName) => {
    const cleanName = assetName.startsWith('assets/') ? assetName : `assets/${assetName}`;
    zipEntries[cleanName] = bytes;
  });

  return zipSync(zipEntries, { level: 6 });
}

/**
 * Parses an in-memory .mflow container into its canonical document and extracted binary assets.
 */
export function parseMflowFromBytes(data: Uint8Array): MflowPackageData {
  const unzipped = unzipSync(data);

  if (!unzipped['document.json']) {
    throw new Error('Invalid .mflow container: missing document.json');
  }

  const docJson = strFromU8(unzipped['document.json']);
  const doc = deserializeDocument(docJson);

  let meta: MflowPackageData['meta'] = {
    schemaVersion: doc.schemaVersion,
    id: doc.id,
    title: doc.title,
    mode: doc.mode,
    nodeCount: doc.nodes.length,
    edgeCount: doc.edges.length,
    updatedAt: doc.updatedAt,
    paletteId: doc.theme?.paletteId || 'nordic-slate',
    generator: 'Gedankenfaden 1.0',
  };

  if (unzipped['meta.json']) {
    try {
      meta = {
        ...meta,
        ...JSON.parse(strFromU8(unzipped['meta.json'])),
      };
    } catch {
      // Fallback to generated meta
    }
  }

  const assets = new Map<string, Uint8Array>();
  Object.keys(unzipped).forEach((entryPath) => {
    if (entryPath.startsWith('assets/') && entryPath !== 'assets/') {
      const assetKey = entryPath.replace(/^assets\//, '');
      assets.set(assetKey, unzipped[entryPath]);
    }
  });

  return { doc, document: doc, meta, assets };
}

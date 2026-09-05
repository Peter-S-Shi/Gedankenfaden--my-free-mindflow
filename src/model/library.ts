/**
 * Gedankenfaden Hybrid Library & Local Disk Catalog
 * Blends real Windows filesystem directory scanning with a fast metadata cache (%APPDATA%\Gedankenfaden\library.json)
 */

import { CanonicalDocument, DocumentMode } from './types';
import { createEmptyDocument, deserializeDocument } from './document';
import { parseMflowFromBytes, packageDocumentToMflow } from './container';
import { getNativeBridge, INativeBridge, FileEntry } from '../platform/tauriBridge';
import { atomicWriteTextFile, atomicWriteBinaryFile } from './recovery';
import { importFromMarkdown, importFromOPML } from './importers';

export interface LibraryEntry {
  id: string;
  title: string;
  mode: DocumentMode;
  filePath: string;
  fileFormat: 'mflow' | 'json';
  updatedAt: string;
  nodeCount: number;
  edgeCount: number;
  isPinned?: boolean;
  tags?: string[];
  thumbnailUri?: string;
}

export interface LibraryCacheManifest {
  version: '1.0';
  lastScannedAt: string;
  entries: LibraryEntry[];
}

const LIBRARY_CACHE_FILE = 'library.json';

export async function getLibraryCachePath(bridge: INativeBridge = getNativeBridge()): Promise<string> {
  const appData = await bridge.getAppDataDir();
  return `${appData}/${LIBRARY_CACHE_FILE}`.replace(/\\/g, '/');
}

/**
 * Loads the fast metadata cache from local AppData without disk traversal
 */
export async function loadLibraryCache(bridge: INativeBridge = getNativeBridge()): Promise<LibraryEntry[]> {
  const cachePath = await getLibraryCachePath(bridge);
  if (!(await bridge.exists(cachePath))) {
    return [];
  }

  try {
    const raw = await bridge.readTextFile(cachePath);
    const manifest: LibraryCacheManifest = JSON.parse(raw);
    return manifest.entries || [];
  } catch {
    return [];
  }
}

/**
 * Saves updated entries to fast metadata cache
 */
export async function saveLibraryCache(
  entries: LibraryEntry[],
  bridge: INativeBridge = getNativeBridge()
): Promise<void> {
  const cachePath = await getLibraryCachePath(bridge);
  const appData = await bridge.getAppDataDir();
  if (!(await bridge.exists(appData))) {
    await bridge.createDir(appData, { recursive: true });
  }

  const manifest: LibraryCacheManifest = {
    version: '1.0',
    lastScannedAt: new Date().toISOString(),
    entries,
  };

  await atomicWriteTextFile(cachePath, JSON.stringify(manifest, null, 2), bridge);
}

/**
 * Loads a CanonicalDocument from a .mflow, .json, .md, or .opml file on disk
 */
export async function loadDocumentFromFile(
  filePath: string,
  bridge: INativeBridge = getNativeBridge()
): Promise<CanonicalDocument | null> {
  try {
    const lower = filePath.toLowerCase();
    const isMflow = lower.endsWith('.mflow');
    const isJson = lower.endsWith('.json');
    const isMd = lower.endsWith('.md') || lower.endsWith('.markdown');
    const isOpml = lower.endsWith('.opml');

    if (!isMflow && !isJson && !isMd && !isOpml) return null;

    if (isMflow) {
      const bytes = await bridge.readBinaryFile(filePath);
      const pkg = await parseMflowFromBytes(bytes);
      return pkg.document;
    } else {
      const text = await bridge.readTextFile(filePath);
      if (isJson) {
        return deserializeDocument(text);
      } else if (isMd) {
        const basename = filePath.split('/').pop()?.replace(/\.(md|markdown)$/i, '') || 'Imported Markdown';
        return importFromMarkdown(text, basename);
      } else if (isOpml) {
        const basename = filePath.split('/').pop()?.replace(/\.opml$/i, '') || 'Imported OPML';
        return importFromOPML(text, basename);
      }
    }
  } catch (err) {
    console.error(`Failed to load document from ${filePath}:`, err);
    return null;
  }
  return null;
}

export interface ImportedLibraryDocument {
  document: CanonicalDocument;
  filePath: string;
  entries: LibraryEntry[];
}

/** Runs the same native import-to-owned-library path used by the Library UI. */
export async function importDocumentIntoLibrary(
  sourcePath: string,
  libraryFolder: string,
  bridge: INativeBridge = getNativeBridge(),
  uniqueSuffix = Date.now().toString()
): Promise<ImportedLibraryDocument | null> {
  const document = await loadDocumentFromFile(sourcePath, bridge);
  if (!document) return null;

  const lower = sourcePath.toLowerCase();
  let filePath = sourcePath.replace(/\\/g, '/');
  if (!lower.endsWith('.mflow') && !lower.endsWith('.json')) {
    const safeTitle = (document.title || 'imported_document')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/gi, '_');
    filePath = `${libraryFolder}/${safeTitle}_${uniqueSuffix}.mflow`.replace(/\\/g, '/');
    const bytes = packageDocumentToMflow(document);
    await atomicWriteBinaryFile(filePath, bytes, bridge);
  }

  return {
    document,
    filePath,
    entries: await syncLibraryWithDisk([libraryFolder], bridge),
  };
}

/**
 * Inspects a document file and generates a metadata catalog entry
 */
export async function inspectDocumentFile(
  filePath: string,
  bridge: INativeBridge = getNativeBridge()
): Promise<LibraryEntry | null> {
  try {
    const isMflow = filePath.toLowerCase().endsWith('.mflow');
    const isJson = filePath.toLowerCase().endsWith('.json');
    if (!isMflow && !isJson) return null;

    const doc = await loadDocumentFromFile(filePath, bridge);
    if (!doc) return null;

    return {
      id: doc.id,
      title: doc.title || 'Untitled Document',
      mode: doc.mode || 'mindmap',
      filePath,
      fileFormat: isMflow ? 'mflow' : 'json',
      updatedAt: doc.updatedAt || new Date().toISOString(),
      nodeCount: doc.nodes?.length || 0,
      edgeCount: doc.edges?.length || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Scans a target filesystem directory for .mflow and .json documents
 */
export async function scanDirectoryForDocuments(
  dirPath: string,
  bridge: INativeBridge = getNativeBridge()
): Promise<LibraryEntry[]> {
  if (!(await bridge.exists(dirPath))) {
    return [];
  }

  const fileEntries: FileEntry[] = await bridge.readDir(dirPath);
  const results: LibraryEntry[] = [];

  for (const file of fileEntries) {
    if (file.isDirectory) continue;
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.mflow') || lower.endsWith('.json')) {
      const entry = await inspectDocumentFile(file.path, bridge);
      if (entry) {
        results.push(entry);
      }
    }
  }

  return results;
}

/**
 * Synchronizes fast library cache against multiple scanned directories
 */
export async function syncLibraryWithDisk(
  scanDirs: string[],
  bridge: INativeBridge = getNativeBridge()
): Promise<LibraryEntry[]> {
  const existingEntries = await loadLibraryCache(bridge);
  const entryMap = new Map<string, LibraryEntry>();

  for (const entry of existingEntries) {
    entryMap.set(entry.filePath, entry);
  }

  for (const dir of scanDirs) {
    const scanned = await scanDirectoryForDocuments(dir, bridge);
    for (const item of scanned) {
      const existing = entryMap.get(item.filePath);
      entryMap.set(item.filePath, {
        ...item,
        isPinned: existing?.isPinned,
        tags: existing?.tags,
      });
    }
  }

  // Filter out any cached entries that no longer exist on disk
  const verifiedEntries: LibraryEntry[] = [];
  for (const entry of entryMap.values()) {
    if (await bridge.exists(entry.filePath)) {
      verifiedEntries.push(entry);
    }
  }

  // Sort descending by updatedAt
  verifiedEntries.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  await saveLibraryCache(verifiedEntries, bridge);
  return verifiedEntries;
}

/**
 * Creates a new document directly in a target folder and registers it in the library catalog
 */
export async function createDocumentInLibrary(
  title: string,
  mode: DocumentMode,
  format: 'mflow' | 'json' = 'mflow',
  targetDir?: string,
  bridge: INativeBridge = getNativeBridge()
): Promise<{ doc: CanonicalDocument; entry: LibraryEntry }> {
  const dir = targetDir || (await bridge.getDefaultDocumentsDir());
  if (!(await bridge.exists(dir))) {
    await bridge.createDir(dir, { recursive: true });
  }

  const doc = createEmptyDocument(title, mode);
  const safeFilename = title.toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
  const filePath = `${dir}/${safeFilename}_${Date.now()}.${format}`.replace(/\\/g, '/');

  if (format === 'mflow') {
    const bytes = await packageDocumentToMflow(doc);
    await atomicWriteBinaryFile(filePath, bytes, bridge);
  } else {
    await atomicWriteTextFile(filePath, JSON.stringify(doc, null, 2), bridge);
  }

  const entry: LibraryEntry = {
    id: doc.id,
    title: doc.title,
    mode: doc.mode,
    filePath,
    fileFormat: format,
    updatedAt: doc.updatedAt,
    nodeCount: doc.nodes.length,
    edgeCount: doc.edges.length,
  };

  const cached = await loadLibraryCache(bridge);
  cached.unshift(entry);
  await saveLibraryCache(cached, bridge);

  return { doc, entry };
}

/**
 * Removes a document file and updates cache
 */
export async function deleteDocumentFromLibrary(
  entry: LibraryEntry,
  bridge: INativeBridge = getNativeBridge()
): Promise<void> {
  if (await bridge.exists(entry.filePath)) {
    // Non-destructive deletion: move to OS Recycle Bin
    await bridge.trashFile(entry.filePath);
  }

  const cached = await loadLibraryCache(bridge);
  const updated = cached.filter((c) => c.filePath !== entry.filePath);
  await saveLibraryCache(updated, bridge);
}

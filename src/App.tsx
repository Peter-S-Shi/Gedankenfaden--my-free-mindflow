import React, { useState, useEffect, useRef } from 'react';
import { CanonicalDocument } from './model/types';
import { createEmptyDocument } from './model/document';
import { getDefaultTheme } from './model/theme';
import { LibraryHome } from './components/LibraryHome';
import { CanvasEditor } from './components/CanvasEditor';
import {
  AutoSaveEngine,
  saveRollingSnapshot,
  markSessionActive,
  markSessionClean,
  detectCrashOrUnsaved,
  restoreDocumentFromSnapshot,
  CrashDetectionResult,
  atomicWriteBinaryFile,
  atomicWriteTextFile,
} from './model/recovery';
import {
  LibraryEntry,
  syncLibraryWithDisk,
  createDocumentInLibrary,
  deleteDocumentFromLibrary,
  loadDocumentFromFile,
} from './model/library';
import { getNativeBridge } from './platform/tauriBridge';
import { packageDocumentToMflow } from './model/container';

const STORAGE_KEY = 'gedankenfaden_recent_docs_v1';

const INITIAL_DOCS: CanonicalDocument[] = [
  {
    schemaVersion: '1.0',
    id: 'doc_sample_mindmap',
    title: 'Gedankenfaden Architecture',
    mode: 'mindmap',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    theme: getDefaultTheme('mindmap'),
    nodes: [
      {
        id: 'mm_root',
        text: 'Visual Engine',
        type: 'root',
        geometry: { x: 300, y: 200, width: 160, height: 48 },
        style: { backgroundColor: '#2563eb', textColor: '#ffffff' },
      },
      {
        id: 'mm_c1',
        text: 'Canonical Model',
        geometry: { x: 540, y: 140, width: 150, height: 44 },
        parentId: 'mm_root',
      },
      {
        id: 'mm_c2',
        text: 'Projection Layer',
        geometry: { x: 540, y: 220, width: 150, height: 44 },
        parentId: 'mm_root',
      },
      {
        id: 'mm_c3',
        text: 'Signature Motion',
        geometry: { x: 540, y: 300, width: 150, height: 44 },
        parentId: 'mm_root',
      },
    ],
    edges: [
      { id: 'e1', source: 'mm_root', target: 'mm_c1' },
      { id: 'e2', source: 'mm_root', target: 'mm_c2' },
      { id: 'e3', source: 'mm_root', target: 'mm_c3' },
    ],
    groups: [],
  },
  {
    schemaVersion: '1.0',
    id: 'doc_sample_flowchart',
    title: 'Data Ingestion & Verification Pipeline',
    mode: 'flowchart',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    theme: getDefaultTheme('flowchart'),
    nodes: [
      {
        id: 'fc_start',
        text: 'Document Received',
        type: 'terminal',
        geometry: { x: 300, y: 100, width: 160, height: 44 },
      },
      {
        id: 'fc_parse',
        text: 'Parse Schema v1.0',
        type: 'process',
        geometry: { x: 300, y: 200, width: 160, height: 44 },
      },
      {
        id: 'fc_validate',
        text: 'Verify Graph Invariants',
        type: 'decision',
        geometry: { x: 300, y: 300, width: 180, height: 48 },
      },
      {
        id: 'fc_render',
        text: 'Project to Canvas',
        type: 'terminal',
        geometry: { x: 300, y: 420, width: 160, height: 44 },
      },
    ],
    edges: [
      { id: 'fe1', source: 'fc_start', target: 'fc_parse' },
      { id: 'fe2', source: 'fc_parse', target: 'fc_validate' },
      { id: 'fe3', source: 'fc_validate', target: 'fc_render', label: 'Valid' },
    ],
    groups: [],
  },
  {
    schemaVersion: '1.0',
    id: 'doc_sample_release',
    title: 'Windows Desktop Release Gate',
    mode: 'flowchart',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    viewport: { x: 0, y: 0, zoom: 1 },
    theme: getDefaultTheme('flowchart'),
    nodes: [
      {
        id: 'r_start',
        text: 'Spike Validation',
        type: 'terminal',
        geometry: { x: 250, y: 120, width: 150, height: 44 },
      },
      {
        id: 'r_build',
        text: 'Automated Vitest Suite',
        type: 'process',
        geometry: { x: 450, y: 120, width: 170, height: 44 },
      },
      {
        id: 'r_report',
        text: 'Generate Gate Reports',
        type: 'terminal',
        geometry: { x: 670, y: 120, width: 170, height: 44 },
      },
    ],
    edges: [
      { id: 're1', source: 'r_start', target: 'r_build' },
      { id: 're2', source: 'r_build', target: 'r_report' },
    ],
    groups: [],
  },
];

export const App: React.FC = () => {
  const [documents, setDocuments] = useState<CanonicalDocument[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback
    }
    return INITIAL_DOCS;
  });

  const [libraryEntries, setLibraryEntries] = useState<LibraryEntry[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [activeDoc, setActiveDoc] = useState<CanonicalDocument | null>(null);
  const [activeDocPath, setActiveDocPath] = useState<string | null>(null);
  const [crashRecovery, setCrashRecovery] = useState<CrashDetectionResult | null>(null);
  const autoSaveEngineRef = useRef<AutoSaveEngine>(new AutoSaveEngine(600));

  // Check for CLI open file, crash recovery, and initialize filesystem library on mount
  useEffect(() => {
    let isMounted = true;
    const initApp = async () => {
      const bridge = getNativeBridge();

      // 1. Check CLI open file (.mflow or .json passed via Windows command line)
      try {
        const cliFilePath = await bridge.getCliOpenFile();
        if (cliFilePath && (await bridge.exists(cliFilePath))) {
          const cliDoc = await loadDocumentFromFile(cliFilePath, bridge);
          if (cliDoc && isMounted) {
            setActiveDoc(cliDoc);
            setActiveDocPath(cliFilePath);
            await markSessionActive(cliDoc.id, cliDoc.title);
            return;
          }
        }
      } catch (err) {
        console.error('Failed to load CLI open file:', err);
      }

      // 2. Check for crash or unsaved sessions
      const recovery = await detectCrashOrUnsaved();
      if (recovery.hasUnsavedOrCrash && isMounted) {
        setCrashRecovery(recovery);
      }

      // 3. Resolve active documents folder & sync library
      try {
        const defaultDocDir = await bridge.getDefaultDocumentsDir();
        const storedFolder = localStorage.getItem('gedankenfaden_library_folder') || defaultDocDir;
        if (isMounted) setCurrentFolder(storedFolder);

        if (!(await bridge.exists(storedFolder))) {
          await bridge.createDir(storedFolder, { recursive: true });
        }

        const entries = await syncLibraryWithDisk([storedFolder], bridge);
        if (isMounted) setLibraryEntries(entries);
      } catch (err) {
        console.error('Failed to initialize local library folder:', err);
      }
    };

    initApp();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
    } catch {
      // Storage error ignored
    }
  }, [documents]);

  const handleOpenDoc = async (docOrEntry: CanonicalDocument | LibraryEntry, filePath?: string) => {
    const bridge = getNativeBridge();
    const targetPath = filePath || ('filePath' in docOrEntry ? (docOrEntry as LibraryEntry).filePath : undefined);

    if (targetPath && (await bridge.exists(targetPath))) {
      const loaded = await loadDocumentFromFile(targetPath, bridge);
      if (loaded) {
        setActiveDoc(loaded);
        setActiveDocPath(targetPath);
        await markSessionActive(loaded.id, loaded.title);
        return;
      }
    }

    // Fallback for in-memory or mock documents
    const doc = 'nodes' in docOrEntry ? (docOrEntry as CanonicalDocument) : null;
    if (doc) {
      setActiveDoc(doc);
      setActiveDocPath(targetPath || null);
      await markSessionActive(doc.id, doc.title);
    }
  };

  const handleCreateNew = async (mode: 'mindmap' | 'flowchart') => {
    const bridge = getNativeBridge();
    const title = mode === 'mindmap' ? 'New Mind Map' : 'New Flowchart';
    const folder = currentFolder || (await bridge.getDefaultDocumentsDir());

    try {
      const { doc, entry } = await createDocumentInLibrary(title, mode, 'mflow', folder, bridge);
      setLibraryEntries((prev) => [entry, ...prev.filter((e) => e.filePath !== entry.filePath)]);
      setDocuments((prev) => [doc, ...prev]);
      setActiveDoc(doc);
      setActiveDocPath(entry.filePath);
      await markSessionActive(doc.id, doc.title);
    } catch {
      const newDoc = createEmptyDocument(title, mode);
      setDocuments((prev) => [newDoc, ...prev]);
      await markSessionActive(newDoc.id, newDoc.title);
      setActiveDoc(newDoc);
      setActiveDocPath(null);
    }
  };

  const handleSaveDoc = async (updatedDoc: CanonicalDocument) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d))
    );
    setActiveDoc(updatedDoc);

    const bridge = getNativeBridge();

    // Immediate save directly to target path if open
    if (activeDocPath) {
      try {
        if (activeDocPath.toLowerCase().endsWith('.mflow')) {
          const bytes = await packageDocumentToMflow(updatedDoc);
          await atomicWriteBinaryFile(activeDocPath, bytes, bridge);
        } else if (activeDocPath.toLowerCase().endsWith('.json')) {
          await atomicWriteTextFile(activeDocPath, JSON.stringify(updatedDoc, null, 2), bridge);
        }
      } catch (err) {
        console.error('Failed to save document to file:', err);
      }
    }

    // Schedule debounced autosave snapshot
    autoSaveEngineRef.current.scheduleSave(updatedDoc, async (doc) => {
      await saveRollingSnapshot(doc, 'autosave');
      if (activeDocPath) {
        try {
          if (activeDocPath.toLowerCase().endsWith('.mflow')) {
            const bytes = await packageDocumentToMflow(doc);
            await atomicWriteBinaryFile(activeDocPath, bytes, bridge);
          } else if (activeDocPath.toLowerCase().endsWith('.json')) {
            await atomicWriteTextFile(activeDocPath, JSON.stringify(doc, null, 2), bridge);
          }
        } catch {
          // Ignored
        }
      }
    });
  };

  const handleDeleteDoc = async (target: LibraryEntry | CanonicalDocument) => {
    const bridge = getNativeBridge();
    if ('filePath' in target && target.filePath) {
      await deleteDocumentFromLibrary(target as LibraryEntry, bridge);
      setLibraryEntries((prev) => prev.filter((e) => e.filePath !== target.filePath));
    } else {
      setDocuments((prev) => prev.filter((d) => d.id !== target.id));
    }
  };

  const handleChangeFolder = async () => {
    const bridge = getNativeBridge();
    const picked = await bridge.pickFolder();
    if (picked) {
      setCurrentFolder(picked);
      localStorage.setItem('gedankenfaden_library_folder', picked);
      const entries = await syncLibraryWithDisk([picked], bridge);
      setLibraryEntries(entries);
    }
  };

  const handleRefreshLibrary = async () => {
    const bridge = getNativeBridge();
    const folder = currentFolder || (await bridge.getDefaultDocumentsDir());
    const entries = await syncLibraryWithDisk([folder], bridge);
    setLibraryEntries(entries);
  };

  const handleImportDocument = async () => {
    const bridge = getNativeBridge();
    const picked = await bridge.pickDocumentFile();
    if (picked && (await bridge.exists(picked))) {
      const doc = await loadDocumentFromFile(picked, bridge);
      if (doc) {
        const folder = currentFolder || (await bridge.getDefaultDocumentsDir());
        const lower = picked.toLowerCase();
        const isNativeFormat = lower.endsWith('.mflow') || lower.endsWith('.json');

        let targetSavePath: string;
        if (isNativeFormat) {
          targetSavePath = picked;
        } else {
          // For imported .md and .opml, establish a user-owned .mflow file in active library folder
          const safeTitle = (doc.title || 'imported_document').toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
          targetSavePath = `${folder}/${safeTitle}_${Date.now()}.mflow`.replace(/\\/g, '/');
          const bytes = await packageDocumentToMflow(doc);
          await atomicWriteBinaryFile(targetSavePath, bytes, bridge);
        }

        const entries = await syncLibraryWithDisk([folder], bridge);
        setLibraryEntries(entries);

        setActiveDoc(doc);
        setActiveDocPath(targetSavePath);
        await markSessionActive(doc.id, doc.title);
      }
    }
  };

  const handleBackToLibrary = async () => {
    await autoSaveEngineRef.current.flushPending();
    await markSessionClean();
    setActiveDoc(null);
    setActiveDocPath(null);
    await handleRefreshLibrary();
  };

  const handleRestoreCrashSnapshot = async () => {
    if (crashRecovery?.latestSnapshot) {
      try {
        const restored = await restoreDocumentFromSnapshot(crashRecovery.latestSnapshot);
        setDocuments((prev) => {
          const exists = prev.some((d) => d.id === restored.id);
          return exists ? prev.map((d) => (d.id === restored.id ? restored : d)) : [restored, ...prev];
        });
        await markSessionActive(restored.id, restored.title);
        setActiveDoc(restored);
        setActiveDocPath(null);
      } catch {
        // Failed to deserialize
      }
    }
    await markSessionClean();
    setCrashRecovery(null);
  };

  const handleDismissCrashRecovery = async () => {
    await markSessionClean();
    setCrashRecovery(null);
  };

  return (
    <div className="w-screen h-screen overflow-hidden select-none">
      {activeDoc ? (
        <CanvasEditor
          initialDocument={activeDoc}
          onBackToLibrary={handleBackToLibrary}
          onSaveDocument={handleSaveDoc}
        />
      ) : (
        <LibraryHome
          recentDocuments={documents}
          libraryEntries={libraryEntries}
          currentFolder={currentFolder}
          onOpenDocument={handleOpenDoc}
          onCreateNew={handleCreateNew}
          onChangeFolder={handleChangeFolder}
          onRefreshLibrary={handleRefreshLibrary}
          onImportDocument={handleImportDocument}
          onDeleteDocument={handleDeleteDoc}
          crashRecovery={crashRecovery}
          onRestoreCrashSnapshot={handleRestoreCrashSnapshot}
          onDismissCrashRecovery={handleDismissCrashRecovery}
        />
      )}
    </div>
  );
};

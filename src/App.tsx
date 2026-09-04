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
} from './model/recovery';

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

  const [activeDoc, setActiveDoc] = useState<CanonicalDocument | null>(null);
  const [crashRecovery, setCrashRecovery] = useState<CrashDetectionResult | null>(null);
  const autoSaveEngineRef = useRef<AutoSaveEngine>(new AutoSaveEngine(600));

  // Check for crash or unsaved sessions on initial mount
  useEffect(() => {
    detectCrashOrUnsaved().then((result) => {
      if (result.hasUnsavedOrCrash) {
        setCrashRecovery(result);
      }
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
    } catch {
      // Storage error ignored
    }
  }, [documents]);

  const handleOpenDoc = async (doc: CanonicalDocument) => {
    await markSessionActive(doc.id, doc.title);
    setActiveDoc(doc);
  };

  const handleCreateNew = async (mode: 'mindmap' | 'flowchart') => {
    const newDoc = createEmptyDocument(
      mode === 'mindmap' ? 'New Mind Map' : 'New Flowchart',
      mode
    );
    setDocuments((prev) => [newDoc, ...prev]);
    await markSessionActive(newDoc.id, newDoc.title);
    setActiveDoc(newDoc);
  };

  const handleSaveDoc = async (updatedDoc: CanonicalDocument) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d))
    );
    setActiveDoc(updatedDoc);

    // Schedule debounced autosave snapshot
    autoSaveEngineRef.current.scheduleSave(updatedDoc, async (doc) => {
      await saveRollingSnapshot(doc, 'autosave');
    });
  };

  const handleBackToLibrary = async () => {
    await autoSaveEngineRef.current.flushPending();
    await markSessionClean();
    setActiveDoc(null);
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
          onOpenDocument={handleOpenDoc}
          onCreateNew={handleCreateNew}
          crashRecovery={crashRecovery}
          onRestoreCrashSnapshot={handleRestoreCrashSnapshot}
          onDismissCrashRecovery={handleDismissCrashRecovery}
        />
      )}
    </div>
  );
};

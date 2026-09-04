import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Connection,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  ReactFlowInstance,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { CanonicalDocument, CanonicalNode, DocumentTheme } from '../model/types';
import { canonicalToReactFlow, reactFlowToCanonical, CustomNodeData } from '../model/adapter';
import { autoLayoutDocument } from '../model/layout';
import { HistoryManager } from '../model/history';
import { exportToJSON, exportToSVG } from '../export/exporter';
import { packageDocumentToMflow, parseMflowFromBytes } from '../model/container';
import { AssetStore } from '../model/assets';
import { resetNodeToTheme, BUILTIN_THEMES } from '../model/theme';
import { CustomNode } from './CustomNode';
import { OutlinePanel } from './OutlinePanel';
import { InspectorPanel } from './InspectorPanel';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Undo,
  Redo,
  Sparkles,
  Download,
  Save,
  Upload,
  FolderSync,
  PanelLeft,
  PanelRight,
} from 'lucide-react';

const nodeTypes = {
  customNode: CustomNode,
};

interface CanvasEditorProps {
  initialDocument: CanonicalDocument;
  onBackToLibrary: () => void;
  onSaveDocument: (doc: CanonicalDocument) => void;
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({
  initialDocument,
  onBackToLibrary,
  onSaveDocument,
}) => {
  const [doc, setDoc] = useState<CanonicalDocument>(initialDocument);
  const historyRef = useRef<HistoryManager>(new HistoryManager(initialDocument));
  const assetStoreRef = useRef<AssetStore>(new AssetStore());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('Ready');

  // 3-Pane workspace shell visibility
  const [isOutlineOpen, setIsOutlineOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => canonicalToReactFlow(initialDocument),
    [initialDocument]
  );
  const [nodes, setNodes] = useState<Node<CustomNodeData>[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const rfInstanceRef = useRef<ReactFlowInstance<Node<CustomNodeData>, Edge> | null>(null);

  // Track currently selected node
  const selectedNodeId = useMemo(() => {
    const found = nodes.find((n) => n.selected);
    return found ? found.id : null;
  }, [nodes]);

  const selectedCanonicalNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return doc.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [doc.nodes, selectedNodeId]);

  const updateHistoryStatus = useCallback(() => {
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
  }, []);

  const syncToCanonical = useCallback(
    (nextNodes: Node<CustomNodeData>[], nextEdges: Edge[], pushHistory = true) => {
      const nextDoc = reactFlowToCanonical(nextNodes, nextEdges, doc);
      if (pushHistory) {
        historyRef.current.pushState(nextDoc);
        updateHistoryStatus();
      }
      setDoc(nextDoc);
      return nextDoc;
    },
    [doc, updateHistoryStatus]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<CustomNodeData>>[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds);
        const isDragEnd = changes.some((c) => c.type === 'position' && !c.dragging);
        if (isDragEnd) {
          syncToCanonical(next, edges, true);
        } else {
          syncToCanonical(next, edges, false);
        }
        return next;
      });
    },
    [edges, syncToCanonical]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      setEdges((eds) => {
        const next = applyEdgeChanges(changes, eds);
        syncToCanonical(nodes, next, true);
        return next;
      });
    },
    [nodes, syncToCanonical]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const theme = doc.theme || BUILTIN_THEMES['nordic-slate'];
      setEdges((eds) => {
        const next = addEdge(
          {
            ...params,
            type: doc.mode === 'mindmap' ? 'smoothstep' : 'bezier',
            style: { stroke: theme.edgeColor || '#94a3b8', strokeWidth: 2 },
          },
          eds
        );
        syncToCanonical(nodes, next, true);
        return next;
      });
      setStatusMessage('Connected edge');
    },
    [doc.mode, doc.theme, nodes, syncToCanonical]
  );

  // Focus node on canvas (used by OutlinePanel)
  const handleSelectAndFocusNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          selected: n.id === nodeId,
        }))
      );

      const target = nodes.find((n) => n.id === nodeId);
      if (target && rfInstanceRef.current) {
        rfInstanceRef.current.setCenter(
          target.position.x + (typeof target.style?.width === 'number' ? target.style.width / 2 : 75),
          target.position.y + (typeof target.style?.height === 'number' ? target.style.height / 2 : 22),
          { zoom: 1.2, duration: 400 }
        );
      }
    },
    [nodes]
  );

  // Signature Motion Track B: Node Birth interaction
  const handleAddNode = useCallback(() => {
    const selectedNode = nodes.find((n) => n.selected);
    const newId = `node_${Date.now()}`;
    let newX = 400;
    let newY = 300;
    let parentId: string | undefined = undefined;

    if (selectedNode) {
      newX = selectedNode.position.x + (doc.mode === 'mindmap' ? 220 : 0);
      newY = selectedNode.position.y + (doc.mode === 'mindmap' ? 40 : 120);
      parentId = selectedNode.id;
    }

    const newNode: Node<CustomNodeData> = {
      id: newId,
      type: 'customNode',
      position: { x: newX, y: newY },
      data: {
        label: doc.mode === 'mindmap' ? 'Sub Idea' : 'Process Step',
        nodeType: 'default',
        parentId,
        isNewBorn: true,
      },
      style: { width: 140, height: 44 },
    };

    let nextEdges = [...edges];
    if (selectedNode) {
      const theme = doc.theme || BUILTIN_THEMES['nordic-slate'];
      const newEdge: Edge = {
        id: `edge_${selectedNode.id}_${newId}`,
        source: selectedNode.id,
        target: newId,
        type: doc.mode === 'mindmap' ? 'smoothstep' : 'bezier',
        style: { stroke: theme.edgeColor || '#3b82f6', strokeWidth: 2 },
      };
      nextEdges.push(newEdge);
    }

    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    setEdges(nextEdges);
    syncToCanonical(nextNodes, nextEdges, true);
    setStatusMessage('Added node');

    setTimeout(() => {
      setNodes((currentNodes) =>
        currentNodes.map((n) =>
          n.id === newId ? { ...n, data: { ...n.data, isNewBorn: false } } : n
        )
      );
    }, 400);
  }, [nodes, edges, doc.mode, doc.theme, syncToCanonical]);

  const handleDeleteSelected = useCallback(() => {
    const selectedNodeIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    if (selectedNodeIds.size === 0) {
      setStatusMessage('Select a node to delete');
      return;
    }

    const nextNodes = nodes.filter((n) => !selectedNodeIds.has(n.id));
    const nextEdges = edges.filter(
      (e) => !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target)
    );

    setNodes(nextNodes);
    setEdges(nextEdges);
    syncToCanonical(nextNodes, nextEdges, true);
    setStatusMessage(`Deleted ${selectedNodeIds.size} node(s)`);
  }, [nodes, edges, syncToCanonical]);

  const handleAutoLayout = useCallback(() => {
    const currentDoc = reactFlowToCanonical(nodes, edges, doc);
    const layoutedDoc = autoLayoutDocument(currentDoc);
    const projected = canonicalToReactFlow(layoutedDoc);

    setNodes(projected.nodes);
    setEdges(projected.edges);
    setDoc(layoutedDoc);
    historyRef.current.pushState(layoutedDoc);
    updateHistoryStatus();
    setStatusMessage('Auto-layout applied (Dagre)');
  }, [nodes, edges, doc, updateHistoryStatus]);

  const handleUndo = useCallback(() => {
    const prev = historyRef.current.undo();
    if (prev) {
      setDoc(prev);
      const projected = canonicalToReactFlow(prev);
      setNodes(projected.nodes);
      setEdges(projected.edges);
      updateHistoryStatus();
      setStatusMessage('Undo');
    }
  }, [updateHistoryStatus]);

  const handleRedo = useCallback(() => {
    const next = historyRef.current.redo();
    if (next) {
      setDoc(next);
      const projected = canonicalToReactFlow(next);
      setNodes(projected.nodes);
      setEdges(projected.edges);
      updateHistoryStatus();
      setStatusMessage('Redo');
    }
  }, [updateHistoryStatus]);

  // Update theme from Inspector
  const handleUpdateTheme = useCallback(
    (theme: DocumentTheme) => {
      const nextDoc: CanonicalDocument = {
        ...doc,
        theme,
        updatedAt: new Date().toISOString(),
      };
      setDoc(nextDoc);
      const projected = canonicalToReactFlow(nextDoc);
      setNodes(projected.nodes);
      setEdges(projected.edges);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
      setStatusMessage(`Theme applied: ${theme.name}`);
    },
    [doc, updateHistoryStatus]
  );

  // Update node style or shape from Inspector
  const handleUpdateNode = useCallback(
    (nodeId: string, updates: Partial<CanonicalNode>) => {
      const nextDoc: CanonicalDocument = {
        ...doc,
        nodes: doc.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)),
        updatedAt: new Date().toISOString(),
      };
      setDoc(nextDoc);
      const projected = canonicalToReactFlow(nextDoc);
      setNodes(projected.nodes);
      setEdges(projected.edges);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
    },
    [doc, updateHistoryStatus]
  );

  // Reset node to theme defaults
  const handleResetNodeStyle = useCallback(
    (nodeId: string) => {
      const target = doc.nodes.find((n) => n.id === nodeId);
      if (!target) return;
      const resetNode = resetNodeToTheme(target);
      handleUpdateNode(nodeId, resetNode);
      setStatusMessage('Reset node to theme defaults');
    },
    [doc.nodes, handleUpdateNode]
  );

  const handleSaveDocument = useCallback(() => {
    const currentDoc = reactFlowToCanonical(nodes, edges, doc);
    onSaveDocument(currentDoc);
    setStatusMessage('Saved to local storage');
  }, [nodes, edges, doc, onSaveDocument]);

  const handleExportJSON = useCallback(() => {
    const currentDoc = reactFlowToCanonical(nodes, edges, doc);
    const json = exportToJSON(currentDoc);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.toLowerCase().replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Exported lossless JSON');
  }, [nodes, edges, doc]);

  const handleExportSVG = useCallback(() => {
    const currentDoc = reactFlowToCanonical(nodes, edges, doc);
    const svg = exportToSVG(currentDoc);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.toLowerCase().replace(/\s+/g, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Exported vector SVG');
  }, [nodes, edges, doc]);

  // Export native .mflow container
  const handleExportMflow = useCallback(() => {
    const currentDoc = reactFlowToCanonical(nodes, edges, doc);
    const bytes = packageDocumentToMflow(currentDoc, assetStoreRef.current.toBytesMap());
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.gedankenfaden.mflow' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.toLowerCase().replace(/\s+/g, '_')}.mflow`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage('Exported .mflow container');
  }, [nodes, edges, doc]);

  // Import JSON or .mflow container
  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const isMflow = file.name.endsWith('.mflow');

      if (isMflow) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const arrayBuffer = event.target?.result as ArrayBuffer;
            const bytes = new Uint8Array(arrayBuffer);
            const container = parseMflowFromBytes(bytes);
            setDoc(container.document);
            assetStoreRef.current = AssetStore.fromBytesMap(container.assets);
            const projected = canonicalToReactFlow(container.document);
            setNodes(projected.nodes);
            setEdges(projected.edges);
            historyRef.current = new HistoryManager(container.document);
            updateHistoryStatus();
            setStatusMessage(`Loaded container: ${container.document.title}`);
          } catch (err) {
            setStatusMessage('Failed to parse .mflow container');
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const content = event.target?.result as string;
            const parsed = JSON.parse(content) as CanonicalDocument;
            if (!parsed.schemaVersion || !parsed.nodes) {
              throw new Error('Invalid document schema');
            }
            setDoc(parsed);
            const projected = canonicalToReactFlow(parsed);
            setNodes(projected.nodes);
            setEdges(projected.edges);
            historyRef.current = new HistoryManager(parsed);
            updateHistoryStatus();
            setStatusMessage(`Loaded: ${parsed.title}`);
          } catch (err) {
            setStatusMessage('Failed to load JSON document');
          }
        };
        reader.readAsText(file);
      }
    },
    [updateHistoryStatus]
  );

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable;

      // Toggle Left Outline: Ctrl+\
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        setIsOutlineOpen((prev) => !prev);
        return;
      }

      // Toggle Right Inspector: Ctrl+/
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        setIsInspectorOpen((prev) => !prev);
        return;
      }

      // Undo: Ctrl+Z
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (!isInput) {
          e.preventDefault();
          handleUndo();
        }
        return;
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if (
        (e.ctrlKey && e.key.toLowerCase() === 'y') ||
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        if (!isInput) {
          e.preventDefault();
          handleRedo();
        }
        return;
      }

      // Delete selected: Delete or Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInput) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleDeleteSelected]);

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="h-14 px-4 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between z-20 shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToLibrary}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft size={14} />
            Library
          </button>

          {/* Toggle Outline Panel Button */}
          <button
            onClick={() => setIsOutlineOpen((prev) => !prev)}
            title="Toggle Outline (Ctrl+\)"
            className={`p-1.5 rounded-lg border transition-colors ${
              isOutlineOpen
                ? 'bg-blue-50 border-blue-200 text-blue-600'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}
          >
            <PanelLeft size={16} />
          </button>

          <div className="h-4 w-px bg-slate-200" />

          <input
            type="text"
            value={doc.title}
            onChange={(e) => setDoc({ ...doc, title: e.target.value })}
            className="text-sm font-semibold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none px-1 py-0.5"
          />

          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              doc.mode === 'mindmap'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {doc.mode === 'mindmap' ? 'Mind Map Mode' : 'Flowchart Mode'}
          </span>
        </div>

        {/* Center/Right Action Tools */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-colors"
          >
            <Undo size={16} />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-colors"
          >
            <Redo size={16} />
          </button>

          <div className="h-4 w-px bg-slate-200" />

          <button
            onClick={handleAddNode}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-all shadow-xs"
          >
            <Plus size={14} />
            Add Node
          </button>

          <button
            onClick={handleDeleteSelected}
            title="Delete Selected (Del)"
            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
          >
            <Trash2 size={16} />
          </button>

          <button
            onClick={handleAutoLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors"
          >
            <Sparkles size={14} className="text-amber-500" />
            Auto Layout
          </button>

          <div className="h-4 w-px bg-slate-200" />

          <button
            onClick={handleSaveDocument}
            title="Save Document Locally"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-all shadow-xs"
          >
            <Save size={14} />
            Save
          </button>

          <label className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer">
            <Upload size={14} />
            Open
            <input
              type="file"
              accept=".mflow,.json"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>

          <button
            onClick={handleExportMflow}
            title="Export native container (.mflow)"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-medium rounded-lg transition-colors"
          >
            <Download size={14} />
            .mflow
          </button>

          <button
            onClick={handleExportJSON}
            title="Export JSON"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors"
          >
            <Download size={14} />
            JSON
          </button>

          <button
            onClick={handleExportSVG}
            title="Export Vector SVG"
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors"
          >
            <Download size={14} />
            SVG
          </button>

          <div className="h-4 w-px bg-slate-200" />

          {/* Toggle Inspector Panel Button */}
          <button
            onClick={() => setIsInspectorOpen((prev) => !prev)}
            title="Toggle Inspector (Ctrl+/)"
            className={`p-1.5 rounded-lg border transition-colors ${
              isInspectorOpen
                ? 'bg-blue-50 border-blue-200 text-blue-600'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}
          >
            <PanelRight size={16} />
          </button>
        </div>
      </div>

      {/* 3-Pane Workspace Shell Body */}
      <div className="flex-1 w-full flex overflow-hidden relative">
        {/* Left Pane: Outline Panel */}
        {isOutlineOpen && (
          <OutlinePanel
            document={doc}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectAndFocusNode}
            onClose={() => setIsOutlineOpen(false)}
          />
        )}

        {/* Center Pane: React Flow Viewport */}
        <main aria-label="Interactive Canvas Viewport" className="flex-1 h-full relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onInit={(instance) => {
              rfInstanceRef.current = instance;
            }}
            fitView
            minZoom={0.2}
            maxZoom={3}
          >
            <Background
              color={doc.theme?.edgeColor || '#cbd5e1'}
              gap={20}
              size={1}
              style={{ backgroundColor: doc.theme?.canvasBackground || '#ffffff' }}
            />
            <Controls position="bottom-left" />
            <MiniMap
              position="bottom-right"
              nodeStrokeColor="#94a3b8"
              nodeColor="#e2e8f0"
              maskColor="rgba(241, 245, 249, 0.7)"
              style={{ borderRadius: 8, overflow: 'hidden' }}
            />

            <Panel position="bottom-center" className="mb-4">
              <div className="px-3 py-1.5 bg-slate-900/80 backdrop-blur-md text-white rounded-full text-xs font-medium shadow-lg flex items-center gap-2">
                <FolderSync size={12} className="text-blue-400" />
                <span>Status: {statusMessage}</span>
              </div>
            </Panel>
          </ReactFlow>
        </main>

        {/* Right Pane: Inspector Panel */}
        {isInspectorOpen && (
          <InspectorPanel
            document={doc}
            selectedNode={selectedCanonicalNode}
            onUpdateTheme={handleUpdateTheme}
            onUpdateNode={handleUpdateNode}
            onResetNodeStyle={handleResetNodeStyle}
            onClose={() => setIsInspectorOpen(false)}
          />
        )}
      </div>
    </div>
  );
};

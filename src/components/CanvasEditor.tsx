import React, { useState, useCallback, useRef } from 'react';
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

import { CanonicalDocument } from '../model/types';
import { canonicalToReactFlow, reactFlowToCanonical, CustomNodeData } from '../model/adapter';
import { autoLayoutDocument } from '../model/layout';
import { HistoryManager } from '../model/history';
import { exportToJSON, exportToSVG } from '../export/exporter';
import { CustomNode } from './CustomNode';
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
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('Ready');

  const { nodes: initialNodes, edges: initialEdges } = canonicalToReactFlow(initialDocument);
  const [nodes, setNodes] = useState<Node<CustomNodeData>[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const rfInstanceRef = useRef<ReactFlowInstance<Node<CustomNodeData>, Edge> | null>(null);

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
        // Only push to history on meaningful user drag/dimension commit
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
      setEdges((eds) => {
        const next = addEdge(
          {
            ...params,
            type: doc.mode === 'mindmap' ? 'smoothstep' : 'bezier',
            style: { stroke: '#94a3b8', strokeWidth: 2 },
          },
          eds
        );
        syncToCanonical(nodes, next, true);
        return next;
      });
      setStatusMessage('Connected edge');
    },
    [doc.mode, nodes, syncToCanonical]
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
        isNewBorn: true, // Triggers Signature Motion (Node Birth)
      },
      style: { width: 140, height: 44 },
    };

    let nextEdges = [...edges];
    if (selectedNode) {
      const newEdge: Edge = {
        id: `edge_${selectedNode.id}_${newId}`,
        source: selectedNode.id,
        target: newId,
        type: doc.mode === 'mindmap' ? 'smoothstep' : 'bezier',
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      };
      nextEdges.push(newEdge);
    }

    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    setEdges(nextEdges);
    syncToCanonical(nextNodes, nextEdges, true);
    setStatusMessage('Added node (Birth Motion triggered)');

    // Reset isNewBorn after animation completes
    setTimeout(() => {
      setNodes((currentNodes) =>
        currentNodes.map((n) =>
          n.id === newId ? { ...n, data: { ...n.data, isNewBorn: false } } : n
        )
      );
    }, 400);
  }, [nodes, edges, doc.mode, syncToCanonical]);

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

  const handleImportJSON = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

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
    },
    [updateHistoryStatus]
  );

  return (
    <div className="w-full h-full flex flex-col relative">
      {/* Top Navigation / Controls Bar */}
      <div className="h-14 px-6 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between z-20 shadow-xs">
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToLibrary}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <ArrowLeft size={14} />
            Library
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

        {/* Action Tools */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo"
            className="p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-colors"
          >
            <Undo size={16} />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo"
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
            Add Node (Birth Motion)
          </button>

          <button
            onClick={handleDeleteSelected}
            title="Delete Selected"
            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
          >
            <Trash2 size={16} />
          </button>

          <button
            onClick={handleAutoLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors"
          >
            <Sparkles size={14} className="text-amber-500" />
            Auto Layout (Dagre)
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

          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors cursor-pointer">
            <Upload size={14} />
            Reopen
            <input
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              className="hidden"
            />
          </label>

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
        </div>
      </div>

      {/* React Flow Viewport */}
      <div className="flex-1 w-full h-full">
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
          <Background color="#cbd5e1" gap={20} size={1} />
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
      </div>
    </div>
  );
};

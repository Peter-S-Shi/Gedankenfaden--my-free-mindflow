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

import { CanonicalDocument, CanonicalNode, CanonicalEdge, DocumentTheme } from '../model/types';
import { canonicalToReactFlow, reactFlowToCanonical, CustomNodeData } from '../model/adapter';
import { autoLayoutDocument, LayoutOptions } from '../model/layout';
import { HistoryManager } from '../model/history';
import {
  exportToJSON,
  exportToSVG,
  exportToPNG,
  exportToJPEG,
  exportToPDF,
  exportToMarkdown,
  exportToHTML,
  exportToMermaid,
  exportToOPML,
  exportToLegacyMindMapXML,
  exportToJSONCanvas,
} from '../export/exporter';
import { importFromMarkdown, importFromOPML } from '../model/importers';
import { packageDocumentToMflow, parseMflowFromBytes } from '../model/container';
import { AssetStore } from '../model/assets';
import { resetNodeToTheme, BUILTIN_THEMES } from '../model/theme';
import { parseMultilineToTree } from '../model/pasteParser';
import { createGroup, computeGroupBounds } from '../model/groups';
import { dispatchCanvasKeyDown } from '../interaction/keyboardDispatcher';
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
  GitFork,
  Layers,
  CornerDownRight,
  ChevronDown,
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
  const [layoutPreset, setLayoutPreset] = useState<LayoutOptions['preset']>('balanced');

  // Internal clipboard for branch copy/cut/paste
  const clipboardSubtreeRef = useRef<{
    nodes: CanonicalNode[];
    edges: CanonicalEdge[];
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Clean lifecycle unmount: cancel animations and release instances
  useEffect(() => {
    return () => {
      if (containerRef.current) {
        try {
          const anims = containerRef.current.getAnimations({ subtree: true });
          for (const anim of anims) {
            anim.cancel();
          }
        } catch {
          // Ignored in headless/test environments
        }
      }
      rfInstanceRef.current = null;
      clipboardSubtreeRef.current = null;
    };
  }, []);

  // 3-Pane workspace shell visibility
  const [isOutlineOpen, setIsOutlineOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Focus node helper
  const focusNodeOnCanvas = useCallback(
    (nodeId: string, customNodes?: Node<CustomNodeData>[]) => {
      const targetList = customNodes || [];
      const target = targetList.find((n) => n.id === nodeId);
      if (target && rfInstanceRef.current) {
        rfInstanceRef.current.setCenter(
          target.position.x + (typeof target.style?.width === 'number' ? target.style.width / 2 : 75),
          target.position.y + (typeof target.style?.height === 'number' ? target.style.height / 2 : 22),
          { zoom: 1.1, duration: 300 }
        );
      }
    },
    []
  );

  // Fold / Unfold branch callback
  const handleToggleFold = useCallback(
    (nodeId: string) => {
      setDoc((prevDoc) => {
        const nextNodes = prevDoc.nodes.map((n) =>
          n.id === nodeId ? { ...n, collapsed: !n.collapsed } : n
        );
        const updatedDoc: CanonicalDocument = {
          ...prevDoc,
          nodes: nextNodes,
          updatedAt: new Date().toISOString(),
        };
        const layouted = autoLayoutDocument(updatedDoc, { preset: layoutPreset });
        const projected = canonicalToReactFlow(layouted, { onToggleFold: handleToggleFold });
        setNodes(projected.nodes);
        setEdges(projected.edges);
        historyRef.current.pushState(layouted);
        updateHistoryStatus();
        return layouted;
      });
      setStatusMessage('Toggled branch fold');
    },
    [layoutPreset]
  );

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => canonicalToReactFlow(initialDocument, { onToggleFold: handleToggleFold }),
    [initialDocument, handleToggleFold]
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
      const edgeType = doc.mode === 'flowchart' ? theme.defaultEdgeRouting || 'smoothstep' : 'smoothstep';

      setEdges((eds) => {
        const next = addEdge(
          {
            ...params,
            type: edgeType === 'orthogonal' ? 'smoothstep' : edgeType,
            style: { stroke: theme.edgeColor || '#94a3b8', strokeWidth: 2 },
            markerEnd:
              doc.mode === 'flowchart'
                ? {
                    type: 'arrowclosed' as const,
                    color: theme.edgeColor || '#94a3b8',
                    width: 16,
                    height: 16,
                  }
                : undefined,
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
      focusNodeOnCanvas(nodeId, nodes);
    },
    [nodes, focusNodeOnCanvas]
  );

  // Apply auto-layout with preset
  const handleAutoLayoutWithPreset = useCallback(
    (preset: LayoutOptions['preset']) => {
      setLayoutPreset(preset);
      const currentDoc = reactFlowToCanonical(nodes, edges, doc);
      const layoutedDoc = autoLayoutDocument(currentDoc, { preset });
      const projected = canonicalToReactFlow(layoutedDoc, { onToggleFold: handleToggleFold });

      setNodes(projected.nodes);
      setEdges(projected.edges);
      setDoc(layoutedDoc);
      historyRef.current.pushState(layoutedDoc);
      updateHistoryStatus();
      setStatusMessage(`Layout: ${preset || 'Balanced'}`);
    },
    [nodes, edges, doc, updateHistoryStatus, handleToggleFold]
  );

  // Keyboard Contract: Add Sibling Node (Enter / Shift+Enter for Mind Map)
  const handleAddSiblingNode = useCallback(
    (direction: 'below' | 'above' = 'below') => {
      const selected = doc.nodes.find((n) => n.id === selectedNodeId);
      if (!selected) return;

      const isRoot = selected.type === 'root' || !selected.parentId;
      const parentId = isRoot ? selected.id : selected.parentId;
      const newId = `node_${Date.now()}`;

      const newNode: CanonicalNode = {
        id: newId,
        text: 'New Topic',
        geometry: { x: selected.geometry.x + 100, y: selected.geometry.y + 40, width: 140, height: 44 },
        type: 'default',
        parentId,
      };

      const newEdge: CanonicalEdge = {
        id: `edge_${parentId}_${newId}`,
        source: parentId!,
        target: newId,
        type: 'smoothstep',
      };

      let nextNodes = [...doc.nodes];
      if (isRoot) {
        nextNodes.push(newNode);
      } else {
        const index = nextNodes.findIndex((n) => n.id === selected.id);
        const insertIndex = direction === 'below' ? index + 1 : index;
        nextNodes.splice(insertIndex, 0, newNode);
      }

      const nextDoc: CanonicalDocument = {
        ...doc,
        nodes: nextNodes,
        edges: [...doc.edges, newEdge],
        updatedAt: new Date().toISOString(),
      };

      const layouted = autoLayoutDocument(nextDoc, { preset: layoutPreset });
      const projected = canonicalToReactFlow(layouted, { onToggleFold: handleToggleFold });

      const updatedRfNodes = projected.nodes.map((n) => ({
        ...n,
        selected: n.id === newId,
      }));

      setDoc(layouted);
      setNodes(updatedRfNodes);
      setEdges(projected.edges);
      historyRef.current.pushState(layouted);
      updateHistoryStatus();
      focusNodeOnCanvas(newId, updatedRfNodes);
      setStatusMessage(`Created sibling (${direction})`);
    },
    [doc, selectedNodeId, layoutPreset, updateHistoryStatus, focusNodeOnCanvas, handleToggleFold]
  );

  // Keyboard Contract: Add Child Node (Tab for Mind Map)
  const handleAddChildNode = useCallback(() => {
    const selected = doc.nodes.find((n) => n.id === selectedNodeId);
    if (!selected) return;

    const newId = `node_${Date.now()}`;
    const newNode: CanonicalNode = {
      id: newId,
      text: 'Sub Topic',
      geometry: { x: selected.geometry.x + 180, y: selected.geometry.y, width: 140, height: 44 },
      type: 'default',
      parentId: selected.id,
    };

    const newEdge: CanonicalEdge = {
      id: `edge_${selected.id}_${newId}`,
      source: selected.id,
      target: newId,
      type: 'smoothstep',
    };

    // Unfold parent if it was collapsed
    const nextNodes = doc.nodes.map((n) =>
      n.id === selected.id ? { ...n, collapsed: false } : n
    );
    nextNodes.push(newNode);

    const nextDoc: CanonicalDocument = {
      ...doc,
      nodes: nextNodes,
      edges: [...doc.edges, newEdge],
      updatedAt: new Date().toISOString(),
    };

    const layouted = autoLayoutDocument(nextDoc, { preset: layoutPreset });
    const projected = canonicalToReactFlow(layouted, { onToggleFold: handleToggleFold });

    const updatedRfNodes = projected.nodes.map((n) => ({
      ...n,
      selected: n.id === newId,
    }));

    setDoc(layouted);
    setNodes(updatedRfNodes);
    setEdges(projected.edges);
    historyRef.current.pushState(layouted);
    updateHistoryStatus();
    focusNodeOnCanvas(newId, updatedRfNodes);
    setStatusMessage('Created child node (Tab)');
  }, [doc, selectedNodeId, layoutPreset, updateHistoryStatus, focusNodeOnCanvas, handleToggleFold]);

  // Flowchart Keyboard Action: Add Downstream Connected Step (Enter)
  const handleAddFlowchartStep = useCallback(
    (direction: 'downstream' | 'upstream' = 'downstream') => {
      const selected = doc.nodes.find((n) => n.id === selectedNodeId);
      if (!selected) return;

      const newId = `fc_step_${Date.now()}`;
      const dx = 0;
      const dy = direction === 'downstream' ? 120 : -120;

      const newNode: CanonicalNode = {
        id: newId,
        text: 'Next Step',
        geometry: {
          x: selected.geometry.x + dx,
          y: selected.geometry.y + dy,
          width: 140,
          height: 44,
        },
        type: 'process',
        shape: 'rounded',
      };

      const newEdge: CanonicalEdge = {
        id: `edge_${Date.now()}`,
        source: direction === 'downstream' ? selected.id : newId,
        target: direction === 'downstream' ? newId : selected.id,
        type: 'smoothstep',
      };

      const nextDoc: CanonicalDocument = {
        ...doc,
        nodes: [...doc.nodes, newNode],
        edges: [...doc.edges, newEdge],
        updatedAt: new Date().toISOString(),
      };

      const projected = canonicalToReactFlow(nextDoc, { onToggleFold: handleToggleFold });
      const updatedRfNodes = projected.nodes.map((n) => ({
        ...n,
        selected: n.id === newId,
      }));

      setDoc(nextDoc);
      setNodes(updatedRfNodes);
      setEdges(projected.edges);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
      focusNodeOnCanvas(newId, updatedRfNodes);
      setStatusMessage(`Added connected step (${direction})`);
    },
    [doc, selectedNodeId, updateHistoryStatus, focusNodeOnCanvas, handleToggleFold]
  );

  // Flowchart Keyboard Action: Add Decision Branch (Tab)
  const handleAddFlowchartBranch = useCallback(() => {
    const selected = doc.nodes.find((n) => n.id === selectedNodeId);
    if (!selected) return;

    const newId = `fc_branch_${Date.now()}`;
    const newNode: CanonicalNode = {
      id: newId,
      text: 'Branch Step',
      geometry: {
        x: selected.geometry.x + 200,
        y: selected.geometry.y + 30,
        width: 140,
        height: 44,
      },
      type: 'process',
      shape: 'rounded',
    };

    const newEdge: CanonicalEdge = {
      id: `edge_branch_${Date.now()}`,
      source: selected.id,
      target: newId,
      label: 'Yes',
      type: 'smoothstep',
    };

    const nextDoc: CanonicalDocument = {
      ...doc,
      nodes: [...doc.nodes, newNode],
      edges: [...doc.edges, newEdge],
      updatedAt: new Date().toISOString(),
    };

    const projected = canonicalToReactFlow(nextDoc, { onToggleFold: handleToggleFold });
    const updatedRfNodes = projected.nodes.map((n) => ({
      ...n,
      selected: n.id === newId,
    }));

    setDoc(nextDoc);
    setNodes(updatedRfNodes);
    setEdges(projected.edges);
    historyRef.current.pushState(nextDoc);
    updateHistoryStatus();
    focusNodeOnCanvas(newId, updatedRfNodes);
    setStatusMessage('Added decision branch (Tab)');
  }, [doc, selectedNodeId, updateHistoryStatus, focusNodeOnCanvas, handleToggleFold]);

  // Group Container Management
  const handleCreateGroup = useCallback(
    (title: string, nodeIds: string[]) => {
      const newGroup = createGroup(title, nodeIds, doc.nodes);
      const nextDoc: CanonicalDocument = {
        ...doc,
        groups: [...(doc.groups || []), newGroup],
        updatedAt: new Date().toISOString(),
      };
      setDoc(nextDoc);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
      setStatusMessage(`Created group container: ${title}`);
    },
    [doc, updateHistoryStatus]
  );

  // Delete Selected (Subtree for Mind Map, Node/Edges for Flowchart)
  const handleDeleteSelectedSubtree = useCallback(() => {
    if (!selectedNodeId) return;

    const targetNode = doc.nodes.find((n) => n.id === selectedNodeId);
    if (!targetNode) return;

    // Do not delete central root in mindmap if it's the only one
    if (doc.mode === 'mindmap' && targetNode.type === 'root' && doc.nodes.filter((n) => n.type === 'root').length <= 1) {
      const nextDoc: CanonicalDocument = {
        ...doc,
        nodes: [targetNode],
        edges: [],
        updatedAt: new Date().toISOString(),
      };
      setDoc(nextDoc);
      const projected = canonicalToReactFlow(nextDoc, { onToggleFold: handleToggleFold });
      setNodes(projected.nodes);
      setEdges(projected.edges);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
      setStatusMessage('Cleared branches from root');
      return;
    }

    // Collect target node and all recursive descendants
    const deletedIds = new Set<string>([selectedNodeId]);
    if (doc.mode === 'mindmap') {
      const childrenMap = new Map<string, string[]>();
      for (const n of doc.nodes) {
        if (n.parentId) {
          const list = childrenMap.get(n.parentId) || [];
          list.push(n.id);
          childrenMap.set(n.parentId, list);
        }
      }

      const collectDescendants = (pId: string) => {
        const ch = childrenMap.get(pId) || [];
        for (const c of ch) {
          deletedIds.add(c);
          collectDescendants(c);
        }
      };
      collectDescendants(selectedNodeId);
    }

    const nextNodes = doc.nodes.filter((n) => !deletedIds.has(n.id));
    const nextEdges = doc.edges.filter(
      (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)
    );

    const parentToSelect = targetNode.parentId || (nextNodes[0] ? nextNodes[0].id : null);

    const nextDoc: CanonicalDocument = {
      ...doc,
      nodes: nextNodes,
      edges: nextEdges,
      updatedAt: new Date().toISOString(),
    };

    const layouted = doc.mode === 'mindmap' ? autoLayoutDocument(nextDoc, { preset: layoutPreset }) : nextDoc;
    const projected = canonicalToReactFlow(layouted, { onToggleFold: handleToggleFold });

    const updatedRfNodes = projected.nodes.map((n) => ({
      ...n,
      selected: n.id === parentToSelect,
    }));

    setDoc(layouted);
    setNodes(updatedRfNodes);
    setEdges(projected.edges);
    historyRef.current.pushState(layouted);
    updateHistoryStatus();
    setStatusMessage(`Deleted (${deletedIds.size} node${deletedIds.size > 1 ? 's' : ''})`);
  }, [doc, selectedNodeId, layoutPreset, updateHistoryStatus, handleToggleFold]);

  // Spatial / Hierarchical Arrow Navigation
  const handleArrowNavigation = useCallback(
    (arrowKey: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => {
      if (doc.nodes.length === 0) return;

      const currentNode = doc.nodes.find((n) => n.id === selectedNodeId) || doc.nodes[0];
      let targetId: string | null = null;

      if (doc.mode === 'flowchart') {
        // Flowchart graph-connectivity navigation
        const outgoing = doc.edges.filter((e) => e.source === currentNode.id);
        const incoming = doc.edges.filter((e) => e.target === currentNode.id);

        if (arrowKey === 'ArrowDown' && outgoing.length > 0) {
          targetId = outgoing[0].target;
        } else if (arrowKey === 'ArrowRight' && outgoing.length > 1) {
          targetId = outgoing[1].target;
        } else if (arrowKey === 'ArrowUp' && incoming.length > 0) {
          targetId = incoming[0].source;
        } else if (arrowKey === 'ArrowLeft' && incoming.length > 1) {
          targetId = incoming[1].source;
        }
      } else {
        // Mind Map hierarchy navigation
        const rootNode = doc.nodes.find((n) => n.type === 'root') || doc.nodes[0];
        const childrenMap = new Map<string, CanonicalNode[]>();
        for (const n of doc.nodes) {
          if (n.parentId) {
            const list = childrenMap.get(n.parentId) || [];
            list.push(n);
            childrenMap.set(n.parentId, list);
          }
        }

        const isRoot = currentNode.id === rootNode.id;
        const isRightWing = currentNode.geometry.x >= rootNode.geometry.x;

        if (arrowKey === 'ArrowUp' || arrowKey === 'ArrowDown') {
          if (currentNode.parentId) {
            const siblings = childrenMap.get(currentNode.parentId) || [];
            const idx = siblings.findIndex((s) => s.id === currentNode.id);
            if (arrowKey === 'ArrowUp' && idx > 0) {
              targetId = siblings[idx - 1].id;
            } else if (arrowKey === 'ArrowDown' && idx < siblings.length - 1) {
              targetId = siblings[idx + 1].id;
            }
          }
        } else if (arrowKey === 'ArrowRight') {
          if (isRoot) {
            const children = childrenMap.get(rootNode.id) || [];
            const rightChild = children.find((c) => c.geometry.x >= rootNode.geometry.x) || children[0];
            targetId = rightChild ? rightChild.id : null;
          } else if (isRightWing) {
            const children = childrenMap.get(currentNode.id) || [];
            if (children.length > 0) targetId = children[0].id;
          } else {
            targetId = currentNode.parentId || rootNode.id;
          }
        } else if (arrowKey === 'ArrowLeft') {
          if (isRoot) {
            const children = childrenMap.get(rootNode.id) || [];
            const leftChild = children.find((c) => c.geometry.x < rootNode.geometry.x) || children[children.length - 1];
            targetId = leftChild ? leftChild.id : null;
          } else if (!isRightWing) {
            const children = childrenMap.get(currentNode.id) || [];
            if (children.length > 0) targetId = children[0].id;
          } else {
            targetId = currentNode.parentId || rootNode.id;
          }
        }
      }

      if (targetId && targetId !== currentNode.id) {
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            selected: n.id === targetId,
          }))
        );
        focusNodeOnCanvas(targetId, nodes);
      }
    },
    [doc.nodes, doc.edges, doc.mode, selectedNodeId, nodes, focusNodeOnCanvas]
  );

  // Copy branch subtree
  const handleCopyBranch = useCallback(() => {
    if (!selectedNodeId) return;

    const targetNode = doc.nodes.find((n) => n.id === selectedNodeId);
    if (!targetNode) return;

    const subtreeNodeIds = new Set<string>([selectedNodeId]);
    const childrenMap = new Map<string, string[]>();
    for (const n of doc.nodes) {
      if (n.parentId) {
        const list = childrenMap.get(n.parentId) || [];
        list.push(n.id);
        childrenMap.set(n.parentId, list);
      }
    }
    const collectDescendants = (pId: string) => {
      const ch = childrenMap.get(pId) || [];
      for (const c of ch) {
        subtreeNodeIds.add(c);
        collectDescendants(c);
      }
    };
    collectDescendants(selectedNodeId);

    const subtreeNodes = doc.nodes.filter((n) => subtreeNodeIds.has(n.id));
    const subtreeEdges = doc.edges.filter(
      (e) => subtreeNodeIds.has(e.source) && subtreeNodeIds.has(e.target)
    );

    clipboardSubtreeRef.current = { nodes: subtreeNodes, edges: subtreeEdges };
    setStatusMessage(`Copied branch (${subtreeNodes.length} node${subtreeNodes.length > 1 ? 's' : ''})`);
  }, [doc, selectedNodeId]);

  // Cut branch subtree
  const handleCutBranch = useCallback(() => {
    handleCopyBranch();
    handleDeleteSelectedSubtree();
    setStatusMessage('Cut branch to clipboard');
  }, [handleCopyBranch, handleDeleteSelectedSubtree]);

  // Paste branch or multiline text
  const handlePaste = useCallback(async () => {
    if (!selectedNodeId) return;

    const targetNode = doc.nodes.find((n) => n.id === selectedNodeId);
    if (!targetNode) return;

    let clipboardText = '';
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        clipboardText = await navigator.clipboard.readText();
      }
    } catch {
      // Browser clipboard read permission
    }

    // Check if clipboard text has multiple lines
    if (clipboardText && clipboardText.trim().includes('\n')) {
      const parsed = parseMultilineToTree(clipboardText, targetNode.id, targetNode.geometry);
      if (parsed.nodes.length > 0) {
        const nextDoc: CanonicalDocument = {
          ...doc,
          nodes: [...doc.nodes, ...parsed.nodes],
          edges: [...doc.edges, ...parsed.edges],
          updatedAt: new Date().toISOString(),
        };
        const layouted = autoLayoutDocument(nextDoc, { preset: layoutPreset });
        const projected = canonicalToReactFlow(layouted, { onToggleFold: handleToggleFold });

        setDoc(layouted);
        setNodes(projected.nodes);
        setEdges(projected.edges);
        historyRef.current.pushState(layouted);
        updateHistoryStatus();
        setStatusMessage(`Pasted multiline structure (${parsed.nodes.length} nodes)`);
        return;
      }
    }

    // Otherwise paste from internal branch clipboard
    if (clipboardSubtreeRef.current) {
      const { nodes: subNodes, edges: subEdges } = clipboardSubtreeRef.current;
      const idMap = new Map<string, string>();
      const now = Date.now();

      subNodes.forEach((n, idx) => {
        idMap.set(n.id, `node_paste_${now}_${idx}`);
      });

      const rootOfSubtree = subNodes[0];
      const clonedNodes: CanonicalNode[] = subNodes.map((n) => ({
        ...n,
        id: idMap.get(n.id)!,
        parentId: n.id === rootOfSubtree.id ? targetNode.id : idMap.get(n.parentId || '') || targetNode.id,
      }));

      const clonedEdges: CanonicalEdge[] = subEdges.map((e, idx) => ({
        ...e,
        id: `edge_paste_${now}_${idx}`,
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
      }));

      clonedEdges.push({
        id: `edge_connect_${now}`,
        source: targetNode.id,
        target: idMap.get(rootOfSubtree.id)!,
        type: 'smoothstep',
      });

      const nextDoc: CanonicalDocument = {
        ...doc,
        nodes: [...doc.nodes, ...clonedNodes],
        edges: [...doc.edges, ...clonedEdges],
        updatedAt: new Date().toISOString(),
      };

      const layouted = autoLayoutDocument(nextDoc, { preset: layoutPreset });
      const projected = canonicalToReactFlow(layouted, { onToggleFold: handleToggleFold });

      setDoc(layouted);
      setNodes(projected.nodes);
      setEdges(projected.edges);
      historyRef.current.pushState(layouted);
      updateHistoryStatus();
      setStatusMessage(`Pasted branch subtree (${clonedNodes.length} nodes)`);
    }
  }, [doc, selectedNodeId, layoutPreset, updateHistoryStatus, handleToggleFold]);

  const handleUndo = useCallback(() => {
    const prev = historyRef.current.undo();
    if (prev) {
      setDoc(prev);
      const projected = canonicalToReactFlow(prev, { onToggleFold: handleToggleFold });
      setNodes(projected.nodes);
      setEdges(projected.edges);
      updateHistoryStatus();
      setStatusMessage('Undo');
    }
  }, [updateHistoryStatus, handleToggleFold]);

  const handleRedo = useCallback(() => {
    const next = historyRef.current.redo();
    if (next) {
      setDoc(next);
      const projected = canonicalToReactFlow(next, { onToggleFold: handleToggleFold });
      setNodes(projected.nodes);
      setEdges(projected.edges);
      updateHistoryStatus();
      setStatusMessage('Redo');
    }
  }, [updateHistoryStatus, handleToggleFold]);

  // Update theme from Inspector
  const handleUpdateTheme = useCallback(
    (theme: DocumentTheme) => {
      const nextDoc: CanonicalDocument = {
        ...doc,
        theme,
        updatedAt: new Date().toISOString(),
      };
      setDoc(nextDoc);
      const projected = canonicalToReactFlow(nextDoc, { onToggleFold: handleToggleFold });
      setNodes(projected.nodes);
      setEdges(projected.edges);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
      setStatusMessage(`Theme applied: ${theme.name}`);
    },
    [doc, updateHistoryStatus, handleToggleFold]
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
      const projected = canonicalToReactFlow(nextDoc, { onToggleFold: handleToggleFold });
      setNodes(projected.nodes);
      setEdges(projected.edges);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
    },
    [doc, updateHistoryStatus, handleToggleFold]
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

  const handleExportFormat = useCallback(
    async (format: string) => {
      const currentDoc = reactFlowToCanonical(nodes, edges, doc);
      const baseName = doc.title.toLowerCase().replace(/\s+/g, '_') || 'gedankenfaden_doc';

      let blob: Blob;
      let filename: string;

      switch (format) {
        case 'mflow': {
          const bytes = packageDocumentToMflow(currentDoc, assetStoreRef.current.toBytesMap());
          blob = new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.gedankenfaden.mflow' });
          filename = `${baseName}.mflow`;
          break;
        }
        case 'json': {
          blob = new Blob([exportToJSON(currentDoc)], { type: 'application/json' });
          filename = `${baseName}.json`;
          break;
        }
        case 'svg': {
          blob = new Blob([exportToSVG(currentDoc)], { type: 'image/svg+xml' });
          filename = `${baseName}.svg`;
          break;
        }
        case 'png': {
          const bytes = await exportToPNG(currentDoc);
          blob = new Blob([bytes as unknown as BlobPart], { type: 'image/png' });
          filename = `${baseName}.png`;
          break;
        }
        case 'jpeg': {
          const bytes = await exportToJPEG(currentDoc);
          blob = new Blob([bytes as unknown as BlobPart], { type: 'image/jpeg' });
          filename = `${baseName}.jpeg`;
          break;
        }
        case 'pdf': {
          const bytes = await exportToPDF(currentDoc);
          blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
          filename = `${baseName}.pdf`;
          break;
        }
        case 'markdown': {
          blob = new Blob([exportToMarkdown(currentDoc)], { type: 'text/markdown' });
          filename = `${baseName}.md`;
          break;
        }
        case 'html': {
          blob = new Blob([exportToHTML(currentDoc)], { type: 'text/html' });
          filename = `${baseName}.html`;
          break;
        }
        case 'mermaid': {
          blob = new Blob([exportToMermaid(currentDoc)], { type: 'text/plain' });
          filename = `${baseName}.mmd`;
          break;
        }
        case 'opml': {
          blob = new Blob([exportToOPML(currentDoc)], { type: 'text/xml' });
          filename = `${baseName}.opml`;
          break;
        }
        case 'mm': {
          blob = new Blob([exportToLegacyMindMapXML(currentDoc)], { type: 'text/xml' });
          filename = `${baseName}.mm`;
          break;
        }
        case 'canvas': {
          blob = new Blob([exportToJSONCanvas(currentDoc)], { type: 'application/json' });
          filename = `${baseName}.canvas`;
          break;
        }
        default:
          return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setIsExportMenuOpen(false);
      setStatusMessage(`Exported ${format.toUpperCase()}`);
    },
    [nodes, edges, doc]
  );

  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const lower = file.name.toLowerCase();

      if (lower.endsWith('.mflow')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const arrayBuffer = event.target?.result as ArrayBuffer;
            const bytes = new Uint8Array(arrayBuffer);
            const container = parseMflowFromBytes(bytes);
            setDoc(container.document);
            assetStoreRef.current = AssetStore.fromBytesMap(container.assets);
            const projected = canonicalToReactFlow(container.document, { onToggleFold: handleToggleFold });
            setNodes(projected.nodes);
            setEdges(projected.edges);
            historyRef.current = new HistoryManager(container.document);
            updateHistoryStatus();
            setStatusMessage(`Loaded container: ${container.document.title}`);
          } catch {
            setStatusMessage('Failed to parse .mflow container');
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (lower.endsWith('.md')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const content = event.target?.result as string;
            const imported = importFromMarkdown(content, file.name.replace(/\.md$/i, ''));
            setDoc(imported);
            const projected = canonicalToReactFlow(imported, { onToggleFold: handleToggleFold });
            setNodes(projected.nodes);
            setEdges(projected.edges);
            historyRef.current = new HistoryManager(imported);
            updateHistoryStatus();
            setStatusMessage(`Imported Markdown: ${imported.title}`);
          } catch {
            setStatusMessage('Failed to import Markdown');
          }
        };
        reader.readAsText(file);
      } else if (lower.endsWith('.opml')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const content = event.target?.result as string;
            const imported = importFromOPML(content, file.name.replace(/\.opml$/i, ''));
            setDoc(imported);
            const projected = canonicalToReactFlow(imported, { onToggleFold: handleToggleFold });
            setNodes(projected.nodes);
            setEdges(projected.edges);
            historyRef.current = new HistoryManager(imported);
            updateHistoryStatus();
            setStatusMessage(`Imported OPML: ${imported.title}`);
          } catch {
            setStatusMessage('Failed to import OPML');
          }
        };
        reader.readAsText(file);
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
            const projected = canonicalToReactFlow(parsed, { onToggleFold: handleToggleFold });
            setNodes(projected.nodes);
            setEdges(projected.edges);
            historyRef.current = new HistoryManager(parsed);
            updateHistoryStatus();
            setStatusMessage(`Loaded: ${parsed.title}`);
          } catch {
            setStatusMessage('Failed to load JSON document');
          }
        };
        reader.readAsText(file);
      }
    },
    [updateHistoryStatus, handleToggleFold]
  );

  // Global Keyboard Shortcuts (Production-wired via dispatchCanvasKeyDown)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      dispatchCanvasKeyDown(e, doc.mode, {
        onSave: () => {
          onSaveDocument(doc);
          setStatusMessage('Document saved');
        },
        onSearch: () => setIsOutlineOpen(true),
        onToggleOutline: () => setIsOutlineOpen((prev) => !prev),
        onToggleInspector: () => setIsInspectorOpen((prev) => !prev),
        onUndo: handleUndo,
        onRedo: handleRedo,
        onCopy: handleCopyBranch,
        onCut: handleCutBranch,
        onPaste: handlePaste,
        onEditSelectedNode: () => {
          const selectedEl = document.querySelector('.react-flow__node.selected');
          if (selectedEl) {
            selectedEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
          }
        },
        onAddSiblingBelow: () => handleAddSiblingNode('below'),
        onAddSiblingAbove: () => handleAddSiblingNode('above'),
        onAddChild: handleAddChildNode,
        onAddFlowchartDownstream: () => handleAddFlowchartStep('downstream'),
        onAddFlowchartUpstream: () => handleAddFlowchartStep('upstream'),
        onAddFlowchartBranch: handleAddFlowchartBranch,
        onDeleteSelected: handleDeleteSelectedSubtree,
        onArrowNavigation: handleArrowNavigation,
        onDeselect: () => setNodes((nds) => nds.map((n) => ({ ...n, selected: false }))),
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    doc,
    onSaveDocument,
    handleUndo,
    handleRedo,
    handleCopyBranch,
    handleCutBranch,
    handlePaste,
    handleAddSiblingNode,
    handleAddChildNode,
    handleAddFlowchartStep,
    handleAddFlowchartBranch,
    handleDeleteSelectedSubtree,
    handleArrowNavigation,
  ]);

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col relative overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="h-14 px-4 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between z-20 shadow-xs shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToLibrary}
            data-testid="back-to-library-btn"
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

          {/* Flowchart vs Mind Map Quick Action Buttons */}
          {doc.mode === 'flowchart' ? (
            <>
              <button
                onClick={() => handleAddFlowchartStep('downstream')}
                title="Add Downstream Step (Enter)"
                className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-medium rounded-lg transition-colors"
              >
                <Plus size={14} />
                Next Step
              </button>

              <button
                onClick={handleAddFlowchartBranch}
                title="Add Branch (Tab)"
                className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-all shadow-xs"
              >
                <CornerDownRight size={14} />
                Branch
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleAddSiblingNode('below')}
                title="Add Sibling (Enter)"
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors"
              >
                <Plus size={14} />
                Sibling
              </button>

              <button
                onClick={handleAddChildNode}
                title="Add Child (Tab)"
                className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-all shadow-xs"
              >
                <GitFork size={14} />
                Child
              </button>
            </>
          )}

          <button
            onClick={handleDeleteSelectedSubtree}
            title="Delete Selected (Del)"
            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
          >
            <Trash2 size={16} />
          </button>

          <div className="h-4 w-px bg-slate-200" />

          {/* Layout Presets for Mind Map */}
          {doc.mode === 'mindmap' ? (
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
              {(['balanced', 'LR', 'RL', 'TB'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => handleAutoLayoutWithPreset(p)}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md capitalize transition-colors ${
                    layoutPreset === p
                      ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p === 'balanced' ? 'Balanced' : p}
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => handleAutoLayoutWithPreset('TB')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              <Sparkles size={14} className="text-amber-500" />
              Auto Layout (Dagre)
            </button>
          )}

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
            Import
            <input
              type="file"
              accept=".mflow,.json,.md,.opml"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>

          {/* Multi-Format Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-medium rounded-lg transition-colors"
            >
              <Download size={14} />
              Export
              <ChevronDown size={12} />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 text-xs">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Native Package
                </div>
                <button
                  onClick={() => handleExportFormat('mflow')}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                >
                  <span className="font-medium">.mflow Container</span>
                  <span className="text-[10px] text-slate-400">Single File</span>
                </button>

                <div className="my-1 border-t border-slate-100" />
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Visual & Document
                </div>
                <button
                  onClick={() => handleExportFormat('svg')}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                >
                  <span>Vector SVG (.svg)</span>
                </button>
                <button
                  onClick={() => handleExportFormat('png')}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                >
                  <span>Raster PNG (.png)</span>
                </button>
                <button
                  onClick={() => handleExportFormat('jpeg')}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                >
                  <span>Raster JPEG (.jpeg)</span>
                </button>
                <button
                  onClick={() => handleExportFormat('pdf')}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                >
                  <span>PDF Document (.pdf)</span>
                </button>
                <button
                  onClick={() => handleExportFormat('html')}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                >
                  <span>Interactive HTML (.html)</span>
                </button>

                <div className="my-1 border-t border-slate-100" />
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Outline & Interop
                </div>
                <button
                  onClick={() => handleExportFormat('markdown')}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                >
                  <span>Markdown Outline (.md)</span>
                </button>
                <button
                  onClick={() => handleExportFormat('mermaid')}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                >
                  <span>Mermaid Diagram (.mmd)</span>
                </button>
                <button
                  onClick={() => handleExportFormat('opml')}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                >
                  <span>OPML Outline (.opml)</span>
                </button>
                <button
                  onClick={() => handleExportFormat('mm')}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                >
                  <span>Legacy Mind-Map XML (.mm)</span>
                </button>
                <button
                  onClick={() => handleExportFormat('canvas')}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                >
                  <span>JSON Canvas (.canvas)</span>
                </button>
                <button
                  onClick={() => handleExportFormat('json')}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                >
                  <span>Canonical JSON (.json)</span>
                </button>
              </div>
            )}
          </div>

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
            minZoom={0.05}
            maxZoom={5}
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

            {/* Visual Group Containers Layer */}
            {doc.groups &&
              doc.groups.map((group) => {
                const bounds = computeGroupBounds(group, doc.nodes);
                return (
                  <div
                    key={group.id}
                    className="absolute pointer-events-none rounded-xl border-2 border-dashed transition-all"
                    style={{
                      transform: `translate(${bounds.x}px, ${bounds.y}px)`,
                      width: `${bounds.width}px`,
                      height: `${bounds.height}px`,
                      backgroundColor: group.style?.backgroundColor || 'rgba(241, 245, 249, 0.65)',
                      borderColor: group.style?.borderColor || '#cbd5e1',
                      zIndex: 0,
                    }}
                  >
                    <div className="px-2.5 py-1 bg-white/90 border-b border-slate-200/90 rounded-t-xl text-[11px] font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs">
                      <Layers size={12} className="text-blue-500" />
                      <span>{group.title}</span>
                    </div>
                  </div>
                );
              })}

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
            onCreateGroup={handleCreateGroup}
            onClose={() => setIsInspectorOpen(false)}
          />
        )}
      </div>
    </div>
  );
};

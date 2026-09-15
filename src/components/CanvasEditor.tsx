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
  ViewportPortal,
  BezierEdge,
  Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  CanonicalDocument,
  CanonicalNode,
  CanonicalEdge,
  DocumentTheme,
  NumberingStyle,
  MindMapAnnotation,
  RelationshipLineAnnotation,
} from '../model/types';
import {
  canonicalToReactFlow,
  reactFlowToCanonical,
  canonicalEdgeTypeToReactFlow,
  CustomNodeData,
} from '../model/adapter';
import { autoLayoutDocument, LayoutOptions } from '../model/layout';
import { HistoryManager } from '../model/history';
import { createExportArtifact, ExportFormat, saveExportWithNativeDialog } from '../export/saveExport';
import { importFromMarkdown, importFromOPML } from '../model/importers';
import { parseMflowFromBytes } from '../model/container';
import { AssetStore } from '../model/assets';
import { resetNodeToTheme, BUILTIN_THEMES } from '../model/theme';
import { PRESET_ICONS } from '../model/icons';
import { parseMultilineToTree } from '../model/pasteParser';
import { createGroup, resolveGroupBounds, translateGroup } from '../model/groups';
import {
  DeletionPlan,
  planCanvasDeletion,
  planDeleteNodePreservingChildren,
  deleteNodePreservingChildren,
} from '../model/deletion';
import {
  createBoundaryAnnotations,
  createBraceAnnotations,
  createRelationshipLineAnnotation,
  pruneOrphanAnnotations,
} from '../model/annotations';
import { getNativeBridge } from '../platform/tauriBridge';
import { dispatchCanvasKeyDown } from '../interaction/keyboardDispatcher';
import {
  computeSubmenuPlacement,
  CONTEXT_SUBMENU_SIZES,
  ContextSubmenuKey,
  SubmenuPlacement,
} from '../interaction/submenuPlacement';
import { CustomNode } from './CustomNode';
import { AnnotationLayer } from './AnnotationLayer';
import { OutlinePanel } from './OutlinePanel';
import { InspectorPanel } from './InspectorPanel';
import { ConfirmationDialog } from './ConfirmationDialog';
import { buildChildrenIdsByParent, carryDescendantsWithDraggedParents } from '../model/dragSubtree';
import { computeTextAwareNodeSize } from '../model/textMeasurement';
import { selectSameLevelInTopLevelBranch } from '../model/hierarchySelection';
import {
  toggleNodeFold,
  collapseAllTopLevelTopics,
  expandAllTopics,
  expandToLevel,
} from '../model/hierarchyVisibility';
import { canApplyNumbering } from '../model/numbering';
import { allowsManualConnections, filterEdgeChangesForMode } from '../model/connectionPolicy';
import {
  findReparentCapture,
  applyReparent,
  applyDetachedDrop,
  updateHierarchyEdgesForReparent,
  removeIncomingHierarchyEdge,
} from '../model/reparentOnDrag';
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
  Layers,
  ChevronDown,
  ChevronRight,
  Copy,
  Scissors,
  Clipboard,
  Image as ImageIcon,
  ListOrdered,
  Eye,
  CheckSquare,
  Crosshair,
  Paperclip,
  Bookmark,
} from 'lucide-react';

const nodeTypes = {
  customNode: CustomNode,
};

const edgeTypes = {
  bezier: BezierEdge,
};

export interface SaveResult {
  success: boolean;
  message?: string;
}

interface CanvasEditorProps {
  initialDocument: CanonicalDocument;
  onBackToLibrary: () => void;
  onSaveDocument: (doc: CanonicalDocument) => Promise<SaveResult>;
  onDocumentChange?: (doc: CanonicalDocument) => void;
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({
  initialDocument,
  onBackToLibrary,
  onSaveDocument,
  onDocumentChange,
}) => {
  const [doc, setDoc] = useState<CanonicalDocument>(initialDocument);

  useEffect(() => {
    onDocumentChange?.(doc);
  }, [doc, onDocumentChange]);

  const historyRef = useRef<HistoryManager>(new HistoryManager(initialDocument));
  const assetStoreRef = useRef<AssetStore>(new AssetStore());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('Ready');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [layoutPreset, setLayoutPreset] = useState<LayoutOptions['preset']>('balanced');

  const clipboardSubtreeRef = useRef<{
    nodes: CanonicalNode[];
    edges: CanonicalEdge[];
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const groupDragRef = useRef<{ groupId: string; startX: number; startY: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    return () => {
      if (containerRef.current) {
        try {
          const anims = containerRef.current.getAnimations({ subtree: true });
          for (const anim of anims) {
            anim.cancel();
          }
        } catch {
          // Ignored in test environment
        }
      }
      rfInstanceRef.current = null;
      clipboardSubtreeRef.current = null;
    };
  }, []);

  const [isOutlineOpen, setIsOutlineOpen] = useState(true);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<DeletionPlan | null>(null);

  // M3: Multi-selection & Focus Mode
  const [multiSelectedNodeIds, setMultiSelectedNodeIds] = useState<Set<string>>(new Set());
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const adaptiveEdges = true;
  const [currentZoom, setCurrentZoom] = useState(initialDocument.viewport?.zoom ?? 1);

  // M3 Behavior Correction Contract: dragging a Mind Map node is
  // reparenting, not freeform positioning -- see onNodeDrag/onNodeDragStop.
  // `reparentPreview` drives the live dashed preview + candidate highlight.
  const [reparentPreview, setReparentPreview] = useState<{
    draggedId: string;
    candidateParentId: string;
    side?: 'left' | 'right';
  } | null>(null);

  // M3: Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    // `null` = blank-canvas context menu (document-level structure
    // commands, M3 Behavior Correction Contract 3.6), not anchored to any
    // particular node.
    nodeId: string | null;
  } | null>(null);
  const [submenuPlacements, setSubmenuPlacements] = useState<
    Partial<Record<ContextSubmenuKey, SubmenuPlacement>>
  >({});

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

  const handleLiveResizeWidth = useCallback((nodeId: string, height: number) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, style: { ...n.style, height } } : n)));
  }, []);

  const handleToggleFold = useCallback(
    (nodeId: string) => {
      setDoc((prevDoc) => {
        // Progressive one-level reveal (M3 Behavior Correction Contract
        // 3.2/3.7): see `toggleNodeFold`'s doc comment.
        const nextNodes = toggleNodeFold(prevDoc.nodes, nodeId);
        const updatedDoc: CanonicalDocument = {
          ...prevDoc,
          nodes: nextNodes,
          updatedAt: new Date().toISOString(),
        };
        // Visibility-changing: intentionally NOT stabilized against prevDoc.
        // Collapse/expand must reclaim/re-pack the visible tree from scratch
        // (M3 Behavior Correction Contract 2.1) rather than pinning siblings
        // at their historical positions, which is what left stale gaps and
        // long edges behind (contract evidence 01/02/03).
        const layouted = autoLayoutDocument(updatedDoc, { preset: layoutPreset });
        const projected = canonicalToReactFlow(layouted, {
          onToggleFold: handleToggleFold,
          onLiveResizeWidth: handleLiveResizeWidth,
          onResizeEnd: handleResizeEndFromNode,
        });
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

  const handleUpdateNodeLabel = useCallback(
    (nodeId: string, label: string) => {
      setDoc((prevDoc) => {
        const targetNode = prevDoc.nodes.find((n) => n.id === nodeId);
        const fontSize = targetNode?.style?.fontSize || 14;
        const newSize = computeTextAwareNodeSize(label, {
          width: targetNode?.manualSize?.width,
          fontSize,
        });

        const nextNodes = prevDoc.nodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                text: label,
                geometry: {
                  ...n.geometry,
                  width: targetNode?.manualSize?.width ?? newSize.width,
                  height: newSize.height,
                },
              }
            : n
        );

        const updatedDoc: CanonicalDocument = {
          ...prevDoc,
          nodes: nextNodes,
          updatedAt: new Date().toISOString(),
        };

        const layouted = autoLayoutDocument(updatedDoc, { preset: layoutPreset, stabilizeAgainst: prevDoc });
        const projected = canonicalToReactFlow(layouted, {
          onToggleFold: handleToggleFold,
          selectedNodeId,
          onUpdateLabel: handleUpdateNodeLabel,
          onLiveResizeWidth: handleLiveResizeWidth,
          onResizeEnd: handleResizeEndFromNode,
        });

        setNodes(projected.nodes);
        setEdges(projected.edges);
        historyRef.current.pushState(layouted);
        updateHistoryStatus();
        return layouted;
      });
      setStatusMessage('Updated node text');
    },
    [layoutPreset]
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialDocument.nodes[0] ? initialDocument.nodes[0].id : null
  );
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [targetingLineSourceId, setTargetingLineSourceId] = useState<string | null>(null);
  const [targetingMousePos, setTargetingMousePos] = useState<{ x: number; y: number } | null>(null);

  const selectedCanonicalNode = useMemo(() => {
    return doc.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [doc.nodes, selectedNodeId]);

  const selectedAnnotation = useMemo(() => {
    if (!selectedAnnotationId) return null;
    return doc.annotations?.find((a) => a.id === selectedAnnotationId) || null;
  }, [doc.annotations, selectedAnnotationId]);

  const handleUpdateNodeRef = useRef<((nodeId: string, updates: Partial<CanonicalNode>) => void) | null>(null);

  const handleResizeEndRef = useRef<((nodeId: string, dimensions: { width: number; height: number }) => void) | null>(null);
  const handleResizeEndFromNode = useCallback((nodeId: string, dimensions: { width: number; height: number }) => {
    handleResizeEndRef.current?.(nodeId, dimensions);
  }, []);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () =>
      canonicalToReactFlow(initialDocument, {
        onToggleFold: handleToggleFold,
        selectedNodeId: null,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      }),
    [initialDocument, handleToggleFold, handleUpdateNodeLabel, handleLiveResizeWidth, handleResizeEndFromNode]
  );
  const [nodes, setNodes] = useState<Node<CustomNodeData>[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const rfInstanceRef = useRef<ReactFlowInstance<any, any> | null>(null);

  const updateHistoryStatus = useCallback(() => {
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
  }, []);

  const syncToCanonical = useCallback(
    (nextNodes: Node<CustomNodeData>[], nextEdges: Edge[], pushHistory = true) => {
      setDoc((prevDoc) => {
        const nextDoc = reactFlowToCanonical(nextNodes, nextEdges, prevDoc);
        if (pushHistory) {
          historyRef.current.pushState(nextDoc);
          updateHistoryStatus();
        }
        return nextDoc;
      });
    },
    [updateHistoryStatus]
  );

  const childrenIdsByParent = useMemo(() => buildChildrenIdsByParent(doc.nodes), [doc.nodes]);

  const handleResizeEnd = useCallback(
    (nodeId: string, dimensions: { width: number; height: number }) => {
      const preGestureDoc = doc;
      const isFlowchart = doc.mode === 'flowchart';

      const withManualSize: CanonicalDocument = {
        ...doc,
        nodes: doc.nodes.map((n) => {
          if (n.id !== nodeId) return n;
          const width = dimensions.width;
          const height = isFlowchart
            ? dimensions.height
            : computeTextAwareNodeSize(n.text || '', {
                width,
                fontSize: n.style?.fontSize,
              }).height;

          return {
            ...n,
            geometry: { ...n.geometry, width, height },
            manualSize: isFlowchart ? { width, height } : { width },
          };
        }),
      };

      const finalDoc = isFlowchart
        ? withManualSize
        : autoLayoutDocument(withManualSize, { preset: layoutPreset, stabilizeAgainst: preGestureDoc });

      const projected = canonicalToReactFlow(finalDoc, {
        onToggleFold: handleToggleFold,
        selectedNodeId,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      });

      setNodes(projected.nodes);
      setEdges(projected.edges);
      setDoc(finalDoc);
      historyRef.current.pushState(finalDoc);
      updateHistoryStatus();
      setStatusMessage(isFlowchart ? 'Resized node' : 'Resized topic width');
    },
    [doc, layoutPreset, selectedNodeId, handleToggleFold, handleUpdateNodeLabel, handleLiveResizeWidth, handleResizeEndFromNode, updateHistoryStatus]
  );

  useEffect(() => {
    handleResizeEndRef.current = handleResizeEnd;
  }, [handleResizeEnd]);

  const handleResetNodeSize = useCallback(() => {
    if (!selectedNodeId) return;
    const target = doc.nodes.find((n) => n.id === selectedNodeId);
    if (!target?.manualSize) return;

    const preResetDoc = doc;
    const clearedDoc: CanonicalDocument = {
      ...doc,
      nodes: doc.nodes.map((n) =>
        n.id === selectedNodeId
          ? { ...n, manualSize: undefined, geometry: { ...n.geometry, width: undefined, height: undefined } }
          : n
      ),
    };

    const isFlowchart = doc.mode === 'flowchart';
    const finalDoc = isFlowchart
      ? {
          ...clearedDoc,
          nodes: clearedDoc.nodes.map((n) =>
            n.id === selectedNodeId ? { ...n, geometry: { ...n.geometry, width: 160, height: 48 } } : n
          ),
        }
      : autoLayoutDocument(clearedDoc, { preset: layoutPreset, stabilizeAgainst: preResetDoc });

    const projected = canonicalToReactFlow(finalDoc, {
      onToggleFold: handleToggleFold,
      selectedNodeId,
      onUpdateLabel: handleUpdateNodeLabel,
      onLiveResizeWidth: handleLiveResizeWidth,
      onResizeEnd: handleResizeEndFromNode,
    });

    setNodes(projected.nodes);
    setEdges(projected.edges);
    setDoc(finalDoc);
    historyRef.current.pushState(finalDoc);
    updateHistoryStatus();
    setStatusMessage('Reset node size');
  }, [doc, selectedNodeId, layoutPreset, handleToggleFold, handleUpdateNodeLabel, handleLiveResizeWidth, updateHistoryStatus]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<CustomNodeData>>[]) => {
      const hasResizeDimensionChange = changes.some((c) => c.type === 'dimensions');
      const hasPositionChange = changes.some((c) => c.type === 'position');
      // M3 Behavior Correction Contract: a Mind Map node drag is never a
      // freeform canonical position write -- onNodeDragStop below is the
      // single place that commits the outcome (reparent or snap-back).
      // Position changes still flow through here so the dragged node (and
      // any carried descendants) visually track the cursor in local React
      // Flow state; canonical `doc` simply isn't touched until the gesture
      // ends. Flowchart keeps the original per-frame canonical sync.
      const skipCanonicalSync = doc.mode === 'mindmap' && hasPositionChange;

      setNodes((nds) => {
        const next = carryDescendantsWithDraggedParents(
          nds,
          applyNodeChanges(changes, nds),
          changes.filter((c) => c.type === 'position'),
          childrenIdsByParent
        );

        const isOnlySelectionChange = changes.length > 0 && changes.every((c) => c.type === 'select');
        if (hasResizeDimensionChange || skipCanonicalSync || isOnlySelectionChange) {
          return next;
        }

        const isDragEnd = changes.some((c) => c.type === 'position' && !c.dragging);
        if (isDragEnd) {
          syncToCanonical(next, edges, true);
        } else {
          syncToCanonical(next, edges, false);
        }
        return next;
      });

      const selectChanges = changes.filter((c) => c.type === 'select');
      if (selectChanges.length > 0) {
        const selected = selectChanges.find((c) => (c as any).selected);
        if (selected) {
          setSelectedNodeId(selected.id);
        } else {
          const hasAnySelected = selectChanges.some((c) => (c as any).selected);
          if (!hasAnySelected) {
            setSelectedNodeId((currentId) => {
              const deselected = selectChanges.find((c) => c.id === currentId && !(c as any).selected);
              return deselected ? null : currentId;
            });
          }
        }
      }
    },
    [edges, syncToCanonical, childrenIdsByParent, doc.mode]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      // M3 Behavior Correction Contract: Mind Map hierarchy edges are not
      // interaction objects -- per-edge `selectable`/`deletable` flags
      // (set in canonicalToReactFlow) already stop React Flow's own UI
      // from ever emitting a select/remove change for one; this filter is
      // defense in depth against any other path that might still dispatch
      // one. Flowchart passes every change through unchanged.
      const effectiveChanges = filterEdgeChangesForMode(changes, doc.mode);
      if (effectiveChanges.length === 0) return;
      setEdges((eds) => {
        const next = applyEdgeChanges(effectiveChanges, eds);
        syncToCanonical(nodes, next, true);
        return next;
      });
    },
    [nodes, syncToCanonical, doc.mode]
  );

  // M3 Behavior Correction Contract: dragging a Mind Map node is
  // reparenting, never freeform positioning that could stretch/bend a
  // hierarchy edge indefinitely. onNodeDrag tracks whether the live
  // position has entered another node's capture zone (for the dashed
  // preview + highlight); onNodeDragStop commits the reparent if one was
  // captured, or detaches the carried subtree as a free-standing hierarchy
  // at the shown drop position if no node captures it.
  const liveNodeBox = useCallback(
    (node: Node<CustomNodeData>) => ({
      x: node.position.x,
      y: node.position.y,
      width: typeof node.width === 'number' ? node.width : node.measured?.width ?? 150,
      height: typeof node.height === 'number' ? node.height : node.measured?.height ?? 44,
    }),
    []
  );

  const revealReparentOutcome = useCallback((nodeIds: string[]) => {
    // Structural relayout can move the new parent and carried subtree beyond
    // the currently visible canvas (most noticeably underneath an open
    // Inspector). Fit only the affected family after React Flow has received
    // the projected nodes so a successful drop can never look like deletion.
    requestAnimationFrame(() => {
      const instance = rfInstanceRef.current;
      if (!instance) return;
      const affectedNodes = instance.getNodes().filter((candidateNode) => nodeIds.includes(candidateNode.id));
      if (affectedNodes.length === 0) return;
      void instance.fitView({ nodes: affectedNodes, padding: 0.35, duration: 220, maxZoom: 1.15 });
    });
  }, []);

  const onNodeDrag = useCallback(
    (_event: unknown, node: Node<CustomNodeData>) => {
      // `doc` is untouched for the whole gesture (see onNodesChange above),
      // so every OTHER node's canonical geometry here is exactly what's
      // rendered -- only the dragged node's own live box comes from React
      // Flow's own in-progress drag state.
      if (doc.mode !== 'mindmap') return;
      const box = liveNodeBox(node);
      const candidate = findReparentCapture(doc.nodes, node.id, box, childrenIdsByParent);
      setReparentPreview(
        candidate ? { draggedId: node.id, candidateParentId: candidate.parentId, side: candidate.side } : null
      );
    },
    [doc.mode, doc.nodes, childrenIdsByParent, liveNodeBox]
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: Node<CustomNodeData>) => {
      setReparentPreview(null);
      if (doc.mode !== 'mindmap') return;

      const candidate = findReparentCapture(doc.nodes, node.id, liveNodeBox(node), childrenIdsByParent);
      const dragged = doc.nodes.find((candidateNode) => candidateNode.id === node.id);
      const projectCallbacks = {
        onToggleFold: handleToggleFold,
        selectedNodeId,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      };

      if (!dragged || dragged.type === 'root') {
        const projected = canonicalToReactFlow(doc, projectCallbacks);
        setNodes(projected.nodes);
        setEdges(projected.edges);
        return;
      }

      if (candidate) {
        const reparentedNodes = applyReparent(doc.nodes, node.id, candidate);
        const reparentedEdges = updateHierarchyEdgesForReparent(
          doc.edges,
          node.id,
          dragged.parentId,
          candidate.parentId
        );
        const nextDoc: CanonicalDocument = {
          ...doc,
          nodes: reparentedNodes,
          edges: reparentedEdges,
          updatedAt: new Date().toISOString(),
        };
        const layouted = autoLayoutDocument(nextDoc, { preset: layoutPreset, stabilizeAgainst: doc });
        const projected = canonicalToReactFlow(layouted, projectCallbacks);
        setDoc(layouted);
        setNodes(projected.nodes);
        setEdges(projected.edges);
        historyRef.current.pushState(layouted);
        updateHistoryStatus();
        revealReparentOutcome([candidate.parentId, node.id]);
        setStatusMessage(candidate.side ? `Moved to ${candidate.side} side of central topic` : 'Moved under new parent topic');
        return;
      }

      // No candidate captured the subtree: it becomes a free-standing
      // hierarchy at the drop position. The old parent's remaining branch
      // is repacked, while the detached subtree keeps the shape shown during
      // the gesture and loses only its old incoming hierarchy edge.
      const detachedNodes = applyDetachedDrop(doc.nodes, node.id, liveNodeBox(node));
      const detachedEdges = dragged.parentId
        ? removeIncomingHierarchyEdge(doc.edges, node.id, dragged.parentId)
        : doc.edges;
      const detachedDoc: CanonicalDocument = {
        ...doc,
        nodes: detachedNodes,
        edges: detachedEdges,
        updatedAt: new Date().toISOString(),
      };
      const layouted = autoLayoutDocument(detachedDoc, { preset: layoutPreset, stabilizeAgainst: doc });
      const projected = canonicalToReactFlow(layouted, projectCallbacks);
      setDoc(layouted);
      setNodes(projected.nodes);
      setEdges(projected.edges);
      historyRef.current.pushState(layouted);
      updateHistoryStatus();
      revealReparentOutcome([node.id]);
      setStatusMessage('Detached as a free topic');
    },
    [
      doc,
      layoutPreset,
      selectedNodeId,
      childrenIdsByParent,
      liveNodeBox,
      handleToggleFold,
      handleUpdateNodeLabel,
      handleLiveResizeWidth,
      handleResizeEndFromNode,
      updateHistoryStatus,
      revealReparentOutcome,
    ]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      // M3 Behavior Correction Contract: normal Mind Map parent-child edges
      // are algorithm-owned -- users may not drag-create/reconnect them.
      // Flowchart keeps full manual connectivity. `CustomNode` also makes
      // its Mind Map handles non-interactive, so this is defense in depth,
      // not the only gate.
      if (!allowsManualConnections(doc.mode)) return;
      const theme = doc.theme || BUILTIN_THEMES['nordic-slate'];
      const canonicalRouting = doc.mode === 'flowchart' ? theme.defaultEdgeRouting || 'smoothstep' : 'smoothstep';
      const rfEdgeType = canonicalEdgeTypeToReactFlow(canonicalRouting);

      setEdges((eds) => {
        const next = addEdge(
          {
            ...params,
            type: rfEdgeType,
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

  const handleSelectAndFocusNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
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

  const handleAutoLayoutWithPreset = useCallback(
    (preset: LayoutOptions['preset']) => {
      setLayoutPreset(preset);
      setIsLayoutMenuOpen(false);
      const currentDoc = reactFlowToCanonical(nodes, edges, doc);
      const layoutedDoc = autoLayoutDocument(currentDoc, { preset });
      const projected = canonicalToReactFlow(layoutedDoc, {
        onToggleFold: handleToggleFold,
        selectedNodeId,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      });

      setNodes(projected.nodes);
      setEdges(projected.edges);
      setDoc(layoutedDoc);
      historyRef.current.pushState(layoutedDoc);
      updateHistoryStatus();
      setStatusMessage(`Layout: ${preset || 'Balanced'}`);
    },
    [nodes, edges, doc, selectedNodeId, updateHistoryStatus, handleToggleFold, handleUpdateNodeLabel]
  );

  // Keyboard / Context: Add Sibling Node
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

      const layouted = autoLayoutDocument(nextDoc, { preset: layoutPreset, stabilizeAgainst: doc });
      const projected = canonicalToReactFlow(layouted, {
        onToggleFold: handleToggleFold,
        selectedNodeId: newId,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      });

      const updatedRfNodes = projected.nodes.map((n) => ({
        ...n,
        selected: n.id === newId,
      }));

      setSelectedNodeId(newId);
      setDoc(layouted);
      setNodes(updatedRfNodes);
      setEdges(projected.edges);
      historyRef.current.pushState(layouted);
      updateHistoryStatus();
      focusNodeOnCanvas(newId, updatedRfNodes);
      setStatusMessage(`Created sibling (${direction})`);
      setIsAddMenuOpen(false);
    },
    [doc, selectedNodeId, layoutPreset, updateHistoryStatus, focusNodeOnCanvas, handleToggleFold, handleUpdateNodeLabel]
  );

  // Keyboard / Context: Add Child Node
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

    const layouted = autoLayoutDocument(nextDoc, { preset: layoutPreset, stabilizeAgainst: doc });
    const projected = canonicalToReactFlow(layouted, {
      onToggleFold: handleToggleFold,
      selectedNodeId: newId,
      onUpdateLabel: handleUpdateNodeLabel,
      onLiveResizeWidth: handleLiveResizeWidth,
      onResizeEnd: handleResizeEndFromNode,
    });

    const updatedRfNodes = projected.nodes.map((n) => ({
      ...n,
      selected: n.id === newId,
    }));

    setSelectedNodeId(newId);
    setDoc(layouted);
    setNodes(updatedRfNodes);
    setEdges(projected.edges);
    historyRef.current.pushState(layouted);
    updateHistoryStatus();
    focusNodeOnCanvas(newId, updatedRfNodes);
    setStatusMessage('Created child node (Tab)');
    setIsAddMenuOpen(false);
  }, [doc, selectedNodeId, layoutPreset, updateHistoryStatus, focusNodeOnCanvas, handleToggleFold, handleUpdateNodeLabel]);

  // Keyboard / Context: Add Parent Topic (Shift+Tab)
  const handleAddParentNode = useCallback(() => {
    const selected = doc.nodes.find((n) => n.id === selectedNodeId);
    if (!selected || selected.type === 'root' || !selected.parentId) {
      setStatusMessage('Root node cannot have a parent topic');
      setIsAddMenuOpen(false);
      return;
    }

    const oldParentId = selected.parentId;
    const newId = `node_${Date.now()}`;
    const newNode: CanonicalNode = {
      id: newId,
      text: 'Parent Topic',
      geometry: { x: selected.geometry.x - 80, y: selected.geometry.y, width: 140, height: 44 },
      type: 'default',
      parentId: oldParentId,
    };

    const nextNodes = doc.nodes.map((n) =>
      n.id === selected.id ? { ...n, parentId: newId } : n
    );
    nextNodes.push(newNode);

    const nextEdges = doc.edges.filter(
      (e) => !(e.source === oldParentId && e.target === selected.id)
    );
    nextEdges.push(
      { id: `edge_${oldParentId}_${newId}`, source: oldParentId, target: newId, type: 'smoothstep' },
      { id: `edge_${newId}_${selected.id}`, source: newId, target: selected.id, type: 'smoothstep' }
    );

    const nextDoc: CanonicalDocument = {
      ...doc,
      nodes: nextNodes,
      edges: nextEdges,
      updatedAt: new Date().toISOString(),
    };

    const layouted = autoLayoutDocument(nextDoc, { preset: layoutPreset, stabilizeAgainst: doc });
    const projected = canonicalToReactFlow(layouted, {
      onToggleFold: handleToggleFold,
      selectedNodeId: newId,
      onUpdateLabel: handleUpdateNodeLabel,
      onLiveResizeWidth: handleLiveResizeWidth,
      onResizeEnd: handleResizeEndFromNode,
    });

    const updatedRfNodes = projected.nodes.map((n) => ({
      ...n,
      selected: n.id === newId,
    }));

    setSelectedNodeId(newId);
    setDoc(layouted);
    setNodes(updatedRfNodes);
    setEdges(projected.edges);
    historyRef.current.pushState(layouted);
    updateHistoryStatus();
    focusNodeOnCanvas(newId, updatedRfNodes);
    setStatusMessage('Created parent topic (Shift+Tab)');
    setIsAddMenuOpen(false);
  }, [doc, selectedNodeId, layoutPreset, updateHistoryStatus, focusNodeOnCanvas, handleToggleFold, handleUpdateNodeLabel]);

  // Flowchart steps
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

      const projected = canonicalToReactFlow(nextDoc, {
        onToggleFold: handleToggleFold,
        selectedNodeId: newId,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      });
      const updatedRfNodes = projected.nodes.map((n) => ({
        ...n,
        selected: n.id === newId,
      }));

      setSelectedNodeId(newId);
      setDoc(nextDoc);
      setNodes(updatedRfNodes);
      setEdges(projected.edges);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
      focusNodeOnCanvas(newId, updatedRfNodes);
      setStatusMessage(`Added connected step (${direction})`);
      setIsAddMenuOpen(false);
    },
    [doc, selectedNodeId, updateHistoryStatus, focusNodeOnCanvas, handleToggleFold, handleUpdateNodeLabel]
  );

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

    const projected = canonicalToReactFlow(nextDoc, {
      onToggleFold: handleToggleFold,
      selectedNodeId: newId,
      onUpdateLabel: handleUpdateNodeLabel,
      onLiveResizeWidth: handleLiveResizeWidth,
      onResizeEnd: handleResizeEndFromNode,
    });
    const updatedRfNodes = projected.nodes.map((n) => ({
      ...n,
      selected: n.id === newId,
    }));

    setSelectedNodeId(newId);
    setDoc(nextDoc);
    setNodes(updatedRfNodes);
    setEdges(projected.edges);
    historyRef.current.pushState(nextDoc);
    updateHistoryStatus();
    focusNodeOnCanvas(newId, updatedRfNodes);
    setStatusMessage('Added decision branch (Tab)');
    setIsAddMenuOpen(false);
  }, [doc, selectedNodeId, updateHistoryStatus, focusNodeOnCanvas, handleToggleFold, handleUpdateNodeLabel]);

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

  const beginGroupDrag = useCallback((event: React.PointerEvent, groupId: string) => {
    const flowPoint = rfInstanceRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    if (!flowPoint) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    groupDragRef.current = { groupId, startX: flowPoint.x, startY: flowPoint.y, dx: 0, dy: 0 };
  }, []);

  const moveGroupDrag = useCallback((event: React.PointerEvent) => {
    const activeDrag = groupDragRef.current;
    const flowPoint = rfInstanceRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    if (!activeDrag || !flowPoint) return;
    const dx = flowPoint.x - activeDrag.startX;
    const dy = flowPoint.y - activeDrag.startY;
    const stepX = dx - activeDrag.dx;
    const stepY = dy - activeDrag.dy;
    if (stepX === 0 && stepY === 0) return;
    activeDrag.dx = dx;
    activeDrag.dy = dy;
    setDoc((previousDoc) => {
      const nextDoc = translateGroup(previousDoc, activeDrag.groupId, stepX, stepY);
      const projected = canonicalToReactFlow(nextDoc, {
        onToggleFold: handleToggleFold,
        selectedNodeId,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      });
      setNodes(projected.nodes);
      setEdges(projected.edges);
      return nextDoc;
    });
  }, [handleToggleFold, handleUpdateNodeLabel, selectedNodeId, handleLiveResizeWidth]);

  const endGroupDrag = useCallback(() => {
    if (!groupDragRef.current) return;
    groupDragRef.current = null;
    setDoc((currentDoc) => {
      historyRef.current.pushState(currentDoc);
      updateHistoryStatus();
      return currentDoc;
    });
    setStatusMessage('Moved group container');
  }, [updateHistoryStatus]);

  // Annotation Management (Boundary, Brace, Relationship Line)
  const handleAddBoundary = useCallback(
    (targetNodeId?: string) => {
      const flowSelected = rfInstanceRef.current?.getNodes().filter((n) => n.selected).map((n) => n.id) || [];
      const combined = new Set([...flowSelected, ...Array.from(multiSelectedNodeIds)]);
      
      let candidateIds: string[] = [];
      if (targetNodeId && combined.has(targetNodeId) && combined.size > 1) {
        candidateIds = Array.from(combined);
      } else if (combined.size > 1) {
        candidateIds = Array.from(combined);
      } else if (targetNodeId) {
        candidateIds = [targetNodeId];
      } else if (combined.size > 0) {
        candidateIds = Array.from(combined);
      } else if (selectedNodeId) {
        candidateIds = [selectedNodeId];
      }

      if (!candidateIds.length) return;

      const newBoundaries = createBoundaryAnnotations(candidateIds, doc.nodes);
      if (!newBoundaries.length) return;

      const nextDoc: CanonicalDocument = {
        ...doc,
        annotations: [...(doc.annotations || []), ...newBoundaries],
        updatedAt: new Date().toISOString(),
      };
      setDoc(nextDoc);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
      setSelectedAnnotationId(newBoundaries[0].id);
      setStatusMessage(`Created boundary (${newBoundaries.length} group${newBoundaries.length > 1 ? 's' : ''})`);
      setContextMenu(null);
    },
    [doc, multiSelectedNodeIds, selectedNodeId, updateHistoryStatus]
  );

  const handleAddBrace = useCallback(
    (targetNodeId?: string) => {
      const flowSelected = rfInstanceRef.current?.getNodes().filter((n) => n.selected).map((n) => n.id) || [];
      const combined = new Set([...flowSelected, ...Array.from(multiSelectedNodeIds)]);
      
      let candidateIds: string[] = [];
      if (targetNodeId && combined.has(targetNodeId) && combined.size > 1) {
        candidateIds = Array.from(combined);
      } else if (combined.size > 1) {
        candidateIds = Array.from(combined);
      } else if (targetNodeId) {
        candidateIds = [targetNodeId];
      } else if (combined.size > 0) {
        candidateIds = Array.from(combined);
      } else if (selectedNodeId) {
        candidateIds = [selectedNodeId];
      }

      if (!candidateIds.length) return;

      const newBraces = createBraceAnnotations(candidateIds, doc.nodes);
      if (!newBraces.length) return;

      const nextDoc: CanonicalDocument = {
        ...doc,
        annotations: [...(doc.annotations || []), ...newBraces],
        updatedAt: new Date().toISOString(),
      };
      setDoc(nextDoc);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
      setSelectedAnnotationId(newBraces[0].id);
      setStatusMessage(`Created brace (${newBraces.length} group${newBraces.length > 1 ? 's' : ''})`);
      setContextMenu(null);
    },
    [doc, multiSelectedNodeIds, selectedNodeId, updateHistoryStatus]
  );

  const handleStartRelationshipLine = useCallback(
    (sourceNodeId: string) => {
      setTargetingLineSourceId(sourceNodeId);
      setTargetingMousePos(null);
      setContextMenu(null);
      setStatusMessage('Connecting line: click target topic (Esc to cancel)');
    },
    []
  );

  const handleCommitRelationshipLine = useCallback(
    (targetNodeId: string) => {
      if (!targetingLineSourceId) return;
      if (targetingLineSourceId === targetNodeId) {
        return;
      }
      const newLine = createRelationshipLineAnnotation(targetingLineSourceId, targetNodeId);
      if (!newLine) return;

      setDoc((prevDoc) => {
        const nextDoc: CanonicalDocument = {
          ...prevDoc,
          annotations: [...(prevDoc.annotations || []), newLine],
          updatedAt: new Date().toISOString(),
        };
        historyRef.current.pushState(nextDoc);
        return nextDoc;
      });
      updateHistoryStatus();
      setSelectedAnnotationId(newLine.id);
      setTargetingLineSourceId(null);
      setTargetingMousePos(null);
      setStatusMessage('Created relationship line');
    },
    [targetingLineSourceId, updateHistoryStatus]
  );

  const handleCancelTargetingLine = useCallback(() => {
    if (targetingLineSourceId) {
      setTargetingLineSourceId(null);
      setTargetingMousePos(null);
      setStatusMessage('Cancelled relationship line');
    }
  }, [targetingLineSourceId]);

  const handleUpdateAnnotation = useCallback(
    (id: string, updates: Partial<MindMapAnnotation>) => {
      const nextDoc: CanonicalDocument = {
        ...doc,
        annotations: (doc.annotations || []).map((ann) =>
          ann.id === id ? ({ ...ann, ...updates } as MindMapAnnotation) : ann
        ),
        updatedAt: new Date().toISOString(),
      };
      setDoc(nextDoc);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
    },
    [doc, updateHistoryStatus]
  );

  const handleControlPointDrag = useCallback(
    (id: string, which: 'c1' | 'c2', delta: { dx: number; dy: number }) => {
      setDoc((prevDoc) => {
        const nextAnnotations = (prevDoc.annotations || []).map((ann) => {
          if (ann.id !== id || ann.kind !== 'relationshipLine') return ann;
          const route = (ann as RelationshipLineAnnotation).route || {};
          const updatedRoute =
            which === 'c1'
              ? { ...route, c1Offset: delta }
              : { ...route, c2Offset: delta };
          return { ...ann, route: updatedRoute } as MindMapAnnotation;
        });
        return {
          ...prevDoc,
          annotations: nextAnnotations,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    []
  );

  const handleDeleteAnnotation = useCallback(
    (id: string) => {
      const nextDoc: CanonicalDocument = {
        ...doc,
        annotations: (doc.annotations || []).filter((ann) => ann.id !== id),
        updatedAt: new Date().toISOString(),
      };
      setDoc(nextDoc);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
      if (selectedAnnotationId === id) {
        setSelectedAnnotationId(null);
      }
      setStatusMessage('Deleted annotation');
    },
    [doc, selectedAnnotationId, updateHistoryStatus]
  );

  // Deletion handling
  const handleDeleteSelectedSubtree = useCallback(() => {
    if (!selectedNodeId) return;
    setPendingDeletion(planCanvasDeletion(doc, selectedNodeId));
  }, [doc, selectedNodeId]);

  const handleRequestDeleteOnlyKeepChildren = useCallback(() => {
    if (!selectedNodeId) return;
    setPendingDeletion(planDeleteNodePreservingChildren(doc, selectedNodeId));
  }, [doc, selectedNodeId]);

  const confirmPendingDeletion = useCallback(() => {
    if (!pendingDeletion || !selectedNodeId) return;
    const targetNode = doc.nodes.find((n) => n.id === selectedNodeId);
    if (!targetNode) return;

    if (pendingDeletion.kind === 'clear-root-branches') {
      const nextDoc: CanonicalDocument = {
        ...doc,
        nodes: [targetNode],
        edges: [],
        annotations: pruneOrphanAnnotations(doc.annotations, new Set([targetNode.id])),
        updatedAt: new Date().toISOString(),
      };
      setDoc(nextDoc);
      setSelectedNodeId(targetNode.id);
      const projected = canonicalToReactFlow(nextDoc, {
        onToggleFold: handleToggleFold,
        selectedNodeId: targetNode.id,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      });
      setNodes(projected.nodes);
      setEdges(projected.edges);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
      setStatusMessage('Cleared branches from root');
      setPendingDeletion(null);
      return;
    }

    const deletedIds = new Set(pendingDeletion.nodeIds);
    const nextNodes = doc.nodes.filter((n) => !deletedIds.has(n.id));
    const nextEdges = doc.edges.filter(
      (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)
    );
    const nextAnnotations = pruneOrphanAnnotations(doc.annotations, new Set(nextNodes.map((n) => n.id)));

    const parentToSelect = targetNode.parentId || (nextNodes[0] ? nextNodes[0].id : null);
    setSelectedNodeId(parentToSelect);

    const nextDoc: CanonicalDocument = {
      ...doc,
      nodes: nextNodes,
      edges: nextEdges,
      annotations: nextAnnotations,
      updatedAt: new Date().toISOString(),
    };

    const layouted = doc.mode === 'mindmap' ? autoLayoutDocument(nextDoc, { preset: layoutPreset, stabilizeAgainst: doc }) : nextDoc;
    const projected = canonicalToReactFlow(layouted, {
      onToggleFold: handleToggleFold,
      selectedNodeId: parentToSelect,
      onUpdateLabel: handleUpdateNodeLabel,
      onLiveResizeWidth: handleLiveResizeWidth,
      onResizeEnd: handleResizeEndFromNode,
    });

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
    setPendingDeletion(null);
  }, [doc, pendingDeletion, selectedNodeId, layoutPreset, updateHistoryStatus, handleToggleFold, handleUpdateNodeLabel]);

  const confirmDeleteOnlyKeepChildren = useCallback(() => {
    if (!selectedNodeId) return;
    const nextDoc = deleteNodePreservingChildren(doc, selectedNodeId);
    if (nextDoc === doc) return;

    const layouted = doc.mode === 'mindmap' ? autoLayoutDocument(nextDoc, { preset: layoutPreset, stabilizeAgainst: doc }) : nextDoc;
    const projected = canonicalToReactFlow(layouted, {
      onToggleFold: handleToggleFold,
      selectedNodeId: null,
      onUpdateLabel: handleUpdateNodeLabel,
      onLiveResizeWidth: handleLiveResizeWidth,
      onResizeEnd: handleResizeEndFromNode,
    });

    setDoc(layouted);
    setSelectedNodeId(null);
    setNodes(projected.nodes);
    setEdges(projected.edges);
    historyRef.current.pushState(layouted);
    updateHistoryStatus();
    setStatusMessage('Deleted node, kept its children');
    setPendingDeletion(null);
  }, [doc, selectedNodeId, layoutPreset, updateHistoryStatus, handleToggleFold, handleUpdateNodeLabel]);

  // Batch delete selected topics
  const handleDeleteSelectedTopics = useCallback(() => {
    if (multiSelectedNodeIds.size === 0 && selectedNodeId) {
      handleDeleteSelectedSubtree();
      return;
    }
    const rootNode = doc.nodes.find((n) => n.type === 'root' || !n.parentId);
    const toDelete = new Set([...multiSelectedNodeIds].filter((id) => id !== rootNode?.id));
    if (toDelete.size === 0) {
      setStatusMessage('Cannot delete root node');
      return;
    }

    const nextNodes = doc.nodes.filter((n) => !toDelete.has(n.id));
    const nextEdges = doc.edges.filter((e) => !toDelete.has(e.source) && !toDelete.has(e.target));

    const nextDoc: CanonicalDocument = {
      ...doc,
      nodes: nextNodes,
      edges: nextEdges,
      updatedAt: new Date().toISOString(),
    };

    const layouted = doc.mode === 'mindmap' ? autoLayoutDocument(nextDoc, { preset: layoutPreset, stabilizeAgainst: doc }) : nextDoc;
    const projected = canonicalToReactFlow(layouted, {
      onToggleFold: handleToggleFold,
      selectedNodeId: null,
      onUpdateLabel: handleUpdateNodeLabel,
      onLiveResizeWidth: handleLiveResizeWidth,
      onResizeEnd: handleResizeEndFromNode,
    });

    setDoc(layouted);
    setSelectedNodeId(null);
    setMultiSelectedNodeIds(new Set());
    setNodes(projected.nodes);
    setEdges(projected.edges);
    historyRef.current.pushState(layouted);
    updateHistoryStatus();
    setStatusMessage(`Deleted ${toDelete.size} selected topics`);
  }, [doc, multiSelectedNodeIds, selectedNodeId, layoutPreset, updateHistoryStatus, handleToggleFold, handleUpdateNodeLabel, handleDeleteSelectedSubtree]);

  // Clipboard operations
  const handleCopyBranch = useCallback(() => {
    if (!selectedNodeId) return;
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

  const handleCutBranch = useCallback(() => {
    handleCopyBranch();
    handleDeleteSelectedSubtree();
    setStatusMessage('Cut branch to clipboard');
  }, [handleCopyBranch, handleDeleteSelectedSubtree]);

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
      // Ignore clipboard permission errors
    }

    if (clipboardText && clipboardText.trim().includes('\n')) {
      const parsed = parseMultilineToTree(clipboardText, targetNode.id, targetNode.geometry);
      if (parsed.nodes.length > 0) {
        const nextDoc: CanonicalDocument = {
          ...doc,
          nodes: [...doc.nodes, ...parsed.nodes],
          edges: [...doc.edges, ...parsed.edges],
          updatedAt: new Date().toISOString(),
        };
        const layouted = autoLayoutDocument(nextDoc, { preset: layoutPreset, stabilizeAgainst: doc });
        const firstParsedId = parsed.nodes[0]?.id || selectedNodeId;
        setSelectedNodeId(firstParsedId);
        const projected = canonicalToReactFlow(layouted, {
          onToggleFold: handleToggleFold,
          selectedNodeId: firstParsedId,
          onUpdateLabel: handleUpdateNodeLabel,
          onLiveResizeWidth: handleLiveResizeWidth,
          onResizeEnd: handleResizeEndFromNode,
        });

        setDoc(layouted);
        setNodes(projected.nodes);
        setEdges(projected.edges);
        historyRef.current.pushState(layouted);
        updateHistoryStatus();
        setStatusMessage(`Pasted multiline structure (${parsed.nodes.length} nodes)`);
        return;
      }
    }

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

      const layouted = autoLayoutDocument(nextDoc, { preset: layoutPreset, stabilizeAgainst: doc });
      const firstClonedId = clonedNodes[0]?.id || selectedNodeId;
      setSelectedNodeId(firstClonedId);
      const projected = canonicalToReactFlow(layouted, {
        onToggleFold: handleToggleFold,
        selectedNodeId: firstClonedId,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      });

      setDoc(layouted);
      setNodes(projected.nodes);
      setEdges(projected.edges);
      historyRef.current.pushState(layouted);
      updateHistoryStatus();
      setStatusMessage(`Pasted branch subtree (${clonedNodes.length} nodes)`);
    }
  }, [doc, selectedNodeId, layoutPreset, updateHistoryStatus, handleToggleFold, handleUpdateNodeLabel]);

  const handleUndo = useCallback(() => {
    const prev = historyRef.current.undo();
    if (prev) {
      setDoc(prev);
      const nextSelected = prev.nodes.some((n) => n.id === selectedNodeId)
        ? selectedNodeId
        : prev.nodes[0]?.id || null;
      setSelectedNodeId(nextSelected);
      const projected = canonicalToReactFlow(prev, {
        onToggleFold: handleToggleFold,
        selectedNodeId: nextSelected,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      });
      setNodes(projected.nodes);
      setEdges(projected.edges);
      updateHistoryStatus();
      setStatusMessage('Undo');
    }
  }, [updateHistoryStatus, handleToggleFold, selectedNodeId, handleUpdateNodeLabel]);

  const handleRedo = useCallback(() => {
    const next = historyRef.current.redo();
    if (next) {
      setDoc(next);
      const nextSelected = next.nodes.some((n) => n.id === selectedNodeId)
        ? selectedNodeId
        : next.nodes[0]?.id || null;
      setSelectedNodeId(nextSelected);
      const projected = canonicalToReactFlow(next, {
        onToggleFold: handleToggleFold,
        selectedNodeId: nextSelected,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      });
      setNodes(projected.nodes);
      setEdges(projected.edges);
      updateHistoryStatus();
      setStatusMessage('Redo');
    }
  }, [updateHistoryStatus, handleToggleFold, selectedNodeId, handleUpdateNodeLabel]);

  // M3: Separate Collapse and Expand submenu handlers
  const handleCollapseBranch = useCallback(
    (kind: 'current' | 'siblings' | 'descendants') => {
      if (!selectedNodeId) return;
      const target = doc.nodes.find((n) => n.id === selectedNodeId);
      if (!target) return;

      const childrenMap = new Map<string, string[]>();
      for (const n of doc.nodes) {
        if (n.parentId) {
          const list = childrenMap.get(n.parentId) || [];
          list.push(n.id);
          childrenMap.set(n.parentId, list);
        }
      }

      let toCollapse = new Set<string>();
      if (kind === 'current') {
        toCollapse.add(selectedNodeId);
      } else if (kind === 'siblings') {
        if (target.parentId) {
          const siblings = childrenMap.get(target.parentId) || [];
          siblings.forEach((sId) => {
            if (sId !== selectedNodeId) toCollapse.add(sId);
          });
        }
      } else if (kind === 'descendants') {
        const collect = (pId: string) => {
          const ch = childrenMap.get(pId) || [];
          ch.forEach((cId) => {
            toCollapse.add(cId);
            collect(cId);
          });
        };
        collect(selectedNodeId);
      }

      const nextNodes = doc.nodes.map((n) =>
        toCollapse.has(n.id) ? { ...n, collapsed: true } : n
      );

      const nextDoc: CanonicalDocument = {
        ...doc,
        nodes: nextNodes,
        updatedAt: new Date().toISOString(),
      };

      // Visibility-changing: not stabilized -- see handleToggleFold's comment.
      const layouted = autoLayoutDocument(nextDoc, { preset: layoutPreset });
      const projected = canonicalToReactFlow(layouted, {
        onToggleFold: handleToggleFold,
        selectedNodeId,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      });

      setDoc(layouted);
      setNodes(projected.nodes);
      setEdges(projected.edges);
      historyRef.current.pushState(layouted);
      updateHistoryStatus();
      setStatusMessage(`Collapsed: ${kind}`);
      setContextMenu(null);
    },
    [doc, selectedNodeId, layoutPreset, updateHistoryStatus, handleToggleFold, handleUpdateNodeLabel]
  );

  const handleExpandBranch = useCallback(
    (kind: 'current' | 'siblings' | 'descendants') => {
      if (!selectedNodeId) return;
      const target = doc.nodes.find((n) => n.id === selectedNodeId);
      if (!target) return;

      const childrenMap = new Map<string, string[]>();
      for (const n of doc.nodes) {
        if (n.parentId) {
          const list = childrenMap.get(n.parentId) || [];
          list.push(n.id);
          childrenMap.set(n.parentId, list);
        }
      }

      let toExpand = new Set<string>();
      if (kind === 'current') {
        toExpand.add(selectedNodeId);
      } else if (kind === 'siblings') {
        if (target.parentId) {
          const siblings = childrenMap.get(target.parentId) || [];
          siblings.forEach((sId) => toExpand.add(sId));
        }
      } else if (kind === 'descendants') {
        toExpand.add(selectedNodeId);
        const collect = (pId: string) => {
          const ch = childrenMap.get(pId) || [];
          ch.forEach((cId) => {
            toExpand.add(cId);
            collect(cId);
          });
        };
        collect(selectedNodeId);
      }

      const nextNodes = doc.nodes.map((n) =>
        toExpand.has(n.id) ? { ...n, collapsed: false } : n
      );

      const nextDoc: CanonicalDocument = {
        ...doc,
        nodes: nextNodes,
        updatedAt: new Date().toISOString(),
      };

      // Visibility-changing: not stabilized -- see handleToggleFold's comment.
      const layouted = autoLayoutDocument(nextDoc, { preset: layoutPreset });
      const projected = canonicalToReactFlow(layouted, {
        onToggleFold: handleToggleFold,
        selectedNodeId,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      });

      setDoc(layouted);
      setNodes(projected.nodes);
      setEdges(projected.edges);
      historyRef.current.pushState(layouted);
      updateHistoryStatus();
      setStatusMessage(`Expanded: ${kind}`);
      setContextMenu(null);
    },
    [doc, selectedNodeId, layoutPreset, updateHistoryStatus, handleToggleFold, handleUpdateNodeLabel]
  );

  // M3 Behavior Correction Contract 3.3-3.6: blank-canvas, document-level
  // structure commands. Mind Map only (numbering follows the same guard).
  // All are visibility-changing, so -- like handleToggleFold above -- none
  // pass `stabilizeAgainst`.
  const applyDocumentStructureChange = useCallback(
    (nextNodes: CanonicalNode[], statusMessage: string) => {
      if (doc.mode !== 'mindmap') return;
      const nextDoc: CanonicalDocument = { ...doc, nodes: nextNodes, updatedAt: new Date().toISOString() };
      const layouted = autoLayoutDocument(nextDoc, { preset: layoutPreset });
      const projected = canonicalToReactFlow(layouted, {
        onToggleFold: handleToggleFold,
        selectedNodeId,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      });
      setDoc(layouted);
      setNodes(projected.nodes);
      setEdges(projected.edges);
      historyRef.current.pushState(layouted);
      updateHistoryStatus();
      setStatusMessage(statusMessage);
      setContextMenu(null);
    },
    [doc, layoutPreset, selectedNodeId, updateHistoryStatus, handleToggleFold, handleUpdateNodeLabel]
  );

  const handleCollapseAllTopics = useCallback(() => {
    applyDocumentStructureChange(collapseAllTopLevelTopics(doc.nodes), 'Collapsed all topics');
  }, [doc, applyDocumentStructureChange]);

  const handleExpandAllTopics = useCallback(() => {
    applyDocumentStructureChange(expandAllTopics(doc.nodes), 'Expanded all topics');
  }, [doc, applyDocumentStructureChange]);

  const handleExpandToLevel = useCallback(
    (level: number) => {
      applyDocumentStructureChange(expandToLevel(doc.nodes, level), `Expanded to level ${level}`);
    },
    [doc, applyDocumentStructureChange]
  );

  const handleSelectAllTopics = useCallback(() => {
    if (doc.mode !== 'mindmap') return;
    const allIds = new Set(doc.nodes.map((n) => n.id));
    setMultiSelectedNodeIds(allIds);
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
    setStatusMessage(`Selected all topics (${allIds.size})`);
    setContextMenu(null);
  }, [doc]);

  // M3: Selection submenus
  const handleSelectHierarchy = useCallback(
    (kind: 'same-branch' | 'all-level' | 'clear') => {
      if (kind === 'clear') {
        setMultiSelectedNodeIds(new Set());
        setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === selectedNodeId })));
        setStatusMessage('Cleared multi-selection');
        setContextMenu(null);
        return;
      }

      if (!selectedNodeId) return;
      const target = doc.nodes.find((n) => n.id === selectedNodeId);
      if (!target) return;

      // Compute tree depth for each node
      const depthMap = new Map<string, number>();
      const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));
      const getDepth = (id: string): number => {
        if (depthMap.has(id)) return depthMap.get(id)!;
        const node = nodeById.get(id);
        if (!node || node.type === 'root' || !node.parentId) {
          depthMap.set(id, 0);
          return 0;
        }
        const d = 1 + getDepth(node.parentId);
        depthMap.set(id, d);
        return d;
      };

      const targetDepth = getDepth(selectedNodeId);
      const selectedIds = new Set<string>();

      if (kind === 'same-branch') {
        const branchLevelIds = selectSameLevelInTopLevelBranch(doc.nodes, selectedNodeId);
        branchLevelIds.forEach((id) => selectedIds.add(id));
        setStatusMessage(`Selected ${selectedIds.size} same-level topics in current branch`);
      } else if (kind === 'all-level') {
        doc.nodes.forEach((n) => {
          if (getDepth(n.id) === targetDepth) {
            selectedIds.add(n.id);
          }
        });
        setStatusMessage(`Selected ${selectedIds.size} topics at same depth`);
      }

      setMultiSelectedNodeIds(selectedIds);
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          selected: selectedIds.has(n.id) || n.id === selectedNodeId,
        }))
      );
      setContextMenu(null);
    },
    [doc.nodes, selectedNodeId]
  );

  // M3: Numbering submenu actions
  const handleApplyNumbering = useCallback(
    // `nodeId` defaults to `selectedNodeId` (the Inspector panel's call
    // site, which has no other node reference) but the context menu passes
    // its own `targetNodeId` explicitly -- so the applied node is always
    // exactly the one the enabled/disabled check and the menu were shown
    // for, never inferred separately from ambient selection state.
    (style: NumberingStyle, depth?: number, nodeId: string | null = selectedNodeId) => {
      // M3 Behavior Correction Contract: numbering is parent-scoped from
      // the node the menu was opened for (its direct children, and deeper
      // descendants per `depth`) -- not hardcoded to the document root.
      // Disabled entirely when that node has no children.
      if (!canApplyNumbering(doc, nodeId)) {
        setStatusMessage('Numbering unavailable: selected topic has no children');
        setContextMenu(null);
        return;
      }
      const targetNodeId = nodeId as string;

      const nextDoc: CanonicalDocument = {
        ...doc,
        nodes: doc.nodes.map((n) => {
          if (n.id === targetNodeId) {
            return {
              ...n,
              numbering: {
                level1Style: style,
                level2Style: style === 'decimal' ? 'decimal' : style === 'roman' ? 'roman' : style === 'alpha' ? 'alpha' : 'none',
                maxDepth: depth ?? n.numbering?.maxDepth ?? 3,
              },
            };
          }
          return n;
        }),
        updatedAt: new Date().toISOString(),
      };

      const projected = canonicalToReactFlow(nextDoc, {
        onToggleFold: handleToggleFold,
        selectedNodeId,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      });

      setDoc(nextDoc);
      setNodes(projected.nodes);
      setEdges(projected.edges);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
      setStatusMessage(`Numbering applied: ${style}${depth ? ` (depth ${depth})` : ''}`);
      setContextMenu(null);
    },
    [doc, selectedNodeId, handleToggleFold, handleUpdateNodeLabel, updateHistoryStatus]
  );

  // M3: Focus Mode Toggle
  const handleToggleFocusMode = useCallback(() => {
    if (focusNodeId) {
      setFocusNodeId(null);
      setStatusMessage('Exited focus mode');
    } else if (selectedNodeId) {
      setFocusNodeId(selectedNodeId);
      setStatusMessage('Entered focus mode');
    }
    setContextMenu(null);
  }, [focusNodeId, selectedNodeId]);

  // Compute focused branch node IDs
  const focusedBranchNodeIds = useMemo(() => {
    if (!focusNodeId) return null;
    const branchIds = new Set<string>();
    const rootNode = doc.nodes.find((n) => n.type === 'root' || !n.parentId);
    if (rootNode) branchIds.add(rootNode.id);

    const childrenMap = new Map<string, string[]>();
    for (const n of doc.nodes) {
      if (n.parentId) {
        const list = childrenMap.get(n.parentId) || [];
        list.push(n.id);
        childrenMap.set(n.parentId, list);
      }
    }

    const addSubtree = (id: string) => {
      branchIds.add(id);
      const ch = childrenMap.get(id) || [];
      ch.forEach(addSubtree);
    };

    let cur: CanonicalNode | undefined = doc.nodes.find((n) => n.id === focusNodeId);
    while (cur) {
      branchIds.add(cur.id);
      cur = cur.parentId ? doc.nodes.find((n) => n.id === cur?.parentId) : undefined;
    }
    addSubtree(focusNodeId);
    return branchIds;
  }, [focusNodeId, doc.nodes]);

  // M3: Context Menu Trigger Handlers
  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node<CustomNodeData>) => {
      event.preventDefault();
      event.stopPropagation();
      setSelectedNodeId(node.id);
      setMultiSelectedNodeIds((prev) => {
        if (prev.has(node.id)) {
          return prev;
        }
        return new Set([node.id]);
      });

      const x = Math.min(event.clientX, window.innerWidth - 250);
      const y = Math.min(event.clientY, window.innerHeight - 440);
      setContextMenu({ x: Math.max(10, x), y: Math.max(10, y), nodeId: node.id });
      // A placement computed for the previous menu's trigger rects must not
      // leak into this one -- otherwise a submenu that isn't re-hovered at
      // the new position keeps showing yesterday's (possibly overflowing)
      // placement indefinitely, not just for one measurement frame.
      setSubmenuPlacements({});
    },
    []
  );

  const handlePaneContextMenu = useCallback(
    (event: any) => {
      event.preventDefault();
      const x = Math.min(event.clientX, window.innerWidth - 250);
      const y = Math.min(event.clientY, window.innerHeight - 440);
      // Blank canvas -- M3 Behavior Correction Contract 3.6: expose
      // document-level structure controls (`nodeId: null`), independent of
      // whatever node happens to be selected, rather than reopening the
      // per-node menu (or doing nothing when nothing is selected).
      setContextMenu({ x: Math.max(10, x), y: Math.max(10, y), nodeId: null });
      setSubmenuPlacements({});
    },
    []
  );

  const positionContextSubmenu = useCallback(
    (key: ContextSubmenuKey, triggerRow: HTMLElement) => {
      window.requestAnimationFrame(() => {
        const rect = triggerRow.getBoundingClientRect();
        const renderedSubmenu = triggerRow.querySelector<HTMLElement>('[data-context-submenu]');
        const submenuRect = renderedSubmenu?.getBoundingClientRect();
        const fallbackSize = CONTEXT_SUBMENU_SIZES[key];
        const placement = computeSubmenuPlacement(
          { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
          {
            width: submenuRect?.width || fallbackSize.width,
            height: submenuRect?.height || fallbackSize.height,
          },
          { width: window.innerWidth, height: window.innerHeight }
        );
        setSubmenuPlacements((current) => ({ ...current, [key]: placement }));
      });
    },
    []
  );

  // Close menus on outside click
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setIsAddMenuOpen(false);
      setIsLayoutMenuOpen(false);
      setIsMoreMenuOpen(false);
      setIsExportMenuOpen(false);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleUpdateTheme = useCallback(
    (theme: DocumentTheme) => {
      const nextDoc: CanonicalDocument = {
        ...doc,
        theme,
        updatedAt: new Date().toISOString(),
      };
      setDoc(nextDoc);
      const projected = canonicalToReactFlow(nextDoc, {
        onToggleFold: handleToggleFold,
        selectedNodeId,
        onUpdateLabel: handleUpdateNodeLabel,
        onLiveResizeWidth: handleLiveResizeWidth,
        onResizeEnd: handleResizeEndFromNode,
      });
      setNodes(projected.nodes);
      setEdges(projected.edges);
      historyRef.current.pushState(nextDoc);
      updateHistoryStatus();
      setStatusMessage(`Theme applied: ${theme.name}`);
    },
    [doc, selectedNodeId, updateHistoryStatus, handleToggleFold, handleUpdateNodeLabel]
  );

  const handleUpdateNode = useCallback(
    (nodeId: string, updates: Partial<CanonicalNode>) => {
      setSelectedNodeId(nodeId);
      setDoc((prevDoc) => {
        const nextDoc: CanonicalDocument = {
          ...prevDoc,
          nodes: prevDoc.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)),
          updatedAt: new Date().toISOString(),
        };
        const projected = canonicalToReactFlow(nextDoc, {
          onToggleFold: handleToggleFold,
          selectedNodeId: nodeId,
          onUpdateLabel: handleUpdateNodeLabel,
          onLiveResizeWidth: handleLiveResizeWidth,
          onResizeEnd: handleResizeEndFromNode,
        });
        setNodes(projected.nodes);
        setEdges(projected.edges);
        historyRef.current.pushState(nextDoc);
        updateHistoryStatus();
        return nextDoc;
      });
    },
    [handleToggleFold, handleUpdateNodeLabel, updateHistoryStatus]
  );
  handleUpdateNodeRef.current = handleUpdateNode;

  const handleResetNodeStyle = useCallback(
    (nodeId: string) => {
      const target = doc.nodes.find((n) => n.id === nodeId);
      if (!target) return;
      const resetNode = resetNodeToTheme(target);
      handleUpdateNode(nodeId, resetNode);
      if (target.manualSize) {
        handleResetNodeSize();
      }
      setStatusMessage('Reset node to theme defaults');
    },
    [doc.nodes, handleUpdateNode, handleResetNodeSize]
  );

  const handleSaveDocument = useCallback(async () => {
    const liveViewport = rfInstanceRef.current?.getViewport();
    const docWithLiveViewport: CanonicalDocument = liveViewport
      ? { ...doc, viewport: { x: liveViewport.x, y: liveViewport.y, zoom: liveViewport.zoom } }
      : doc;
    const currentDoc = reactFlowToCanonical(nodes, edges, docWithLiveViewport);
    setStatusMessage('Saving...');
    const result = await onSaveDocument(currentDoc);
    if (result.success) {
      setSaveError(null);
      setStatusMessage('Saved to local storage');
    } else {
      const reason = result.message || 'Unknown error';
      setSaveError(reason);
      setStatusMessage(`Save failed: ${reason}`);
    }
  }, [nodes, edges, doc, onSaveDocument]);

  const handleExportFormat = useCallback(
    async (format: ExportFormat) => {
      try {
        const liveViewport = rfInstanceRef.current?.getViewport();
        const docWithLiveViewport: CanonicalDocument = liveViewport
          ? { ...doc, viewport: { x: liveViewport.x, y: liveViewport.y, zoom: liveViewport.zoom } }
          : doc;
        const currentDoc = reactFlowToCanonical(nodes, edges, docWithLiveViewport);
        const artifact = await createExportArtifact(currentDoc, format, assetStoreRef.current.toBytesMap());
        const bridge = getNativeBridge();
        if (bridge.isTauri()) {
          const result = await saveExportWithNativeDialog(artifact, bridge);
          setIsExportMenuOpen(false);
          setIsMoreMenuOpen(false);
          setStatusMessage(result.status === 'saved' ? `Exported ${format.toUpperCase()} to ${result.path}` : 'Export cancelled');
          return;
        }

        const blob = new Blob([artifact.contents as BlobPart], { type: artifact.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = artifact.filename;
        a.click();
        URL.revokeObjectURL(url);
        setIsExportMenuOpen(false);
        setIsMoreMenuOpen(false);
        setStatusMessage(`Exported ${format.toUpperCase()}`);
      } catch (error) {
        setIsExportMenuOpen(false);
        setIsMoreMenuOpen(false);
        setStatusMessage(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
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
            const buf = new Uint8Array(event.target?.result as ArrayBuffer);
            const parsed = parseMflowFromBytes(buf);
            const loadedDoc = parsed.document;
            setDoc(loadedDoc);
            const projected = canonicalToReactFlow(loadedDoc, {
              onToggleFold: handleToggleFold,
              onUpdateLabel: handleUpdateNodeLabel,
              onLiveResizeWidth: handleLiveResizeWidth,
              onResizeEnd: handleResizeEndFromNode,
            });
            setNodes(projected.nodes);
            setEdges(projected.edges);
            if (loadedDoc.viewport && rfInstanceRef.current) {
              rfInstanceRef.current.setViewport(loadedDoc.viewport);
              setCurrentZoom(loadedDoc.viewport.zoom);
            }
            historyRef.current.pushState(loadedDoc);
            updateHistoryStatus();
            setStatusMessage(`Loaded container: ${loadedDoc.title}`);
          } catch {
            setStatusMessage('Failed to load .mflow package');
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const text = event.target?.result as string;
            const imported = importFromMarkdown(text, file.name.replace(/\.(md|markdown)$/i, ''));
            const layouted = autoLayoutDocument(imported, { preset: 'balanced' });
            setDoc(layouted);
            const projected = canonicalToReactFlow(layouted, {
              onToggleFold: handleToggleFold,
              onUpdateLabel: handleUpdateNodeLabel,
              onLiveResizeWidth: handleLiveResizeWidth,
              onResizeEnd: handleResizeEndFromNode,
            });
            setNodes(projected.nodes);
            setEdges(projected.edges);
            if (rfInstanceRef.current) {
              rfInstanceRef.current.fitView({ padding: 0.2 });
            }
            historyRef.current.pushState(layouted);
            updateHistoryStatus();
            setStatusMessage(`Imported Markdown: ${imported.title}`);
          } catch {
            setStatusMessage('Failed to parse Markdown outline');
          }
        };
        reader.readAsText(file);
      } else if (lower.endsWith('.opml')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const text = event.target?.result as string;
            const imported = importFromOPML(text);
            const layouted = autoLayoutDocument(imported, { preset: 'balanced' });
            setDoc(layouted);
            const projected = canonicalToReactFlow(layouted, {
              onToggleFold: handleToggleFold,
              onUpdateLabel: handleUpdateNodeLabel,
              onLiveResizeWidth: handleLiveResizeWidth,
              onResizeEnd: handleResizeEndFromNode,
            });
            setNodes(projected.nodes);
            setEdges(projected.edges);
            if (rfInstanceRef.current) {
              rfInstanceRef.current.fitView({ padding: 0.2 });
            }
            historyRef.current.pushState(layouted);
            updateHistoryStatus();
            setStatusMessage(`Imported OPML: ${imported.title}`);
          } catch {
            setStatusMessage('Failed to parse OPML document');
          }
        };
        reader.readAsText(file);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const parsed = JSON.parse(event.target?.result as string);
            setDoc(parsed);
            const projected = canonicalToReactFlow(parsed, {
              onToggleFold: handleToggleFold,
              onUpdateLabel: handleUpdateNodeLabel,
              onLiveResizeWidth: handleLiveResizeWidth,
              onResizeEnd: handleResizeEndFromNode,
            });
            setNodes(projected.nodes);
            setEdges(projected.edges);
            if (parsed.viewport && rfInstanceRef.current) {
              rfInstanceRef.current.setViewport(parsed.viewport);
              setCurrentZoom(parsed.viewport.zoom);
            }
            historyRef.current.pushState(parsed);
            updateHistoryStatus();
            setStatusMessage(`Loaded: ${parsed.title}`);
          } catch {
            setStatusMessage('Failed to load JSON document');
          }
        };
        reader.readAsText(file);
      }
    },
    [updateHistoryStatus, handleToggleFold, handleUpdateNodeLabel]
  );

  const handleChooseIcon = useCallback(
    (nodeId: string, icon?: string) => {
      handleUpdateNode(nodeId, { icon });
      setStatusMessage(icon ? `Applied icon ${icon}` : 'Removed icon');
    },
    [handleUpdateNode]
  );

  // Spatial Navigation
  const handleArrowNavigation = useCallback(
    (arrowKey: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight') => {
      if (doc.nodes.length === 0) return;
      const currentNode = doc.nodes.find((n) => n.id === selectedNodeId) || doc.nodes[0];
      let targetId: string | null = null;

      if (doc.mode === 'flowchart') {
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
            const rightDirectChildren = (childrenMap.get(rootNode.id) || []).filter((c) => c.geometry.x >= rootNode.geometry.x);
            if (rightDirectChildren.length > 0) targetId = rightDirectChildren[0].id;
          } else if (isRightWing) {
            const children = childrenMap.get(currentNode.id) || [];
            if (children.length > 0) targetId = children[0].id;
          } else if (currentNode.parentId) {
            targetId = currentNode.parentId;
          }
        } else if (arrowKey === 'ArrowLeft') {
          if (isRoot) {
            const leftDirectChildren = (childrenMap.get(rootNode.id) || []).filter((c) => c.geometry.x < rootNode.geometry.x);
            if (leftDirectChildren.length > 0) targetId = leftDirectChildren[0].id;
          } else if (!isRightWing) {
            const children = childrenMap.get(currentNode.id) || [];
            if (children.length > 0) targetId = children[0].id;
          } else if (currentNode.parentId) {
            targetId = currentNode.parentId;
          }
        }
      }

      if (targetId) {
        setSelectedNodeId(targetId);
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            selected: n.id === targetId,
          }))
        );
        focusNodeOnCanvas(targetId, nodes);
      }
    },
    [doc, selectedNodeId, nodes, focusNodeOnCanvas]
  );

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (targetingLineSourceId) {
          handleCancelTargetingLine();
          return;
        }
        if (selectedAnnotationId) {
          setSelectedAnnotationId(null);
          return;
        }
        if (focusNodeId) {
          setFocusNodeId(null);
          setStatusMessage('Exited focus mode');
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId) {
        const activeTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault();
          handleDeleteAnnotation(selectedAnnotationId);
          return;
        }
      }
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const activeTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault();
          handleToggleFocusMode();
          return;
        }
      }

      dispatchCanvasKeyDown(e, doc.mode, {
        onSave: handleSaveDocument,
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
        onDeselect: () => {
          setSelectedNodeId(null);
          setMultiSelectedNodeIds(new Set());
          setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
        },
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    doc.mode,
    focusNodeId,
    contextMenu,
    handleToggleFocusMode,
    handleSaveDocument,
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

  // Viewport zoom tracker for adaptive edge legibility
  const handleViewportChange = useCallback((viewport: { zoom: number }) => {
    setCurrentZoom(viewport.zoom);
  }, []);

  // Viewport camera persistence at gesture-end boundaries (pan/zoom/fitView)
  const handleMoveEnd = useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    setDoc((prevDoc) => {
      if (
        prevDoc.viewport?.x === viewport.x &&
        prevDoc.viewport?.y === viewport.y &&
        prevDoc.viewport?.zoom === viewport.zoom
      ) {
        return prevDoc;
      }
      return {
        ...prevDoc,
        viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
      };
    });
    setCurrentZoom(viewport.zoom);
  }, []);

  // Compute dimmed visual nodes & edges when focus mode is active
  const displayedNodes = useMemo(() => {
    return nodes.map((n) => {
      const isFocused = !focusedBranchNodeIds || focusedBranchNodeIds.has(n.id);
      const isMulti = multiSelectedNodeIds.has(n.id);
      // M3 Behavior Correction Contract: while dragging, the node whose
      // capture zone the drag has entered is highlighted so the user knows
      // where it'll be reparented if they release now.
      const isReparentCandidate = reparentPreview?.candidateParentId === n.id;
      return {
        ...n,
        style: {
          ...n.style,
          opacity: isFocused ? 1 : 0.16,
          boxShadow: isReparentCandidate
            ? '0 0 0 3px rgba(59, 130, 246, 0.65), 0 4px 10px rgba(59, 130, 246, 0.25)'
            : isMulti
              ? '0 0 0 2px rgba(99, 102, 241, 0.4), 0 4px 12px rgba(99, 102, 241, 0.15)'
              : n.style?.boxShadow,
        },
      };
    });
  }, [nodes, focusedBranchNodeIds, multiSelectedNodeIds, reparentPreview]);

  const displayedEdges = useMemo(() => {
    const adaptiveWidth = adaptiveEdges && currentZoom < 0.65 ? Math.max(2, 1.25 / currentZoom) : 2;
    const base: Edge[] = edges.map((e) => {
      const isFocused = !focusedBranchNodeIds || (focusedBranchNodeIds.has(e.source) && focusedBranchNodeIds.has(e.target));
      return {
        ...e,
        style: {
          ...e.style,
          strokeWidth: adaptiveWidth,
          opacity: isFocused ? 1 : 0.18,
        },
      };
    });

    // M3 Behavior Correction Contract: a dashed preview of the pending
    // reparent -- purely a rendering affordance, not a real canonical edge
    // (never written back; recomputed every frame from live positions).
    if (reparentPreview) {
      const draggedNode = nodes.find((n) => n.id === reparentPreview.draggedId);
      const candidateNode = nodes.find((n) => n.id === reparentPreview.candidateParentId);
      if (draggedNode && candidateNode) {
        const draggedIsRight = draggedNode.position.x >= candidateNode.position.x;
        base.push({
          id: '__reparent-preview__',
          source: reparentPreview.candidateParentId,
          target: reparentPreview.draggedId,
          sourceHandle: draggedIsRight ? 'right' : 'left',
          targetHandle: draggedIsRight ? 'left' : 'right',
          type: 'straight',
          selectable: false,
          deletable: false,
          focusable: false,
          reconnectable: false,
          interactionWidth: 0,
          style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '6 4' },
          zIndex: 1000,
        } as Edge);
      }
    }

    return base;
  }, [edges, focusedBranchNodeIds, adaptiveEdges, currentZoom, reparentPreview, nodes]);

  // Live effective node geometry for annotations (boundaries, braces, relationship lines)
  // Keeps full canonical node data (parentId, collapsed, mindMapSide) while tracking live dimensions and coordinates
  const effectiveNodes = useMemo((): CanonicalNode[] => {
    const rfNodeMap = new Map(nodes.map((rn) => [rn.id, rn]));
    return doc.nodes.map((dn) => {
      const rn = rfNodeMap.get(dn.id);
      if (!rn) return dn;
      const width =
        rn.measured?.width ??
        (typeof (rn.style as any)?.width === 'number' ? (rn.style as any).width : dn.geometry.width);
      const height =
        rn.measured?.height ??
        (typeof (rn.style as any)?.height === 'number' ? (rn.style as any).height : dn.geometry.height);
      return {
        ...dn,
        geometry: {
          x: rn.position.x,
          y: rn.position.y,
          width: width || 120,
          height: height || 44,
        },
      };
    });
  }, [doc.nodes, nodes]);

  return (
    <div
      ref={containerRef}
      data-testid="canvas-editor"
      className="w-full h-full flex flex-col relative overflow-hidden select-none"
    >
      {/* Topbar: Reconstructed per Final Design Contract */}
      <header className="h-[52px] px-3 bg-white/95 backdrop-blur-md border-b border-slate-200 flex items-center justify-between gap-3 z-30 shrink-0 shadow-2xs">
        {/* Left Section */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBackToLibrary}
            data-testid="back-to-library-btn"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors"
          >
            <ArrowLeft size={13} />
            ← Library
          </button>

          <button
            onClick={() => setIsOutlineOpen((prev) => !prev)}
            title="Toggle Outline (Ctrl+\)"
            className={`p-1.5 rounded-lg border transition-colors ${
              isOutlineOpen
                ? 'bg-blue-50 border-blue-200 text-blue-600'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            <PanelLeft size={14} />
          </button>

          <div className="h-4 w-px bg-slate-200 mx-1" />

          <div className="min-w-0 flex flex-col">
            <input
              type="text"
              data-testid="canvas-document-title"
              value={doc.title}
              onChange={(e) => setDoc({ ...doc, title: e.target.value })}
              className="text-xs font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none px-0.5 py-0 truncate max-w-[240px]"
            />
            <span className="text-[10px] text-slate-400 font-medium">
              {doc.mode === 'mindmap' ? 'Mind Map · autosaved' : 'Flowchart · autosaved'}
            </span>
          </div>
        </div>

        {/* Center Section: Mode Pill */}
        <div className="hidden md:flex items-center">
          <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200/80 text-[11px] font-bold rounded-full">
            {doc.mode === 'mindmap' ? 'Mind Map' : 'Flowchart'}
          </span>
        </div>

        {/* Right Section: Action Controls */}
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {/* Undo / Redo */}
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-colors"
          >
            <Undo size={14} />
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-colors"
          >
            <Redo size={14} />
          </button>

          <div className="h-4 w-px bg-slate-200 mx-0.5" />

          {/* ＋ Add Dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsAddMenuOpen((prev) => !prev);
                setIsLayoutMenuOpen(false);
                setIsMoreMenuOpen(false);
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg shadow-2xs transition-colors"
            >
              <Plus size={13} />
              <span>Add</span>
              <ChevronDown size={11} className="text-slate-400" />
            </button>

            {isAddMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-xs"
              >
                {doc.mode === 'mindmap' ? (
                  <>
                    <button
                      onClick={handleAddChildNode}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                    >
                      <span>Child topic</span>
                      <kbd className="text-[10px] text-slate-400 font-mono">Tab</kbd>
                    </button>
                    <button
                      onClick={() => handleAddSiblingNode('below')}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                    >
                      <span>Sibling topic</span>
                      <kbd className="text-[10px] text-slate-400 font-mono">Enter</kbd>
                    </button>
                    <button
                      onClick={handleAddParentNode}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                    >
                      <span>Parent topic</span>
                      <kbd className="text-[10px] text-slate-400 font-mono">Shift+Tab</kbd>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleAddFlowchartStep('downstream')}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-between"
                    >
                      <span>Next Step</span>
                      <kbd className="text-[10px] text-slate-400 font-mono">Enter</kbd>
                    </button>
                    <button
                      onClick={handleAddFlowchartBranch}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
                    >
                      <span>Decision Branch</span>
                      <kbd className="text-[10px] text-slate-400 font-mono">Tab</kbd>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ✦ Auto Layout Dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsLayoutMenuOpen((prev) => !prev);
                setIsAddMenuOpen(false);
                setIsMoreMenuOpen(false);
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold rounded-lg shadow-2xs transition-colors"
            >
              <Sparkles size={13} />
              <span>Auto Layout</span>
              <ChevronDown size={11} className="text-blue-500" />
            </button>

            {isLayoutMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-xs"
              >
                {doc.mode === 'mindmap' ? (
                  <>
                    <button
                      onClick={() => handleAutoLayoutWithPreset('balanced')}
                      className={`w-full px-3 py-1.5 text-left flex items-center justify-between ${
                        layoutPreset === 'balanced' ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>Balanced</span>
                      {layoutPreset === 'balanced' && <span>✓</span>}
                    </button>
                    <button
                      onClick={() => handleAutoLayoutWithPreset('LR')}
                      className={`w-full px-3 py-1.5 text-left flex items-center justify-between ${
                        layoutPreset === 'LR' ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>Left → Right</span>
                      {layoutPreset === 'LR' && <span>✓</span>}
                    </button>
                    <button
                      onClick={() => handleAutoLayoutWithPreset('RL')}
                      className={`w-full px-3 py-1.5 text-left flex items-center justify-between ${
                        layoutPreset === 'RL' ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>Right → Left</span>
                      {layoutPreset === 'RL' && <span>✓</span>}
                    </button>
                    <button
                      onClick={() => handleAutoLayoutWithPreset('TB')}
                      className={`w-full px-3 py-1.5 text-left flex items-center justify-between ${
                        layoutPreset === 'TB' ? 'text-blue-600 font-bold bg-blue-50' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span>Top → Bottom</span>
                      {layoutPreset === 'TB' && <span>✓</span>}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleAutoLayoutWithPreset('TB')}
                    className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 font-medium"
                  >
                    Auto Layout (Dagre)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Save Primary Button */}
          <button
            onClick={handleSaveDocument}
            title="Save Document Locally (Ctrl+S)"
            className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-lg shadow-2xs transition-all"
          >
            <Save size={13} />
            <span>Save</span>
          </button>

          {/* ••• More Overflow Dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsMoreMenuOpen((prev) => !prev);
                setIsAddMenuOpen(false);
                setIsLayoutMenuOpen(false);
              }}
              title="More Actions"
              className="p-1.5 text-slate-600 hover:bg-slate-100 border border-slate-200 bg-white rounded-lg shadow-2xs transition-colors"
            >
              <span className="text-xs font-bold px-0.5">•••</span>
            </button>

            {isMoreMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-xs"
              >
                <label className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer">
                  <Upload size={13} className="text-slate-400" />
                  <span>Import File…</span>
                  <input
                    type="file"
                    accept=".mflow,.json,.md,.markdown,.opml"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={() => {
                    setIsExportMenuOpen(true);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Download size={13} className="text-slate-400" />
                    <span>Export…</span>
                  </div>
                  <ChevronRight size={11} className="text-slate-400" />
                </button>
                {selectedNodeId && (
                  <button
                    onClick={() => handleCreateGroup('Process Group', [selectedNodeId])}
                    className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Layers size={13} className="text-slate-400" />
                    <span>Wrap in Group</span>
                  </button>
                )}
                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={() => setIsOutlineOpen((p) => !p)}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <PanelLeft size={13} className="text-slate-400" />
                  <span>Toggle Outline</span>
                </button>
                <button
                  onClick={() => setIsInspectorOpen((p) => !p)}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <PanelRight size={13} className="text-slate-400" />
                  <span>Toggle Inspector</span>
                </button>
              </div>
            )}
          </div>

          {/* Inspector Toggle */}
          <button
            onClick={() => setIsInspectorOpen((prev) => !prev)}
            title="Toggle Inspector (Ctrl+/)"
            className={`p-1.5 rounded-lg border transition-colors ${
              isInspectorOpen
                ? 'bg-blue-50 border-blue-200 text-blue-600'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            <PanelRight size={14} />
          </button>
        </div>
      </header>

      {/* 3-Pane Workspace Shell */}
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

        {/* Center Canvas Viewport */}
        <main aria-label="Interactive Canvas Viewport" className="flex-1 h-full relative overflow-hidden bg-slate-50">
          {/* Focus Mode Banner */}
          {focusNodeId && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 bg-slate-900/90 text-white rounded-full text-xs font-semibold flex items-center gap-2.5 shadow-lg backdrop-blur-md animate-fadeIn">
              <Crosshair size={13} className="text-blue-400" />
              <span>Focus mode · current branch</span>
              <button
                onClick={() => setFocusNodeId(null)}
                className="ml-1 px-2 py-0.5 bg-white/20 hover:bg-white/30 text-white rounded text-[11px] font-bold transition-colors"
              >
                Exit Focus (Esc)
              </button>
            </div>
          )}

          <ReactFlow
            nodes={displayedNodes}
            edges={displayedEdges}
            onNodesChange={onNodesChange}
            onSelectionChange={({ nodes: selectedNodes }) => {
              if (selectedNodes.length > 1) {
                setMultiSelectedNodeIds(new Set(selectedNodes.map((n) => n.id)));
              }
            }}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(event, node) => {
              if (targetingLineSourceId) {
                handleCommitRelationshipLine(node.id);
                return;
              }
              setSelectedAnnotationId(null);
              if (event.shiftKey || event.ctrlKey || event.metaKey) {
                setMultiSelectedNodeIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(node.id)) {
                    next.delete(node.id);
                  } else {
                    next.add(node.id);
                  }
                  return next;
                });
                setNodes((nds) =>
                  nds.map((n) => (n.id === node.id ? { ...n, selected: !n.selected } : n))
                );
              } else {
                setSelectedNodeId(node.id);
                setMultiSelectedNodeIds(new Set([node.id]));
                setNodes((nds) =>
                  nds.map((n) => ({ ...n, selected: n.id === node.id }))
                );
              }
            }}
            onNodeContextMenu={handleNodeContextMenu}
            onPaneContextMenu={handlePaneContextMenu}
            defaultViewport={initialDocument.viewport}
            onMoveEnd={handleMoveEnd}
            onViewportChange={handleViewportChange}
            onPointerMove={(e) => {
              if (targetingLineSourceId && rfInstanceRef.current) {
                const flowPos = rfInstanceRef.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
                setTargetingMousePos(flowPos);
              }
            }}
            onPaneClick={() => {
              if (!targetingLineSourceId) {
                setSelectedNodeId(null);
                setSelectedAnnotationId(null);
                setMultiSelectedNodeIds(new Set());
                setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
              }
            }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => {
              rfInstanceRef.current = instance as any;
              if (initialDocument.viewport) {
                instance.setViewport(initialDocument.viewport);
              }
            }}
            minZoom={0.05}
            maxZoom={5}
          >
            <Background
              color={doc.theme?.edgeColor || '#cbd5e1'}
              gap={22}
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

            {/* Mind Map Annotation Layer (Boundaries, Braces, Relationship Lines) */}
            <ViewportPortal>
              <AnnotationLayer
                annotations={doc.annotations}
                nodes={effectiveNodes}
                selectedAnnotationId={selectedAnnotationId}
                onSelectAnnotation={(id) => {
                  setSelectedAnnotationId(id);
                  setSelectedNodeId(null);
                  setMultiSelectedNodeIds(new Set());
                }}
                onUpdateAnnotation={handleUpdateAnnotation}
                onDeleteAnnotation={handleDeleteAnnotation}
                targetingSourceNodeId={targetingLineSourceId}
                targetingMousePos={targetingMousePos}
                onControlPointDrag={handleControlPointDrag}
                zoom={currentZoom}
              />
            </ViewportPortal>

            {/* Visual Group Containers Layer */}
            <ViewportPortal>
              {doc.groups && doc.groups.map((group) => {
                const bounds = resolveGroupBounds(group, doc.nodes);
                return (
                  <div
                    key={group.id}
                    data-testid={`group-container-${group.id}`}
                    className="absolute pointer-events-none rounded-xl border-2 border-dashed transition-all"
                    style={{
                      transform: `translate(${bounds.x}px, ${bounds.y}px)`,
                      width: `${bounds.width}px`,
                      height: `${bounds.height}px`,
                      backgroundColor: group.style?.backgroundColor || 'rgba(241, 245, 249, 0.65)',
                      borderColor: group.style?.borderColor || '#cbd5e1',
                      zIndex: -1,
                    }}
                  >
                    <div
                      className="pointer-events-auto cursor-move touch-none px-2.5 py-1 bg-white/90 border-b border-slate-200/90 rounded-t-xl text-[11px] font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs"
                      onPointerDown={(event) => beginGroupDrag(event, group.id)}
                      onPointerMove={moveGroupDrag}
                      onPointerUp={endGroupDrag}
                      onPointerCancel={endGroupDrag}
                    >
                      <Layers size={12} className="text-blue-500" />
                      <span>{group.title}</span>
                    </div>
                  </div>
                );
              })}
            </ViewportPortal>

            {/* Status Pill */}
            <Panel position="bottom-center" className="mb-4">
              <div
                data-testid="save-status-pill"
                data-save-error={saveError ? 'true' : 'false'}
                className={`px-3 py-1.5 backdrop-blur-md text-white rounded-full text-xs font-medium shadow-lg flex items-center gap-2 ${
                  saveError ? 'bg-red-600/90' : 'bg-slate-900/80'
                }`}
              >
                <FolderSync size={12} className={saveError ? 'text-red-200' : 'text-blue-400'} />
                <span data-testid="save-status-text">Status: {statusMessage}</span>
              </div>
            </Panel>
          </ReactFlow>

          {/* M3: Right-Click Context Menu with Frozen 8 Feature Families + Submenus */}
          {contextMenu && (() => {
            const getSubmenuProps = (key: ContextSubmenuKey) => {
              const placement = submenuPlacements[key] || { horizontal: 'right', topOffset: 0 };
              return {
                'data-testid': `context-submenu-${key}`,
                'data-context-submenu': key,
                'data-horizontal': placement.horizontal,
                className: 'hidden group-hover/sub:block absolute bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-xs',
                style: {
                  width: `${CONTEXT_SUBMENU_SIZES[key].width}px`,
                  left: placement.horizontal === 'right' ? 'calc(100% - 4px)' : 'auto',
                  right: placement.horizontal === 'left' ? 'calc(100% - 4px)' : 'auto',
                  top: `${placement.topOffset}px`,
                },
              };
            };
            if (contextMenu.nodeId === null) {
              // Blank-canvas menu: document-level structure commands only
              // (M3 Behavior Correction Contract 3.6), no node-specific
              // items (clipboard, asset, icon, delete, etc). Mind Map only
              // -- every command it offers (collapse/expand/select topics)
              // is mind-map hierarchy semantics with no flowchart
              // equivalent, so render nothing rather than a menu full of
              // buttons that silently no-op.
              if (doc.mode !== 'mindmap') return null;
              return (
                <div
                  data-testid="canvas-context-menu"
                  onClick={(e) => e.stopPropagation()}
                  className="fixed bg-white border border-slate-200 rounded-xl shadow-2xl py-1.5 z-50 text-xs w-[210px] select-none animate-fadeIn"
                  style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
                >
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Document Structure
                  </div>

                  <div className="relative group/sub" onMouseEnter={(event) => positionContextSubmenu('canvasSelect', event.currentTarget)}>
                    <div className="w-full px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-2">
                        <CheckSquare size={13} className="text-slate-400" />
                        <span>Select Topics</span>
                      </div>
                      <ChevronRight size={12} className="text-slate-400" />
                    </div>
                    <div {...getSubmenuProps('canvasSelect')}>
                      <button
                        onClick={handleSelectAllTopics}
                        className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                      >
                        All Topics
                      </button>
                    </div>
                  </div>

                  <div className="relative group/sub" onMouseEnter={(event) => positionContextSubmenu('expandTo', event.currentTarget)}>
                    <div className="w-full px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Eye size={13} className="text-slate-400" />
                        <span>Expand To</span>
                      </div>
                      <ChevronRight size={12} className="text-slate-400" />
                    </div>
                    <div {...getSubmenuProps('expandTo')}>
                      {[1, 2, 3, 4, 5, 6].map((level) => (
                        <button
                          key={level}
                          onClick={() => handleExpandToLevel(level)}
                          className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                        >
                          Level {level}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleExpandAllTopics}
                    className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Eye size={13} className="text-slate-400" />
                    <span>Expand All Topics</span>
                  </button>
                  <button
                    onClick={handleCollapseAllTopics}
                    className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <ChevronDown size={13} className="text-slate-400" />
                    <span>Collapse All Topics</span>
                  </button>
                </div>
              );
            }

            // Narrowed once here for the nested onClick closures below --
            // TS doesn't carry the `contextMenu.nodeId === null` early
            // return's narrowing into a separately-typechecked arrow
            // function literal.
            const targetNodeId: string = contextMenu.nodeId;
            const targetNode = doc.nodes.find((n) => n.id === targetNodeId);
            const numberingEnabled = canApplyNumbering(doc, targetNodeId);

            return (
              <div
                data-testid="canvas-context-menu"
                onClick={(e) => e.stopPropagation()}
                className="fixed bg-white border border-slate-200 rounded-xl shadow-2xl py-1.5 z-50 text-xs w-[230px] select-none animate-fadeIn"
                style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
              >
                {/* 1. Clipboard */}
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Clipboard
                </div>
                <button
                  onClick={() => {
                    handleCopyBranch();
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Copy size={13} className="text-slate-400" />
                    <span>Copy</span>
                  </div>
                  <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+C</kbd>
                </button>
                <button
                  onClick={() => {
                    handleCutBranch();
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Scissors size={13} className="text-slate-400" />
                    <span>Cut</span>
                  </div>
                  <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+X</kbd>
                </button>
                <button
                  onClick={() => {
                    handlePaste();
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Clipboard size={13} className="text-slate-400" />
                    <span>Paste</span>
                  </div>
                  <kbd className="text-[10px] text-slate-400 font-mono">Ctrl+V</kbd>
                </button>

                <div className="my-1 border-t border-slate-100" />

                {/* 2. Topic Creation Submenu */}
                <div className="relative group/sub" onMouseEnter={(event) => positionContextSubmenu('topic', event.currentTarget)}>
                  <div className="w-full px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Plus size={13} className="text-slate-400" />
                      <span>Topic creation</span>
                    </div>
                    <ChevronRight size={12} className="text-slate-400" />
                  </div>
                  <div {...getSubmenuProps('topic')}>
                    <button
                      onClick={() => {
                        handleAddChildNode();
                        setContextMenu(null);
                      }}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 flex items-center justify-between"
                    >
                      <span>Child topic</span>
                      <kbd className="text-[10px] text-slate-400 font-mono">Tab</kbd>
                    </button>
                    <button
                      onClick={() => {
                        handleAddSiblingNode('below');
                        setContextMenu(null);
                      }}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 flex items-center justify-between"
                    >
                      <span>Sibling topic</span>
                      <kbd className="text-[10px] text-slate-400 font-mono">Enter</kbd>
                    </button>
                    <button
                      onClick={() => {
                        handleAddParentNode();
                        setContextMenu(null);
                      }}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 flex items-center justify-between"
                    >
                      <span>Parent topic</span>
                      <kbd className="text-[10px] text-slate-400 font-mono">Shift+Tab</kbd>
                    </button>
                  </div>
                </div>

                {/* 3. Media Submenu */}
                <div className="relative group/sub" onMouseEnter={(event) => positionContextSubmenu('media', event.currentTarget)}>
                  <div className="w-full px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <ImageIcon size={13} className="text-slate-400" />
                      <span>Media</span>
                    </div>
                    <ChevronRight size={12} className="text-slate-400" />
                  </div>
                  <div {...getSubmenuProps('media')}>
                    <label className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 flex items-center gap-2 cursor-pointer">
                      <Paperclip size={12} className="text-slate-400" />
                      <span>Attach Image…</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file || !targetNodeId) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const dataUrl = ev.target?.result as string;
                            handleUpdateNode(targetNodeId, { assetRef: dataUrl });
                          };
                          reader.readAsDataURL(file);
                          setContextMenu(null);
                        }}
                      />
                    </label>
                    <div className="my-1 border-t border-slate-100" />
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Topic Icon
                    </div>
                    <div className="p-2 grid grid-cols-5 gap-1 max-h-40 overflow-y-auto">
                      {PRESET_ICONS.map(({ emoji, label }) => (
                        <button
                          key={emoji}
                          type="button"
                          title={label}
                          onClick={() => {
                            handleChooseIcon(targetNodeId, emoji);
                            setContextMenu(null);
                          }}
                          className={`h-7 w-7 flex items-center justify-center text-sm rounded hover:bg-slate-100 transition-all ${
                            targetNode?.icon === emoji ? 'bg-blue-100 ring-1 ring-blue-500' : ''
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    {targetNode?.icon && (
                      <button
                        type="button"
                        onClick={() => {
                          handleChooseIcon(targetNodeId, undefined);
                          setContextMenu(null);
                        }}
                        className="w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50 border-t border-slate-100"
                      >
                        Remove icon
                      </button>
                    )}
                  </div>
                </div>

                {/* 3b. Annotations Submenu (Mind Map mode) */}
                {doc.mode === 'mindmap' && (
                  <div
                    className="relative group/sub"
                    onMouseEnter={(event) => positionContextSubmenu('annotation', event.currentTarget)}
                  >
                    <div
                      data-testid="context-menu-annotation-trigger"
                      className="w-full px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Bookmark size={13} className="text-slate-400" />
                        <span>Annotations</span>
                      </div>
                      <ChevronRight size={12} className="text-slate-400" />
                    </div>
                    <div {...getSubmenuProps('annotation')}>
                      <button
                        data-testid="context-action-add-boundary"
                        onClick={() => handleAddBoundary(targetNodeId)}
                        className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 flex items-center justify-between"
                      >
                        <span>Boundary</span>
                      </button>
                      <button
                        data-testid="context-action-add-brace"
                        onClick={() => handleAddBrace(targetNodeId)}
                        className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 flex items-center justify-between"
                      >
                        <span>Brace</span>
                      </button>
                      <button
                        data-testid="context-action-add-relationship-line"
                        onClick={() => handleStartRelationshipLine(targetNodeId)}
                        className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-blue-50 flex items-center justify-between"
                      >
                        <span>Relationship Line</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. Numbering Submenu -- M3 Behavior Correction Contract:
                     parent-scoped from this node, disabled when it has no
                     children (nothing for a rule here to number). */}
                <div
                  className="relative group/sub"
                  onMouseEnter={(event) => numberingEnabled && positionContextSubmenu('numbering', event.currentTarget)}
                >
                  <div
                    data-testid="context-menu-numbering-trigger"
                    aria-disabled={!numberingEnabled}
                    className={`w-full px-3 py-1.5 flex items-center justify-between ${
                      numberingEnabled ? 'text-slate-700 hover:bg-slate-50 cursor-pointer' : 'text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <ListOrdered size={13} className={numberingEnabled ? 'text-slate-400' : 'text-slate-300'} />
                      <span>Numbering</span>
                    </div>
                    <ChevronRight size={12} className={numberingEnabled ? 'text-slate-400' : 'text-slate-300'} />
                  </div>
                  {numberingEnabled && (
                    <div {...getSubmenuProps('numbering')}>
                      <button
                        onClick={() => handleApplyNumbering('none', undefined, targetNodeId)}
                        className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                      >
                        None
                      </button>
                      <button
                        onClick={() => handleApplyNumbering('decimal', undefined, targetNodeId)}
                        className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                      >
                        1, 2, 3, …
                      </button>
                      <button
                        onClick={() => handleApplyNumbering('roman', undefined, targetNodeId)}
                        className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                      >
                        I, II, III, …
                      </button>
                      <button
                        onClick={() => handleApplyNumbering('alpha', undefined, targetNodeId)}
                        className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                      >
                        a, b, c, …
                      </button>
                      <div className="my-1 border-t border-slate-100" />
                      <button
                        onClick={() => handleApplyNumbering('decimal', 1, targetNodeId)}
                        className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                      >
                        Number first level
                      </button>
                      <button
                        onClick={() => handleApplyNumbering('decimal', 2, targetNodeId)}
                        className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                      >
                        Number first two levels
                      </button>
                      <button
                        onClick={() => handleApplyNumbering('decimal', 3, targetNodeId)}
                        className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                      >
                        Number first three levels
                      </button>
                    </div>
                  )}
                </div>

                {/* 5. Separate Collapse Submenu */}
                <div className="relative group/sub" onMouseEnter={(event) => positionContextSubmenu('collapse', event.currentTarget)}>
                  <div className="w-full px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <ChevronDown size={13} className="text-slate-400" />
                      <span>Collapse</span>
                    </div>
                    <ChevronRight size={12} className="text-slate-400" />
                  </div>
                  <div {...getSubmenuProps('collapse')}>
                    <button
                      onClick={() => handleCollapseBranch('current')}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                    >
                      Collapse current topic
                    </button>
                    <button
                      onClick={() => handleCollapseBranch('siblings')}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                    >
                      Collapse sibling topics
                    </button>
                    <button
                      onClick={() => handleCollapseBranch('descendants')}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                    >
                      Collapse all descendants
                    </button>
                  </div>
                </div>

                {/* 6. Separate Expand Submenu */}
                <div className="relative group/sub" onMouseEnter={(event) => positionContextSubmenu('expand', event.currentTarget)}>
                  <div className="w-full px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Eye size={13} className="text-slate-400" />
                      <span>Expand</span>
                    </div>
                    <ChevronRight size={12} className="text-slate-400" />
                  </div>
                  <div {...getSubmenuProps('expand')}>
                    <button
                      onClick={() => handleExpandBranch('current')}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                    >
                      Expand current topic
                    </button>
                    <button
                      onClick={() => handleExpandBranch('siblings')}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                    >
                      Expand sibling topics
                    </button>
                    <button
                      onClick={() => handleExpandBranch('descendants')}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                    >
                      Expand all descendants
                    </button>
                  </div>
                </div>

                {/* 7. Selection Submenu */}
                <div className="relative group/sub" onMouseEnter={(event) => positionContextSubmenu('selection', event.currentTarget)}>
                  <div className="w-full px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <CheckSquare size={13} className="text-slate-400" />
                      <span>Selection</span>
                    </div>
                    <ChevronRight size={12} className="text-slate-400" />
                  </div>
                  <div {...getSubmenuProps('selection')}>
                    <button
                      onClick={() => handleSelectHierarchy('same-branch')}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                    >
                      Same-level in current branch
                    </button>
                    <button
                      onClick={() => handleSelectHierarchy('all-level')}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                    >
                      Same-level across map
                    </button>
                    <button
                      onClick={() => handleSelectHierarchy('clear')}
                      className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                    >
                      Clear multi-selection
                    </button>
                  </div>
                </div>

                <div className="my-1 border-t border-slate-100" />

                {/* 8. Delete Submenu (Danger) */}
                <div className="relative group/sub" onMouseEnter={(event) => positionContextSubmenu('delete', event.currentTarget)}>
                  <div className="w-full px-3 py-1.5 text-rose-600 hover:bg-rose-50 flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Trash2 size={13} className="text-rose-500" />
                      <span>Delete</span>
                    </div>
                    <ChevronRight size={12} className="text-rose-400" />
                  </div>
                  <div {...getSubmenuProps('delete')}>
                    <button
                      onClick={() => {
                        handleDeleteSelectedSubtree();
                        setContextMenu(null);
                      }}
                      className="w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50"
                    >
                      Delete topic + descendants
                    </button>
                    <button
                      onClick={() => {
                        handleRequestDeleteOnlyKeepChildren();
                        setContextMenu(null);
                      }}
                      className="w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50"
                    >
                      Delete only · keep children
                    </button>
                    <button
                      onClick={() => {
                        handleDeleteSelectedTopics();
                        setContextMenu(null);
                      }}
                      className="w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50"
                    >
                      Delete selected topics
                    </button>
                  </div>
                </div>

                <div className="my-1 border-t border-slate-100" />

                {/* 9. Focus Mode */}
                <button
                  onClick={handleToggleFocusMode}
                  className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Crosshair size={13} className={focusNodeId ? 'text-blue-600' : 'text-slate-400'} />
                    <span>{focusNodeId ? 'Exit focus mode' : 'Focus mode'}</span>
                  </div>
                  <kbd className="text-[10px] text-slate-400 font-mono">F</kbd>
                </button>
              </div>
            );
          })()}

          {/* Export Dialog / Overlay */}
          {isExportMenuOpen && (
            <div
              data-testid="canvas-export-menu"
              onClick={(e) => e.stopPropagation()}
              className="absolute right-4 top-4 w-56 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 z-50 text-xs"
            >
              <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Export Format
              </div>
              <button
                onClick={() => handleExportFormat('mflow')}
                className="w-full px-2.5 py-1.5 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-lg flex items-center justify-between"
              >
                <span className="font-semibold">.mflow Container</span>
                <span className="text-[10px] text-slate-400">Native</span>
              </button>
              <div className="my-1 border-t border-slate-100" />
              {(['svg', 'png', 'jpeg', 'pdf', 'html', 'markdown', 'mermaid', 'opml', 'mm', 'canvas', 'json'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => handleExportFormat(fmt)}
                  className="w-full px-2.5 py-1 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-md capitalize"
                >
                  {fmt.toUpperCase()} Export
                </button>
              ))}
            </div>
          )}
        </main>

        {/* Right Pane: Inspector Panel */}
        {isInspectorOpen && (
          <InspectorPanel
            document={doc}
            selectedNode={selectedCanonicalNode}
            selectedAnnotation={selectedAnnotation}
            onUpdateAnnotation={handleUpdateAnnotation}
            onDeleteAnnotation={handleDeleteAnnotation}
            onUpdateTheme={handleUpdateTheme}
            onUpdateNode={handleUpdateNode}
            onResetNodeStyle={handleResetNodeStyle}
            onCreateGroup={handleCreateGroup}
            onClose={() => setIsInspectorOpen(false)}
            onAttachImage={(nodeId) => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  handleUpdateNode(nodeId, { assetRef: ev.target?.result as string });
                };
                reader.readAsDataURL(file);
              };
              input.click();
            }}
            onChooseIcon={handleChooseIcon}
            onCollapseBranch={handleCollapseBranch}
            onExpandBranch={handleExpandBranch}
            onSelectNodes={handleSelectHierarchy}
            onApplyNumbering={handleApplyNumbering}
          />
        )}
      </div>

      {pendingDeletion && (
        <ConfirmationDialog
          title={pendingDeletion.title}
          message={pendingDeletion.message}
          confirmLabel={
            pendingDeletion.kind === 'clear-root-branches'
              ? 'Clear branches'
              : pendingDeletion.kind === 'delete-node-preserve-children'
                ? 'Delete only'
              : pendingDeletion.kind === 'delete-subtree'
                ? 'Delete subtree'
                : 'Delete'
          }
          onConfirm={pendingDeletion.kind === 'delete-node-preserve-children' ? confirmDeleteOnlyKeepChildren : confirmPendingDeletion}
          onCancel={() => setPendingDeletion(null)}
          secondaryLabel={pendingDeletion.kind === 'delete-subtree' ? 'Delete only (keep children)' : undefined}
          onSecondary={pendingDeletion.kind === 'delete-subtree' ? confirmDeleteOnlyKeepChildren : undefined}
        />
      )}
    </div>
  );
};

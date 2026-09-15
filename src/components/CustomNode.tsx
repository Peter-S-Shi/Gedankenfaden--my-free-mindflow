import React, { useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps, NodeResizeControl, NodeResizer } from '@xyflow/react';
import { CustomNodeData } from '../model/adapter';
import { NodeShape } from '../model/types';
import { computeTextAwareNodeSize } from '../model/textMeasurement';
import { formatNumberedLabel } from '../model/numbering';
import { allowsManualConnections } from '../model/connectionPolicy';

export const MINDMAP_HANDLE_IDS = {
  source: ['left', 'right'],
  target: ['left', 'right'],
} as const;

export const CustomNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as CustomNodeData;
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(nodeData.label || 'Node');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(nodeData.label || 'Node');
  }, [nodeData.label]);

  const autoGrow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
      autoGrow();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    // F6: explicit `\n` hard breaks are source semantics -- only trim
    // leading/trailing whitespace of the whole value, never collapse
    // interior newlines the user deliberately typed.
    const newText = text.replace(/^\s+|\s+$/g, '') || 'Node';
    if (newText !== nodeData.label) {
      nodeData.label = newText;
      if (nodeData.onUpdateLabel) {
        nodeData.onUpdateLabel(id, newText);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // F6: node editing is genuinely multiline-capable. Plain Enter still
    // commits (existing single-line behavior is unchanged); Shift+Enter
    // inserts an explicit hard line break instead.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.stopPropagation();
      e.preventDefault();
      handleBlur();
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      setText(nodeData.label || 'Node');
      setIsEditing(false);
    }
  };

  const handleToggleFold = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (nodeData.onToggleFold) {
      nodeData.onToggleFold(id);
    }
  };

  const visuals = nodeData.visuals || {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderWidth: 2,
    borderRadius: 8,
    textColor: '#1e293b',
    fontSize: 14,
    fontFamily: 'sans',
    shape: (nodeData.shape as NodeShape) || 'rounded',
  };

  const shape: NodeShape = nodeData.shape || visuals.shape || 'rounded';
  const isNewBorn = Boolean(nodeData.isNewBorn);
  const isSvgShape = shape === 'diamond' || shape === 'parallelogram';

  let borderRadius = visuals.borderRadius;
  if (shape === 'rectangle') borderRadius = 0;
  if (shape === 'pill') borderRadius = 9999;
  if (shape === 'circle') borderRadius = 9999;

  const borderColor = selected ? '#3b82f6' : visuals.borderColor;
  const borderWidth = selected ? Math.max(visuals.borderWidth, 2) : visuals.borderWidth;

  const hasChildren = Boolean(nodeData.hasChildren);
  const isCollapsed = Boolean(nodeData.collapsed);
  const childCount = nodeData.childCount || 0;
  const hiddenDescendantCount = nodeData.hiddenDescendantCount ?? childCount;
  const numberingBadge = nodeData.numberingBadge;
  const isFlowchart = nodeData.mode === 'flowchart';
  // M3 Behavior Correction Contract: connection-handle interactivity is
  // driven by the same policy CanvasEditor's onConnect gate uses, not a
  // locally-redefined mode check, so the two can't drift apart.
  const handlesInteractive = allowsManualConnections(nodeData.mode || 'mindmap');

  // Product Hardening: Persistent Manual Node Sizing. Mind Map nodes (root
  // and ordinary topics) get a width-only "topic width" control -- height
  // always stays text-aware-derived, never user-set. Flowchart nodes get a
  // normal two-dimensional resize. The Mind Map control is intentionally
  // nudged below the right connection handle; Flowchart keeps the standard
  // resizer handles/lines. In both modes the visible resize affordance stays
  // clear of connection handle pointer-capture areas.
  const resizeHandleStyle: React.CSSProperties = {
    width: 9,
    height: 9,
    borderRadius: 2,
    background: '#3b82f6',
    border: '1.5px solid #ffffff',
  };

  return (
    <div
      data-testid={`custom-node-${id}`}
      className={`w-full h-full relative px-3.5 py-2 transition-all duration-150 group flex items-center justify-center signature-move-glide ${
        isNewBorn ? 'signature-create-grow animate-node-birth' : ''
      } ${
        selected ? 'signature-select-breathe' : ''
      } ${
        nodeData.isDeleting ? 'signature-delete-dissolve' : ''
      }`}
      style={{
        minWidth: shape === 'diamond' ? 140 : 90,
        minHeight: shape === 'diamond' ? 60 : 44,
        backgroundColor: isSvgShape ? 'transparent' : visuals.backgroundColor,
        color: visuals.textColor,
        border: isSvgShape ? 'none' : `${borderWidth}px solid ${borderColor}`,
        borderRadius: isSvgShape ? 0 : borderRadius,
        boxShadow: selected
          ? '0 0 0 3px rgba(59, 130, 246, 0.3), 0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          : '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
      }}
      onDoubleClick={() => setIsEditing(true)}
    >
      {/* SVG Background for non-rectangular geometric shapes */}
      {isSvgShape && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {shape === 'diamond' && (
            <polygon
              points="50,2 98,50 50,98 2,50"
              fill={visuals.backgroundColor}
              stroke={borderColor}
              strokeWidth={borderWidth * 1.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {shape === 'parallelogram' && (
            <polygon
              points="16,3 97,3 84,97 3,97"
              fill={visuals.backgroundColor}
              stroke={borderColor}
              strokeWidth={borderWidth * 1.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      )}

      {/* Connection Handles.
          M3 Behavior Correction Contract: normal Mind Map parent-child
          edges are algorithm-owned -- Mind Map nodes must not expose
          user-facing connection handles at all (no drag-to-connect, no
          reconnect). The handle elements stay in the DOM (React Flow uses
          their position to anchor edge endpoints) but are made fully
          non-interactive and invisible. Flowchart keeps the original
          visible, connectable handles unchanged. */}
      <Handle
        type="target"
        position={Position.Left}
        id={MINDMAP_HANDLE_IDS.target[0]}
        isConnectable={handlesInteractive}
        className={
          handlesInteractive
            ? '!w-2.5 !h-2.5 !bg-slate-400 hover:!bg-blue-500 !border-2 !border-white transition-colors'
            : '!w-2.5 !h-2.5 !opacity-0 !pointer-events-none'
        }
      />
      <Handle
        type="source"
        position={Position.Right}
        id={MINDMAP_HANDLE_IDS.source[1]}
        isConnectable={handlesInteractive}
        className={
          handlesInteractive
            ? '!w-2.5 !h-2.5 !bg-slate-400 hover:!bg-blue-500 !border-2 !border-white transition-colors'
            : '!w-2.5 !h-2.5 !opacity-0 !pointer-events-none'
        }
      />
      <Handle
        type="source"
        position={Position.Left}
        id={MINDMAP_HANDLE_IDS.source[0]}
        isConnectable={handlesInteractive}
        className={
          handlesInteractive
            ? '!w-2.5 !h-2.5 !bg-slate-400 hover:!bg-blue-500 !border-2 !border-white transition-colors'
            : '!w-2.5 !h-2.5 !opacity-0 !pointer-events-none'
        }
      />
      <Handle
        type="target"
        position={Position.Right}
        id={MINDMAP_HANDLE_IDS.target[1]}
        isConnectable={handlesInteractive}
        className={
          handlesInteractive
            ? '!w-2.5 !h-2.5 !bg-slate-400 hover:!bg-blue-500 !border-2 !border-white transition-colors'
            : '!w-2.5 !h-2.5 !opacity-0 !pointer-events-none'
        }
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        isConnectable={handlesInteractive}
        className={
          handlesInteractive
            ? '!w-2.5 !h-2.5 !bg-slate-400 hover:!bg-blue-500 !border-2 !border-white transition-colors opacity-0 group-hover:opacity-100'
            : '!w-2.5 !h-2.5 !opacity-0 !pointer-events-none'
        }
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        isConnectable={handlesInteractive}
        className={
          handlesInteractive
            ? '!w-2.5 !h-2.5 !bg-slate-400 hover:!bg-blue-500 !border-2 !border-white transition-colors opacity-0 group-hover:opacity-100'
            : '!w-2.5 !h-2.5 !opacity-0 !pointer-events-none'
        }
      />

      {/* Manual size resize affordance.
          Mind Map: border-hover horizontal resize affordances on left and right borders
          without permanent blue dot; live text-aware height reflow; manual width persistence.
          Flowchart: standard 2D NodeResizer. */}
      {isFlowchart ? (
        <NodeResizer
          nodeId={id}
          isVisible={selected}
          minWidth={100}
          minHeight={44}
          handleStyle={resizeHandleStyle}
          lineStyle={{ borderColor: '#3b82f6' }}
          onResizeEnd={(_event, params) => {
            nodeData.onResizeEnd?.(id, { width: params.width, height: params.height });
          }}
        />
      ) : (
        <>
          {/* Right border-hover resize control */}
          <NodeResizeControl
            nodeId={id}
            position="right"
            resizeDirection="horizontal"
            minWidth={90}
            maxWidth={640}
            className="!w-2 !h-[60%] !top-[20%] !right-[-3px] !bg-transparent hover:!bg-blue-500/30 group-hover:opacity-100 !opacity-0 !border-0 cursor-ew-resize !rounded-full transition-all z-20"
            style={{ position: 'absolute' }}
            onResize={(_event, params) => {
              const nextHeight = computeTextAwareNodeSize(nodeData.label || '', {
                width: params.width,
                fontSize: visuals.fontSize,
              }).height;
              nodeData.onLiveResizeWidth?.(id, nextHeight);
            }}
            onResizeEnd={(_event, params) => {
              nodeData.onResizeEnd?.(id, { width: params.width, height: params.height });
            }}
          />
          {/* Left border-hover resize control */}
          <NodeResizeControl
            nodeId={id}
            position="left"
            resizeDirection="horizontal"
            minWidth={90}
            maxWidth={640}
            className="!w-2 !h-[60%] !top-[20%] !left-[-3px] !bg-transparent hover:!bg-blue-500/30 group-hover:opacity-100 !opacity-0 !border-0 cursor-ew-resize !rounded-full transition-all z-20"
            style={{ position: 'absolute' }}
            onResize={(_event, params) => {
              const nextHeight = computeTextAwareNodeSize(nodeData.label || '', {
                width: params.width,
                fontSize: visuals.fontSize,
              }).height;
              nodeData.onLiveResizeWidth?.(id, nextHeight);
            }}
            onResizeEnd={(_event, params) => {
              nodeData.onResizeEnd?.(id, { width: params.width, height: params.height });
            }}
          />
        </>
      )}

      {/* Node Content Container */}
      <div
        className="relative z-10 flex flex-col items-center justify-center text-center w-full gap-1 px-1"
        style={{ fontSize: `${visuals.fontSize}px` }}
      >
        {/* Embedded Node Image Asset */}
        {nodeData.assetRef && (
          <div className="w-full max-h-28 mb-1 overflow-hidden rounded flex items-center justify-center bg-slate-50">
            <img
              src={nodeData.assetRef}
              alt="Node Asset"
              className="max-h-28 max-w-full object-contain rounded"
            />
          </div>
        )}

        <div className="flex items-center justify-center text-center w-full gap-1.5">
          {/* Independent Node Icon */}
          {nodeData.icon && (
            <span
              data-testid={`node-icon-${id}`}
              className="text-base leading-none select-none shrink-0"
              title="Topic Icon"
            >
              {nodeData.icon}
            </span>
          )}

          {isEditing ? (
            // F6: genuinely multiline-capable editing control -- a single-line
            // <input> cannot represent a canonical value containing hard `\n`
            // breaks. Enter still commits (single-line behavior unchanged);
            // Shift+Enter inserts an explicit hard line break.
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                autoGrow();
              }}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              rows={1}
              className="w-full text-center bg-transparent border-none outline-none font-medium resize-none overflow-hidden"
              style={{
                color: visuals.textColor,
                fontSize: `${visuals.fontSize}px`,
                fontFamily: visuals.fontFamily,
                whiteSpace: 'pre-wrap',
              }}
            />
          ) : (
            // M3 Behavior Correction Contract: numbering renders as an
            // ordinary inline text prefix, same font size/color/weight as
            // the node text -- not a separate badge/pill treatment.
            // F6: whiteSpace 'pre-wrap' renders explicit `\n` hard breaks
            // instead of collapsing them into ordinary whitespace.
            <span
              className="font-medium tracking-tight select-none break-words"
              style={{ whiteSpace: 'pre-wrap', fontFamily: visuals.fontFamily }}
            >
              {formatNumberedLabel(numberingBadge, text)}
            </span>
          )}
        </div>
      </div>

      {/* Branch Fold/Unfold Indicator */}
      {hasChildren && (
        <button
          onClick={handleToggleFold}
          title={isCollapsed ? `Reveal next level (${hiddenDescendantCount} hidden descendants)` : 'Collapse branch'}
          className={`absolute -right-3.5 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center rounded-full text-[10px] font-bold shadow-xs transition-all ${
            isCollapsed
              ? 'w-6 h-5 bg-blue-600 hover:bg-blue-700 text-white px-1 signature-collapse-gather'
              : 'w-4 h-4 bg-slate-200 hover:bg-slate-300 text-slate-600 opacity-0 group-hover:opacity-100 signature-expand-unfold'
          }`}
        >
          {isCollapsed ? `+${hiddenDescendantCount}` : '−'}
        </button>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { CustomNodeData } from '../model/adapter';
import { NodeShape } from '../model/types';

export const CustomNode: React.FC<NodeProps> = ({ id, data, selected }) => {
  const nodeData = data as unknown as CustomNodeData;
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(nodeData.label || 'Node');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(nodeData.label || 'Node');
  }, [nodeData.label]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    nodeData.label = text;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
    if (e.key === 'Escape') {
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
  const numberingBadge = nodeData.numberingBadge;

  return (
    <div
      data-testid={`custom-node-${id}`}
      className={`relative px-3.5 py-2 transition-all duration-150 group flex items-center justify-center ${
        isNewBorn ? 'animate-node-birth' : ''
      }`}
      style={{
        minWidth: shape === 'diamond' ? 140 : 120,
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

      {/* Connection Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-2.5 !h-2.5 !bg-slate-400 hover:!bg-blue-500 !border-2 !border-white transition-colors"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-2.5 !h-2.5 !bg-slate-400 hover:!bg-blue-500 !border-2 !border-white transition-colors"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-2.5 !h-2.5 !bg-slate-400 hover:!bg-blue-500 !border-2 !border-white transition-colors opacity-0 group-hover:opacity-100"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-2.5 !h-2.5 !bg-slate-400 hover:!bg-blue-500 !border-2 !border-white transition-colors opacity-0 group-hover:opacity-100"
      />

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
          {/* Dynamic Branch Numbering Badge */}
          {numberingBadge && (
            <span
              className="text-[11px] font-bold text-slate-500 bg-slate-100/90 dark:bg-slate-800/80 px-1 py-0.5 rounded select-none shrink-0"
              title="Structural Presentation Numbering"
            >
              {numberingBadge}
            </span>
          )}

          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="w-full text-center bg-transparent border-none outline-none font-medium"
              style={{ color: visuals.textColor, fontSize: `${visuals.fontSize}px` }}
            />
          ) : (
            <span className="font-medium tracking-tight select-none break-words">
              {text}
            </span>
          )}
        </div>
      </div>

      {/* Branch Fold/Unfold Indicator */}
      {hasChildren && (
        <button
          onClick={handleToggleFold}
          title={isCollapsed ? `Expand branch (${childCount} children)` : 'Collapse branch'}
          className={`absolute -right-3.5 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center rounded-full text-[10px] font-bold shadow-xs transition-all ${
            isCollapsed
              ? 'w-6 h-5 bg-blue-600 hover:bg-blue-700 text-white px-1'
              : 'w-4 h-4 bg-slate-200 hover:bg-slate-300 text-slate-600 opacity-0 group-hover:opacity-100'
          }`}
        >
          {isCollapsed ? `+${childCount}` : '−'}
        </button>
      )}
    </div>
  );
};

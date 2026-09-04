import React, { useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { CustomNodeData } from '../model/adapter';

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

  const isTerminal = nodeData.nodeType === 'terminal';
  const isRoot = nodeData.nodeType === 'root';
  const isNewBorn = Boolean(nodeData.isNewBorn);

  const style = nodeData.style || {};
  const backgroundColor = style.backgroundColor || (isRoot ? '#2563eb' : isTerminal ? '#059669' : '#ffffff');
  const textColor = style.textColor || (isRoot || isTerminal ? '#ffffff' : '#1e293b');
  const borderColor = selected ? '#3b82f6' : (style.borderColor || (isRoot ? '#1d4ed8' : '#cbd5e1'));
  const borderRadius = style.borderRadius ?? (isTerminal ? 24 : 8);

  return (
    <div
      data-testid={`custom-node-${id}`}
      className={`relative px-4 py-2.5 shadow-sm transition-all duration-200 group ${
        isNewBorn ? 'animate-node-birth' : ''
      }`}
      style={{
        backgroundColor,
        color: textColor,
        border: `2px solid ${borderColor}`,
        borderRadius,
        minWidth: 120,
        boxShadow: selected
          ? '0 0 0 3px rgba(59, 130, 246, 0.25), 0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          : '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
      }}
      onDoubleClick={() => setIsEditing(true)}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-slate-400 hover:!bg-blue-500 !border-2 !border-white transition-colors"
      />

      <div className="flex items-center justify-center text-center">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full text-center bg-transparent border-none outline-none font-medium text-sm"
            style={{ color: textColor }}
          />
        ) : (
          <span className="font-medium text-sm tracking-tight select-none">
            {text}
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-slate-400 hover:!bg-blue-500 !border-2 !border-white transition-colors"
      />
    </div>
  );
};

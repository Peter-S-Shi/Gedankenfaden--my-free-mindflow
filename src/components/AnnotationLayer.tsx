import React, { useState } from 'react';
import {
  CanonicalNode,
  MindMapAnnotation,
  BoundaryAnnotation,
  BraceAnnotation,
  RelationshipLineAnnotation,
} from '../model/types';
import {
  computeBoundaryBox,
  computeBraceGeometry,
  computeRelationshipCurve,
} from '../model/annotations';
import { Trash2, Type } from 'lucide-react';

export interface AnnotationLayerProps {
  annotations?: MindMapAnnotation[];
  nodes: CanonicalNode[];
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string | null) => void;
  onUpdateAnnotation?: (id: string, updates: Partial<MindMapAnnotation>) => void;
  onDeleteAnnotation?: (id: string) => void;
  targetingSourceNodeId?: string | null;
  targetingMousePos?: { x: number; y: number } | null;
  onControlPointDrag?: (id: string, which: 'c1' | 'c2', delta: { dx: number; dy: number }) => void;
  zoom?: number;
}

export const AnnotationLayer: React.FC<AnnotationLayerProps> = ({
  annotations = [],
  nodes,
  selectedAnnotationId,
  onSelectAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  targetingSourceNodeId,
  targetingMousePos,
  zoom: _zoom = 1,
}) => {
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');

  // Targeting mode preview line
  const targetingPreview = (() => {
    if (!targetingSourceNodeId || !targetingMousePos) return null;
    const srcNode = nodes.find((n) => n.id === targetingSourceNodeId);
    if (!srcNode || !srcNode.geometry) return null;

    const w = srcNode.geometry.width || 120;
    const h = srcNode.geometry.height || 40;
    const srcCenter = { x: srcNode.geometry.x + w / 2, y: srcNode.geometry.y + h / 2 };

    const isRightward = targetingMousePos.x >= srcCenter.x;
    const p1 = isRightward
      ? { x: srcNode.geometry.x + w, y: srcCenter.y }
      : { x: srcNode.geometry.x, y: srcCenter.y };
    const p2 = targetingMousePos;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    const curvature = Math.max(20, Math.min(100, dist * 0.3));

    const c1 = isRightward ? { x: p1.x + curvature, y: p1.y } : { x: p1.x - curvature, y: p1.y };
    const c2 = isRightward ? { x: p2.x - curvature, y: p2.y } : { x: p2.x + curvature, y: p2.y };
    const pathD = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;

    return (
      <g className="rel-preview-line pointer-events-none">
        <path
          d={pathD}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="6,4"
          markerEnd="url(#rel-arrow-end-preview)"
        />
        <circle cx={p2.x} cy={p2.y} r={5} fill="#f59e0b" />
      </g>
    );
  })();

  return (
    <svg
      data-testid="annotation-layer"
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ width: '100%', height: '100%', zIndex: 0 }}
    >
      <defs>
        <marker
          id="rel-arrow-end-preview"
          viewBox="0 0 10 7"
          refX="9"
          refY="3.5"
          markerWidth="7"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" />
        </marker>
        {annotations.map((ann) => {
          if (ann.kind !== 'relationshipLine') return null;
          const stroke = ann.style?.stroke || '#f59e0b';
          return (
            <React.Fragment key={`marker-def-${ann.id}`}>
              <marker
                id={`rel-arrow-end-${ann.id}`}
                viewBox="0 0 10 7"
                refX="9"
                refY="3.5"
                markerWidth="7"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <polygon points="0 0, 10 3.5, 0 7" fill={stroke} />
              </marker>
              <marker
                id={`rel-arrow-start-${ann.id}`}
                viewBox="0 0 10 7"
                refX="1"
                refY="3.5"
                markerWidth="7"
                markerHeight="5"
                orient="auto"
              >
                <polygon points="10 0, 0 3.5, 10 7" fill={stroke} />
              </marker>
            </React.Fragment>
          );
        })}
      </defs>

      {/* 1. Render Boundaries */}
      {annotations
        .filter((a): a is BoundaryAnnotation => a.kind === 'boundary')
        .map((ann) => {
          const box = computeBoundaryBox(ann, nodes);
          if (!box) return null;
          const isSelected = selectedAnnotationId === ann.id;
          const borderColor = ann.style?.borderColor || '#3b82f6';
          const borderWidth = ann.style?.borderWidth || 1.5;
          const borderStyle = ann.style?.borderStyle || 'dashed';
          const fillColor = ann.style?.fillColor || '#3b82f6';
          const fillOpacity = ann.style?.fillOpacity ?? 0.06;
          const borderRadius = ann.style?.borderRadius || 12;

          return (
            <g
              key={ann.id}
              data-testid={`boundary-annotation-${ann.id}`}
              className="group/boundary cursor-pointer pointer-events-auto select-none"
              onClick={(e) => {
                e.stopPropagation();
                onSelectAnnotation(ann.id);
              }}
            >
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                rx={borderRadius}
                fill={fillColor}
                fillOpacity={fillOpacity}
                stroke={isSelected ? '#2563eb' : borderColor}
                strokeWidth={isSelected ? borderWidth + 1.5 : borderWidth}
                strokeDasharray={borderStyle === 'solid' ? undefined : '6,4'}
                className="transition-all"
              />

              {/* Title Badge */}
              {ann.title && (
                <g
                  transform={`translate(${box.x + 14}, ${box.y - 11})`}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                  }}
                >
                  <rect
                    x={0}
                    y={0}
                    width={Math.max(48, ann.title.length * 8 + 16)}
                    height={22}
                    rx={5}
                    fill={isSelected ? '#2563eb' : borderColor}
                    className="shadow-sm"
                  />
                  <text
                    x={Math.max(48, ann.title.length * 8 + 16) / 2}
                    y={15}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize={11}
                    fontWeight={600}
                    style={{ userSelect: 'none' }}
                  >
                    {ann.title}
                  </text>
                </g>
              )}
            </g>
          );
        })}

      {/* 2. Render Braces */}
      {annotations
        .filter((a): a is BraceAnnotation => a.kind === 'brace')
        .map((ann) => {
          const geom = computeBraceGeometry(ann, nodes);
          if (!geom) return null;
          const isSelected = selectedAnnotationId === ann.id;
          const color = ann.style?.color || '#64748b';
          const strokeWidth = ann.style?.strokeWidth || 2;

          return (
            <g
              key={ann.id}
              data-testid={`brace-annotation-${ann.id}`}
              className="group/brace pointer-events-auto cursor-pointer select-none"
              onClick={(e) => {
                e.stopPropagation();
                onSelectAnnotation(ann.id);
              }}
            >
              {/* Invisible wide stroke for easy clicking */}
              <path
                d={geom.pathD}
                fill="none"
                stroke="transparent"
                strokeWidth={18}
                strokeLinecap="round"
              />
              {/* Rendered brace path */}
              <path
                d={geom.pathD}
                fill="none"
                stroke={isSelected ? '#2563eb' : color}
                strokeWidth={isSelected ? strokeWidth + 1.5 : strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-colors"
              />

              {/* Summary Label Pill */}
              {ann.label && (
                <g
                  transform={`translate(${geom.side === 'left' ? geom.labelPosition.x - (ann.label.length * 7 + 16) : geom.labelPosition.x}, ${geom.labelPosition.y - 12})`}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                  }}
                >
                  <rect
                    x={0}
                    y={0}
                    width={Math.max(50, ann.label.length * 7 + 16)}
                    height={24}
                    rx={12}
                    fill={isSelected ? '#eff6ff' : '#ffffff'}
                    stroke={isSelected ? '#2563eb' : '#cbd5e1'}
                    strokeWidth={isSelected ? 1.5 : 1}
                    className="shadow-sm"
                  />
                  <text
                    x={Math.max(50, ann.label.length * 7 + 16) / 2}
                    y={16}
                    textAnchor="middle"
                    fill={isSelected ? '#1d4ed8' : '#334155'}
                    fontSize={11}
                    fontWeight={500}
                    style={{ userSelect: 'none' }}
                  >
                    {ann.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}

      {/* 3. Render Relationship Lines */}
      {annotations
        .filter((a): a is RelationshipLineAnnotation => a.kind === 'relationshipLine')
        .map((ann) => {
          const curve = computeRelationshipCurve(ann, nodes);
          if (!curve) return null;
          const isSelected = selectedAnnotationId === ann.id;
          const stroke = ann.style?.stroke || '#f59e0b';
          const strokeWidth = ann.style?.strokeWidth || 2;
          const lineStyle = ann.style?.lineStyle || 'dashed';
          const arrowEnd = ann.style?.arrowEnd !== false;
          const arrowStart = ann.style?.arrowStart === true;

          return (
            <g
              key={ann.id}
              data-testid={`rel-line-annotation-${ann.id}`}
              className="group/rel-line pointer-events-auto cursor-pointer select-none"
              onClick={(e) => {
                e.stopPropagation();
                onSelectAnnotation(ann.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onSelectAnnotation(ann.id);
                setEditingLineId(ann.id);
                setEditingText(ann.label || '');
              }}
            >
              {/* Invisible wide stroke for hit testing */}
              <path
                d={curve.pathD}
                fill="none"
                stroke="transparent"
                strokeWidth={18}
                strokeLinecap="round"
              />
              {/* Rendered line */}
              <path
                d={curve.pathD}
                fill="none"
                stroke={isSelected ? '#2563eb' : stroke}
                strokeWidth={isSelected ? strokeWidth + 1.5 : strokeWidth}
                strokeDasharray={lineStyle === 'solid' ? undefined : '6,4'}
                strokeLinecap="round"
                markerEnd={arrowEnd ? `url(#rel-arrow-end-${ann.id})` : undefined}
                markerStart={arrowStart ? `url(#rel-arrow-start-${ann.id})` : undefined}
                className="transition-colors"
              />

              {/* Midpoint Label Pill / Inline Editor */}
              {editingLineId === ann.id ? (
                <foreignObject
                  x={curve.midPoint.x - 70}
                  y={curve.midPoint.y - 15}
                  width={140}
                  height={30}
                  className="overflow-visible pointer-events-auto"
                >
                  <div className="flex items-center justify-center w-full h-full">
                    <input
                      autoFocus
                      type="text"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onBlur={() => {
                        onUpdateAnnotation?.(ann.id, { label: editingText.trim() });
                        setEditingLineId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onUpdateAnnotation?.(ann.id, { label: editingText.trim() });
                          setEditingLineId(null);
                        } else if (e.key === 'Escape') {
                          setEditingLineId(null);
                        }
                      }}
                      className="w-full px-2.5 py-0.5 text-xs text-slate-800 bg-white border-2 border-blue-500 rounded-full shadow-lg outline-none text-center"
                      placeholder="Type label..."
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </foreignObject>
              ) : ann.label ? (
                <g
                  transform={`translate(${curve.midPoint.x - (ann.label.length * 7 + 16) / 2}, ${curve.midPoint.y - 12})`}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                    setEditingLineId(ann.id);
                    setEditingText(ann.label || '');
                  }}
                >
                  <title>Double-click to edit label</title>
                  <rect
                    x={0}
                    y={0}
                    width={Math.max(40, ann.label.length * 7 + 16)}
                    height={22}
                    rx={11}
                    fill="#ffffff"
                    stroke={isSelected ? '#2563eb' : stroke}
                    strokeWidth={isSelected ? 1.5 : 1}
                    className="shadow-sm"
                  />
                  <text
                    x={Math.max(40, ann.label.length * 7 + 16) / 2}
                    y={15}
                    textAnchor="middle"
                    fill="#334155"
                    fontSize={11}
                    fontWeight={500}
                    style={{ userSelect: 'none' }}
                  >
                    {ann.label}
                  </text>
                </g>
              ) : (
                /* Empty Label Button / Pill */
                <g
                  transform={`translate(${curve.midPoint.x - 24}, ${curve.midPoint.y - 11})`}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                    setEditingLineId(ann.id);
                    setEditingText('');
                  }}
                >
                  <title>Click to write label on line</title>
                  <rect
                    x={0}
                    y={0}
                    width={48}
                    height={22}
                    rx={11}
                    fill="#ffffff"
                    stroke={isSelected ? '#2563eb' : '#cbd5e1'}
                    strokeWidth={isSelected ? 1.5 : 1}
                    strokeDasharray={isSelected ? undefined : '3,2'}
                    className="shadow-sm hover:border-blue-400"
                  />
                  <text
                    x={24}
                    y={15}
                    textAnchor="middle"
                    fill={isSelected ? '#2563eb' : '#94a3b8'}
                    fontSize={11}
                    fontWeight={500}
                    style={{ userSelect: 'none' }}
                  >
                    {isSelected ? '+ Text' : '...'}
                  </text>
                </g>
              )}

              {/* Floating Quick Action Toolbar when Selected */}
              {isSelected && (
                <foreignObject
                  x={curve.midPoint.x - 140}
                  y={curve.midPoint.y - 44}
                  width={280}
                  height={38}
                  className="overflow-visible pointer-events-auto"
                >
                  <div
                    className="w-full h-full flex items-center justify-center"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex items-center gap-1 bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-lg rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-700 select-none animate-fadeIn">
                      {/* Curvature Mode Button */}
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded hover:bg-slate-100 flex items-center gap-1 transition-colors text-blue-600 font-semibold cursor-pointer"
                        title="Toggle Curvature: Gentle / Deep / Inverted / Straight"
                        onClick={() => {
                          const cur = ann.style?.curvature ?? 1;
                          const next = cur === 1 ? 2 : cur === 2 ? -1 : cur === -1 ? 0 : 1;
                          onUpdateAnnotation?.(ann.id, {
                            style: { ...(ann.style || {}), curvature: next },
                          });
                        }}
                      >
                        {(ann.style?.curvature ?? 1) === 0
                          ? '─ Straight'
                          : (ann.style?.curvature ?? 1) === 2
                          ? '⌢ Deep'
                          : (ann.style?.curvature ?? 1) === -1
                          ? '⌣ Inverted'
                          : '⌒ Gentle'}
                      </button>

                      <div className="w-[1px] h-3 bg-slate-200" />

                      {/* Line Style Button */}
                      <button
                        type="button"
                        className="px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors text-slate-600 cursor-pointer"
                        title="Toggle Line Style (Solid / Dashed)"
                        onClick={() => {
                          const nextStyle =
                            (ann.style?.lineStyle || 'dashed') === 'dashed' ? 'solid' : 'dashed';
                          onUpdateAnnotation?.(ann.id, {
                            style: { ...(ann.style || {}), lineStyle: nextStyle },
                          });
                        }}
                      >
                        {(ann.style?.lineStyle || 'dashed') === 'dashed' ? 'Dashed' : 'Solid'}
                      </button>

                      <div className="w-[1px] h-3 bg-slate-200" />

                      {/* Arrowhead Mode Button */}
                      <button
                        type="button"
                        className="px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors text-slate-600 cursor-pointer"
                        title="Toggle Arrowheads (Single / Double / None)"
                        onClick={() => {
                          const start = Boolean(ann.style?.arrowStart);
                          const end = ann.style?.arrowEnd !== false;
                          let nextStart = false;
                          let nextEnd = true;
                          if (!start && end) {
                            nextStart = true;
                            nextEnd = true;
                          } else if (start && end) {
                            nextStart = false;
                            nextEnd = false;
                          } else {
                            nextStart = false;
                            nextEnd = true;
                          }
                          onUpdateAnnotation?.(ann.id, {
                            style: { ...(ann.style || {}), arrowStart: nextStart, arrowEnd: nextEnd },
                          });
                        }}
                      >
                        {Boolean(ann.style?.arrowStart) && ann.style?.arrowEnd !== false
                          ? '↔ Both'
                          : ann.style?.arrowEnd === false && !ann.style?.arrowStart
                          ? '─ None'
                          : '→ Arrow'}
                      </button>

                      <div className="w-[1px] h-3 bg-slate-200" />

                      {/* Edit Label Button */}
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
                        title="Edit Label"
                        onClick={() => {
                          setEditingLineId(ann.id);
                          setEditingText(ann.label || '');
                        }}
                      >
                        <Type size={12} />
                      </button>

                      {/* Delete Button */}
                      {onDeleteAnnotation && (
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          title="Delete Line"
                          onClick={() => {
                            onDeleteAnnotation(ann.id);
                            onSelectAnnotation(null);
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}

      {/* 4. Targeting Mode Preview Line */}
      {targetingPreview}
    </svg>
  );
};

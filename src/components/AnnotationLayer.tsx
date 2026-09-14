import React, { useRef } from 'react';
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
}

export const AnnotationLayer: React.FC<AnnotationLayerProps> = ({
  annotations = [],
  nodes,
  selectedAnnotationId,
  onSelectAnnotation,
  targetingSourceNodeId,
  targetingMousePos,
  onControlPointDrag,
}) => {
  const draggingHandleRef = useRef<{
    annotationId: string;
    which: 'c1' | 'c2';
    startX: number;
    startY: number;
    initialOffset: { dx: number; dy: number };
  } | null>(null);

  const handlePointerDownHandle = (
    e: React.PointerEvent,
    annotation: RelationshipLineAnnotation,
    which: 'c1' | 'c2'
  ) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);

    const initialOffset =
      which === 'c1'
        ? { dx: annotation.route?.c1Offset?.dx || 0, dy: annotation.route?.c1Offset?.dy || 0 }
        : { dx: annotation.route?.c2Offset?.dx || 0, dy: annotation.route?.c2Offset?.dy || 0 };

    draggingHandleRef.current = {
      annotationId: annotation.id,
      which,
      startX: e.clientX,
      startY: e.clientY,
      initialOffset,
    };
  };

  const handlePointerMoveHandle = (e: React.PointerEvent) => {
    if (!draggingHandleRef.current || !onControlPointDrag) return;
    const { annotationId, which, startX, startY, initialOffset } = draggingHandleRef.current;
    const dx = e.clientX - startX + initialOffset.dx;
    const dy = e.clientY - startY + initialOffset.dy;
    onControlPointDrag(annotationId, which, { dx, dy });
  };

  const handlePointerUpHandle = (e: React.PointerEvent) => {
    if (draggingHandleRef.current) {
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      draggingHandleRef.current = null;
    }
  };

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
    const curvature = Math.max(30, Math.min(140, dist * 0.35));

    const c1 = isRightward ? { x: p1.x + curvature, y: p1.y } : { x: p1.x - curvature, y: p1.y };
    const c2 = isRightward ? { x: p2.x - curvature, y: p2.y } : { x: p2.x + curvature, y: p2.y };
    const pathD = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;

    return (
      <g className="targeting-preview-line animate-pulse pointer-events-none">
        <path
          d={pathD}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={2.5}
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
      className="absolute pointer-events-none overflow-visible"
      style={{ top: 0, left: 0, width: 0, height: 0, zIndex: 0 }}
      onPointerMove={handlePointerMoveHandle}
      onPointerUp={handlePointerUpHandle}
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

              {/* Optional Label Pill at Midpoint */}
              {ann.label && (
                <g
                  transform={`translate(${curve.midPoint.x - (ann.label.length * 7 + 16) / 2}, ${curve.midPoint.y - 12})`}
                  className="pointer-events-auto cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAnnotation(ann.id);
                  }}
                >
                  <rect
                    x={0}
                    y={0}
                    width={Math.max(40, ann.label.length * 7 + 16)}
                    height={22}
                    rx={11}
                    fill="#ffffff"
                    stroke={isSelected ? '#2563eb' : stroke}
                    strokeWidth={1}
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
              )}

              {/* Interactive Control Points when Selected */}
              {isSelected && (
                <g className="rel-line-controls pointer-events-auto">
                  {/* Guide lines to control points */}
                  <line
                    x1={curve.p1.x}
                    y1={curve.p1.y}
                    x2={curve.c1.x}
                    y2={curve.c1.y}
                    stroke="#94a3b8"
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />
                  <line
                    x1={curve.p2.x}
                    y1={curve.p2.y}
                    x2={curve.c2.x}
                    y2={curve.c2.y}
                    stroke="#94a3b8"
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />

                  {/* Handle C1 */}
                  <circle
                    cx={curve.c1.x}
                    cy={curve.c1.y}
                    r={6}
                    fill="#ffffff"
                    stroke="#2563eb"
                    strokeWidth={2}
                    className="cursor-move hover:scale-125 transition-transform"
                    onPointerDown={(e) => handlePointerDownHandle(e, ann, 'c1')}
                  />

                  {/* Handle C2 */}
                  <circle
                    cx={curve.c2.x}
                    cy={curve.c2.y}
                    r={6}
                    fill="#ffffff"
                    stroke="#2563eb"
                    strokeWidth={2}
                    className="cursor-move hover:scale-125 transition-transform"
                    onPointerDown={(e) => handlePointerDownHandle(e, ann, 'c2')}
                  />
                </g>
              )}
            </g>
          );
        })}

      {/* 4. Targeting Mode Preview Line */}
      {targetingPreview}
    </svg>
  );
};

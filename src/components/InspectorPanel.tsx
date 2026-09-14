import React from 'react';
import {
  CanonicalDocument,
  CanonicalNode,
  NodeShape,
  DocumentTheme,
  MindMapAnnotation,
  BoundaryAnnotation,
  BraceAnnotation,
  RelationshipLineAnnotation,
} from '../model/types';
import { BUILTIN_THEMES, PaletteDefinition } from '../model/theme';
import { canApplyNumbering } from '../model/numbering';
import { PRESET_ICONS } from '../model/icons';
import {
  PanelRightClose,
  RotateCcw,
  Palette,
  Layers,
  Image as ImageIcon,
  Trash2,
  Upload,
  ChevronDown,
  Smile,
  Bookmark,
  GitCommit,
  Share2,
} from 'lucide-react';

export interface InspectorPanelProps {
  document: CanonicalDocument;
  selectedNode: CanonicalNode | null;
  selectedAnnotation?: MindMapAnnotation | null;
  onUpdateAnnotation?: (id: string, updates: Partial<MindMapAnnotation>) => void;
  onDeleteAnnotation?: (id: string) => void;
  onUpdateTheme: (theme: DocumentTheme) => void;
  onUpdateNode: (nodeId: string, updates: Partial<CanonicalNode>) => void;
  onResetNodeStyle: (nodeId: string) => void;
  onCreateGroup?: (title: string, nodeIds: string[]) => void;
  onClose: () => void;
  onAttachImage?: (nodeId: string) => void;
  onChooseIcon?: (nodeId: string, icon?: string) => void;
  onCollapseBranch?: (kind: 'current' | 'siblings' | 'descendants') => void;
  onExpandBranch?: (kind: 'current' | 'siblings' | 'descendants') => void;
  onSelectNodes?: (kind: 'same-branch' | 'all-level') => void;
  onApplyNumbering?: (style: 'none' | 'decimal' | 'roman' | 'alpha') => void;
}

const PRESET_SHAPES: { value: NodeShape; label: string }[] = [
  { value: 'rounded', label: 'Rounded' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'pill', label: 'Pill' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'parallelogram', label: 'Skew' },
  { value: 'circle', label: 'Circle' },
];

const PRESET_COLORS = [
  '#ffffff',
  '#f8fafc',
  '#f1f5f9',
  '#e2e8f0',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#0f172a',
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  document,
  selectedNode,
  selectedAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onUpdateTheme,
  onUpdateNode,
  onResetNodeStyle,
  onCreateGroup,
  onClose,
  onAttachImage,
  onChooseIcon,
  onCollapseBranch,
  onExpandBranch,
  onSelectNodes,
  onApplyNumbering,
}) => {
  const currentTheme = document.theme || {
    paletteId: 'nordic-slate',
    canvasBackground: 'dots',
    fontFamily: 'sans',
    defaultEdgeRouting: 'smoothstep',
    name: 'Nordic Slate',
  };

  const handlePaletteSelect = (paletteKey: string) => {
    const preset: PaletteDefinition | undefined = BUILTIN_THEMES[paletteKey];
    if (preset) {
      onUpdateTheme({
        ...currentTheme,
        paletteId: preset.id,
        name: preset.name,
        edgeColor: preset.edgeColor,
        canvasBgColor: preset.canvasBg,
        primaryColor: preset.primaryAccent,
        secondaryColor: preset.secondaryAccent,
        nodeBackground: preset.nodeBg,
        nodeTextColor: preset.nodeText,
      });
    }
  };

  const handleNodeStyleChange = (key: string, value: string | number | undefined) => {
    if (!selectedNode) return;
    const currentStyle = selectedNode.style || {};
    onUpdateNode(selectedNode.id, {
      style: {
        ...currentStyle,
        [key]: value,
      },
    });
  };

  const handleShapeChange = (shape: NodeShape) => {
    if (!selectedNode) return;
    onUpdateNode(selectedNode.id, {
      shape,
      style: {
        ...(selectedNode.style || {}),
        shape,
      },
    });
  };

  return (
    <aside
      aria-label="Inspector Panel"
      className="w-72 h-full bg-slate-50 border-l border-slate-200 flex flex-col shrink-0 z-10 overflow-y-auto transition-all duration-200 select-none"
    >
      {/* Header */}
      <div className="h-11 px-3.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <Palette size={14} className="text-slate-600" />
          <span className="text-xs font-bold text-slate-800 tracking-wider">
            INSPECTOR
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-mono">Ctrl+/</span>
          <button
            onClick={onClose}
            title="Collapse Inspector (Ctrl+/)"
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
          >
            <PanelRightClose size={14} />
          </button>
        </div>
      </div>

      <div className="p-2.5 space-y-2 flex-1">
        {/* Section 0: Selected Annotation Properties */}
        {selectedAnnotation && (
          <details className="border border-blue-200 rounded-lg bg-white overflow-hidden shadow-2xs" open>
            <summary className="px-3 py-2.5 bg-blue-50/70 flex items-center justify-between cursor-pointer text-xs font-bold text-blue-900 hover:bg-blue-100 transition-colors">
              <div className="flex items-center gap-1.5">
                {selectedAnnotation.kind === 'boundary' && <Bookmark size={13} className="text-blue-600" />}
                {selectedAnnotation.kind === 'brace' && <Share2 size={13} className="text-blue-600" />}
                {selectedAnnotation.kind === 'relationshipLine' && <GitCommit size={13} className="text-blue-600" />}
                <span className="capitalize">{selectedAnnotation.kind === 'relationshipLine' ? 'Relationship Line' : selectedAnnotation.kind}</span>
              </div>
              <div className="flex items-center gap-2">
                {onDeleteAnnotation && (
                  <button
                    type="button"
                    title="Delete Annotation"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteAnnotation(selectedAnnotation.id);
                    }}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                <ChevronDown size={13} className="text-slate-400 transition-transform details-arrow" />
              </div>
            </summary>
            <div className="p-3 border-t border-blue-100 space-y-3 text-xs">
              {/* Boundary Annotation Controls */}
              {selectedAnnotation.kind === 'boundary' && (() => {
                const b = selectedAnnotation as BoundaryAnnotation;
                const bStyle = b.style || {};
                return (
                  <>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                        Badge Title
                      </label>
                      <input
                        type="text"
                        value={b.title || ''}
                        onChange={(e) => onUpdateAnnotation?.(b.id, { title: e.target.value })}
                        placeholder="Boundary Title"
                        className="w-full text-xs px-2 py-1 bg-slate-50 border border-slate-200 rounded focus:border-blue-400 focus:bg-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                        Border Style
                      </label>
                      <div className="grid grid-cols-2 gap-1">
                        {(['dashed', 'solid'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() =>
                              onUpdateAnnotation?.(b.id, {
                                style: { ...bStyle, borderStyle: st },
                              })
                            }
                            className={`text-[11px] py-1 px-2 rounded border capitalize ${
                              (bStyle.borderStyle || 'dashed') === st
                                ? 'bg-blue-50 border-blue-400 text-blue-700 font-bold'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                        Border Color
                      </label>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() =>
                              onUpdateAnnotation?.(b.id, {
                                style: { ...bStyle, borderColor: c, fillColor: c },
                              })
                            }
                            className="w-4 h-4 rounded-full border border-slate-300 hover:scale-110 transition-transform"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
                        <span>Fill Opacity</span>
                        <span>{Math.round((bStyle.fillOpacity ?? 0.06) * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="0.4"
                        step="0.02"
                        value={bStyle.fillOpacity ?? 0.06}
                        onChange={(e) =>
                          onUpdateAnnotation?.(b.id, {
                            style: { ...bStyle, fillOpacity: parseFloat(e.target.value) },
                          })
                        }
                        className="w-full accent-blue-600"
                      />
                    </div>
                  </>
                );
              })()}

              {/* Brace Annotation Controls */}
              {selectedAnnotation.kind === 'brace' && (() => {
                const br = selectedAnnotation as BraceAnnotation;
                const brStyle = br.style || {};
                return (
                  <>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                        Summary Label
                      </label>
                      <input
                        type="text"
                        value={br.label || ''}
                        onChange={(e) => onUpdateAnnotation?.(br.id, { label: e.target.value })}
                        placeholder="Summary text"
                        className="w-full text-xs px-2 py-1 bg-slate-50 border border-slate-200 rounded focus:border-blue-400 focus:bg-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                        Brace Color
                      </label>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() =>
                              onUpdateAnnotation?.(br.id, {
                                style: { ...brStyle, color: c },
                              })
                            }
                            className="w-4 h-4 rounded-full border border-slate-300 hover:scale-110 transition-transform"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
                        <span>Line Thickness</span>
                        <span>{brStyle.strokeWidth ?? 2}px</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={brStyle.strokeWidth ?? 2}
                        onChange={(e) =>
                          onUpdateAnnotation?.(br.id, {
                            style: { ...brStyle, strokeWidth: parseInt(e.target.value, 10) },
                          })
                        }
                        className="w-full accent-blue-600"
                      />
                    </div>
                  </>
                );
              })()}

              {/* Relationship Line Annotation Controls */}
              {selectedAnnotation.kind === 'relationshipLine' && (() => {
                const rel = selectedAnnotation as RelationshipLineAnnotation;
                const relStyle = rel.style || {};
                return (
                  <>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                        Line Label
                      </label>
                      <input
                        type="text"
                        value={rel.label || ''}
                        onChange={(e) => onUpdateAnnotation?.(rel.id, { label: e.target.value })}
                        placeholder="Relationship description"
                        className="w-full text-xs px-2 py-1 bg-slate-50 border border-slate-200 rounded focus:border-blue-400 focus:bg-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                        Line Style
                      </label>
                      <div className="grid grid-cols-2 gap-1">
                        {(['dashed', 'solid'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() =>
                              onUpdateAnnotation?.(rel.id, {
                                style: { ...relStyle, lineStyle: st },
                              })
                            }
                            className={`text-[11px] py-1 px-2 rounded border capitalize ${
                              (relStyle.lineStyle || 'dashed') === st
                                ? 'bg-blue-50 border-blue-400 text-blue-700 font-bold'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                        Line Color
                      </label>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() =>
                              onUpdateAnnotation?.(rel.id, {
                                style: { ...relStyle, stroke: c },
                              })
                            }
                            className="w-4 h-4 rounded-full border border-slate-300 hover:scale-110 transition-transform"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Curvature Mode Presets */}
                    <div>
                      <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
                        <span>Curvature</span>
                        <span className="font-mono text-[10px]">
                          {(relStyle.curvature ?? 1) === 0
                            ? 'Straight'
                            : (relStyle.curvature ?? 1) === 2
                            ? 'Deep Arc'
                            : (relStyle.curvature ?? 1) === -1
                            ? 'Inverted Arc'
                            : 'Gentle Arc'}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 mb-1.5">
                        {[
                          { label: 'Straight', val: 0 },
                          { label: 'Gentle', val: 1 },
                          { label: 'Deep', val: 2 },
                          { label: 'Invert', val: -1 },
                        ].map((cv) => {
                          const isActive = (relStyle.curvature ?? 1) === cv.val;
                          return (
                            <button
                              key={cv.label}
                              type="button"
                              onClick={() =>
                                onUpdateAnnotation?.(rel.id, {
                                  style: { ...relStyle, curvature: cv.val },
                                })
                              }
                              className={`text-[10px] py-1 rounded border font-medium ${
                                isActive
                                  ? 'bg-blue-50 border-blue-400 text-blue-700 font-bold'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {cv.label}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="range"
                        min="-1.5"
                        max="2.5"
                        step="0.1"
                        value={relStyle.curvature ?? 1}
                        onChange={(e) =>
                          onUpdateAnnotation?.(rel.id, {
                            style: { ...relStyle, curvature: parseFloat(e.target.value) },
                          })
                        }
                        className="w-full accent-blue-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1">
                        <span>Line Thickness</span>
                        <span>{relStyle.strokeWidth ?? 1.5}px</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="6"
                        step="0.5"
                        value={relStyle.strokeWidth ?? 1.5}
                        onChange={(e) =>
                          onUpdateAnnotation?.(rel.id, {
                            style: { ...relStyle, strokeWidth: parseFloat(e.target.value) },
                          })
                        }
                        className="w-full accent-blue-600"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[11px] font-semibold text-slate-500">
                          Arrowheads & Direction
                        </label>
                        <button
                          type="button"
                          title="Swap source and target nodes"
                          onClick={() => {
                            onUpdateAnnotation?.(rel.id, {
                              sourceNodeId: rel.targetNodeId,
                              targetNodeId: rel.sourceNodeId,
                            });
                          }}
                          className="text-[10px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-medium transition-colors"
                        >
                          ⇄ Reverse Direction
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateAnnotation?.(rel.id, {
                              style: { ...relStyle, arrowStart: !relStyle.arrowStart },
                            })
                          }
                          className={`text-[11px] py-1 px-2 rounded border ${
                            relStyle.arrowStart
                              ? 'bg-blue-50 border-blue-400 text-blue-700 font-bold'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Start Arrow
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateAnnotation?.(rel.id, {
                              style: { ...relStyle, arrowEnd: relStyle.arrowEnd === false },
                            })
                          }
                          className={`text-[11px] py-1 px-2 rounded border ${
                            relStyle.arrowEnd !== false
                              ? 'bg-blue-50 border-blue-400 text-blue-700 font-bold'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          End Arrow
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </details>
        )}

        {/* Section 1: Node Appearance */}
        <details className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-2xs" open={Boolean(selectedNode && !selectedAnnotation)}>
          <summary className="px-3 py-2.5 bg-slate-50/70 flex items-center justify-between cursor-pointer text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors">
            <span>Node Appearance</span>
            <ChevronDown size={13} className="text-slate-400 transition-transform details-arrow" />
          </summary>
          <div className="p-3 border-t border-slate-200 space-y-3.5">
            {selectedNode ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1 pr-2">
                    <span className="text-[11px] font-bold text-slate-700 block">Selected Node</span>
                    <p className="text-[11px] text-slate-400 truncate">
                      {selectedNode.text || selectedNode.id}
                    </p>
                  </div>
                  <button
                    onClick={() => onResetNodeStyle(selectedNode.id)}
                    title="Reset node style to theme defaults"
                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-600 px-2 py-0.5 bg-slate-50 border border-slate-200 hover:border-blue-300 rounded shadow-2xs transition-colors shrink-0"
                  >
                    <RotateCcw size={10} />
                    Reset
                  </button>
                </div>

                {/* Shape Selector */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    Shape
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {PRESET_SHAPES.map((s) => {
                      const isActive = (selectedNode.shape || selectedNode.style?.shape || 'rounded') === s.value;
                      return (
                        <button
                          key={s.value}
                          onClick={() => handleShapeChange(s.value)}
                          className={`text-[11px] py-1 px-1.5 rounded font-medium border text-center transition-all ${
                            isActive
                              ? 'bg-blue-50 border-blue-400 text-blue-700 font-bold'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Fill Color */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    Fill Color
                  </label>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => handleNodeStyleChange('backgroundColor', c)}
                        className="w-4.5 h-4.5 rounded-full border border-slate-300 shadow-2xs transition-transform hover:scale-115"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={selectedNode.style?.backgroundColor || '#ffffff'}
                      onChange={(e) => handleNodeStyleChange('backgroundColor', e.target.value)}
                      className="w-6 h-6 rounded border border-slate-300 cursor-pointer p-0"
                    />
                    <input
                      type="text"
                      value={selectedNode.style?.backgroundColor || ''}
                      placeholder="Theme Default"
                      onChange={(e) => handleNodeStyleChange('backgroundColor', e.target.value)}
                      className="flex-1 text-[11px] px-2 py-0.5 bg-slate-50 border border-slate-200 rounded font-mono"
                    />
                  </div>
                </div>

                {/* Border Color & Width */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    Border
                  </label>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <input
                      type="color"
                      value={selectedNode.style?.borderColor || '#cbd5e1'}
                      onChange={(e) => handleNodeStyleChange('borderColor', e.target.value)}
                      className="w-6 h-6 rounded border border-slate-300 cursor-pointer p-0"
                    />
                    <input
                      type="text"
                      value={selectedNode.style?.borderColor || ''}
                      placeholder="Border Hex"
                      onChange={(e) => handleNodeStyleChange('borderColor', e.target.value)}
                      className="flex-1 text-[11px] px-2 py-0.5 bg-slate-50 border border-slate-200 rounded font-mono"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span className="text-[10px] text-slate-400">Width: {selectedNode.style?.borderWidth ?? 2}px</span>
                    <input
                      type="range"
                      min="0"
                      max="8"
                      value={selectedNode.style?.borderWidth ?? 2}
                      onChange={(e) => handleNodeStyleChange('borderWidth', parseInt(e.target.value, 10))}
                      className="w-24 accent-blue-600"
                    />
                  </div>
                </div>

                {/* Typography */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    Typography
                  </label>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <input
                      type="color"
                      value={selectedNode.style?.textColor || '#1e293b'}
                      onChange={(e) => handleNodeStyleChange('textColor', e.target.value)}
                      className="w-6 h-6 rounded border border-slate-300 cursor-pointer p-0"
                    />
                    <input
                      type="text"
                      value={selectedNode.style?.textColor || ''}
                      placeholder="Text Color"
                      onChange={(e) => handleNodeStyleChange('textColor', e.target.value)}
                      className="flex-1 text-[11px] px-2 py-0.5 bg-slate-50 border border-slate-200 rounded font-mono"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span className="text-[10px] text-slate-400">Font Size: {selectedNode.style?.fontSize ?? 14}px</span>
                    <input
                      type="range"
                      min="11"
                      max="28"
                      value={selectedNode.style?.fontSize ?? 14}
                      onChange={(e) => handleNodeStyleChange('fontSize', parseInt(e.target.value, 10))}
                      className="w-24 accent-blue-600"
                    />
                  </div>
                </div>

                {/* Node Sizing Note */}
                <div className="pt-1.5 border-t border-slate-100 text-[10px] text-slate-400 leading-relaxed">
                  <span className="font-semibold text-slate-500">Node Sizing: </span>
                  Text-first auto sizing. Hover left/right border to resize manually; height remains text-aware. Manual width persists across save/reload.
                </div>
              </>
            ) : (
              <div className="py-3 text-center text-[11px] text-slate-400">
                Select a node on the canvas to inspect its style.
              </div>
            )}
          </div>
        </details>

        {/* Section 2: Media & Grouping */}
        <details className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-2xs">
          <summary className="px-3 py-2.5 bg-slate-50/70 flex items-center justify-between cursor-pointer text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors">
            <span>Media & Grouping</span>
            <ChevronDown size={13} className="text-slate-400 transition-transform details-arrow" />
          </summary>
          <div className="p-3 border-t border-slate-200 space-y-2.5">
            {/* Image Attachment */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1 flex items-center gap-1">
                <ImageIcon size={11} className="text-blue-500" />
                Image Attachment
              </label>
              {selectedNode?.assetRef ? (
                <div className="space-y-1.5">
                  <div className="w-full h-20 rounded bg-slate-50 border border-slate-200 flex items-center justify-center overflow-hidden">
                    <img
                      src={selectedNode.assetRef}
                      alt="Attachment Preview"
                      className="h-full object-contain"
                    />
                  </div>
                  <button
                    onClick={() => onUpdateNode(selectedNode.id, { assetRef: undefined })}
                    className="w-full py-1 px-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] font-medium rounded border border-rose-200 transition-colors flex items-center justify-center gap-1"
                  >
                    <Trash2 size={11} />
                    Remove Image
                  </button>
                </div>
              ) : onAttachImage && selectedNode ? (
                <button
                  type="button"
                  onClick={() => onAttachImage(selectedNode.id)}
                  className="w-full py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-medium rounded border border-slate-200 border-dashed transition-colors flex items-center justify-center gap-1.5"
                >
                  <Upload size={12} className="text-slate-500" />
                  <span>⇧ Attach Image…</span>
                </button>
              ) : (
                <label className="w-full py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-medium rounded border border-slate-200 border-dashed transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload size={12} className="text-slate-500" />
                  <span>⇧ Attach Image…</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file || !selectedNode) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const dataUrl = ev.target?.result as string;
                        onUpdateNode(selectedNode.id, { assetRef: dataUrl });
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              )}
            </div>

            {/* Icon Picker */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Smile size={11} className="text-amber-500" />
                  Node Icon
                </span>
                {selectedNode?.icon && (
                  <button
                    type="button"
                    onClick={() => selectedNode && (onChooseIcon ? onChooseIcon(selectedNode.id, undefined) : onUpdateNode(selectedNode.id, { icon: undefined }))}
                    className="text-[10px] text-rose-500 hover:text-rose-700 flex items-center gap-0.5"
                    title="Remove Icon"
                  >
                    <Trash2 size={10} />
                    Remove
                  </button>
                )}
              </label>

              {selectedNode?.icon && (
                <div className="flex items-center gap-2 p-1.5 bg-blue-50/60 border border-blue-200 rounded text-xs mb-1.5">
                  <span className="text-lg leading-none">{selectedNode.icon}</span>
                  <span className="text-[11px] text-blue-800 font-medium">Active Topic Icon</span>
                </div>
              )}

              <div className="grid grid-cols-5 gap-1 pt-0.5">
                {PRESET_ICONS.map(({ emoji, label }) => {
                  const isSelected = selectedNode?.icon === emoji;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      disabled={!selectedNode}
                      title={label}
                      onClick={() => selectedNode && (onChooseIcon ? onChooseIcon(selectedNode.id, isSelected ? undefined : emoji) : onUpdateNode(selectedNode.id, { icon: isSelected ? undefined : emoji }))}
                      className={`h-7 flex items-center justify-center text-sm rounded border transition-all disabled:opacity-40 ${
                        isSelected
                          ? 'bg-blue-100 border-blue-500 scale-105 shadow-2xs font-bold'
                          : 'bg-slate-50 hover:bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Group Container */}
            {onCreateGroup && (
              <div className="pt-1">
                <button
                  disabled={!selectedNode}
                  onClick={() => selectedNode && onCreateGroup('Process Group', [selectedNode.id])}
                  className="w-full py-1.5 px-2 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-[11px] font-medium rounded border border-slate-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Layers size={12} />
                  ▣ Wrap in Group Container
                </button>
              </div>
            )}
          </div>
        </details>

        {/* Section 3: Structure & Branch */}
        <details className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-2xs">
          <summary className="px-3 py-2.5 bg-slate-50/70 flex items-center justify-between cursor-pointer text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors">
            <span>Structure & Branch</span>
            <ChevronDown size={13} className="text-slate-400 transition-transform details-arrow" />
          </summary>
          <div className="p-3 border-t border-slate-200 space-y-2.5">
            {/* Branch Visibility */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                Branch Visibility
              </label>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => onCollapseBranch?.('current')}
                  className="text-[11px] py-1 px-2 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium"
                >
                  Collapse
                </button>
                <button
                  onClick={() => onExpandBranch?.('current')}
                  className="text-[11px] py-1 px-2 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium"
                >
                  Expand
                </button>
              </div>
            </div>

            {/* Selection */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                Selection
              </label>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => onSelectNodes?.('same-branch')}
                  className="text-[11px] py-1 px-2 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium"
                >
                  Peers
                </button>
                <button
                  onClick={() => onSelectNodes?.('all-level')}
                  className="text-[11px] py-1 px-2 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium"
                >
                  Level
                </button>
              </div>
            </div>

            {/* Numbering -- M3 Behavior Correction Contract: parent-scoped
                from the selected node, disabled when it has no children. */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                Numbering
              </label>
              <div className="grid grid-cols-4 gap-1">
                {(() => {
                  const enabled = canApplyNumbering(document, selectedNode?.id);
                  return (['decimal', 'roman', 'alpha', 'none'] as const).map((style) => (
                    <button
                      key={style}
                      disabled={!enabled}
                      title={enabled ? undefined : 'This topic has no children to number'}
                      onClick={() => onApplyNumbering?.(style)}
                      className={`text-[11px] py-1 px-1 rounded border font-medium capitalize ${
                        enabled
                          ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          : 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                      }`}
                    >
                      {style === 'decimal' ? '1,2,3' : style === 'roman' ? 'I,II,III' : style === 'alpha' ? 'a,b,c' : 'None'}
                    </button>
                  ));
                })()}
              </div>
            </div>
          </div>
        </details>

        {/* Section 4: Document Theme & Canvas */}
        <details className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-2xs" open>
          <summary className="px-3 py-2.5 bg-slate-50/70 flex items-center justify-between cursor-pointer text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors">
            <span>Document Theme & Canvas</span>
            <ChevronDown size={13} className="text-slate-400 transition-transform details-arrow" />
          </summary>
          <div className="p-3 border-t border-slate-200 space-y-3">
            {/* Palette Presets */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                Palette Presets
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(BUILTIN_THEMES).map(([key, theme]: [string, PaletteDefinition]) => {
                  const isActive = currentTheme.paletteId === theme.id || currentTheme.name === theme.name;
                  return (
                    <button
                      key={key}
                      onClick={() => handlePaletteSelect(key)}
                      className={`p-1.5 rounded-md border text-left flex flex-col gap-0.5 transition-all ${
                        isActive
                          ? 'bg-blue-50 border-blue-500 shadow-2xs ring-1 ring-blue-400'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-[11px] font-semibold text-slate-800">{theme.name}</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span
                          className="w-3 h-3 rounded-full border border-slate-200"
                          style={{ backgroundColor: theme.primaryAccent }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border border-slate-200"
                          style={{ backgroundColor: theme.secondaryAccent }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border border-slate-200"
                          style={{ backgroundColor: theme.nodeBg }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Canvas Pattern */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                Canvas Pattern
              </label>
              <div className="grid grid-cols-3 gap-1">
                {(['dots', 'grid', 'blank'] as const).map((bgPattern) => (
                  <button
                    key={bgPattern}
                    onClick={() => onUpdateTheme({ ...currentTheme, canvasBackground: bgPattern })}
                    className={`text-[11px] py-1 px-1.5 rounded border capitalize ${
                      currentTheme.canvasBackground === bgPattern
                        ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {bgPattern}
                  </button>
                ))}
              </div>
            </div>

            {/* Canvas Background Color */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                Canvas Background Color
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={currentTheme.canvasBgColor || '#f8fafc'}
                  onChange={(e) => onUpdateTheme({ ...currentTheme, canvasBgColor: e.target.value })}
                  className="w-6 h-6 rounded border border-slate-300 cursor-pointer p-0"
                />
                <input
                  type="text"
                  value={currentTheme.canvasBgColor || ''}
                  placeholder="Canvas Hex"
                  onChange={(e) => onUpdateTheme({ ...currentTheme, canvasBgColor: e.target.value })}
                  className="flex-1 text-[11px] px-2 py-0.5 bg-slate-50 border border-slate-200 rounded font-mono"
                />
              </div>
            </div>
          </div>
        </details>

        {/* Section 5: Document Info */}
        <details className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-2xs">
          <summary className="px-3 py-2.5 bg-slate-50/70 flex items-center justify-between cursor-pointer text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors">
            <span>Document Info</span>
            <ChevronDown size={13} className="text-slate-400 transition-transform details-arrow" />
          </summary>
          <div className="p-3 border-t border-slate-200 text-[11px] text-slate-500 space-y-1.5">
            <div className="flex justify-between">
              <span>Nodes:</span>
              <strong className="text-slate-800">{document.nodes.length}</strong>
            </div>
            <div className="flex justify-between">
              <span>Connections:</span>
              <strong className="text-slate-800">{document.edges.length}</strong>
            </div>
            <div className="flex justify-between">
              <span>Mode:</span>
              <strong className="text-slate-800 capitalize">{document.mode === 'mindmap' ? 'Mind Map' : 'Flowchart'}</strong>
            </div>
          </div>
        </details>
      </div>

      {/* Footer shortcut tip */}
      <div className="px-3.5 py-2 border-t border-slate-200 text-[10px] text-slate-400 flex items-center justify-between shrink-0 bg-white">
        <span>Toggle Inspector</span>
        <kbd className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-mono text-[10px] border border-slate-200">
          Ctrl+/
        </kbd>
      </div>
    </aside>
  );
};

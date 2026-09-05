import React from 'react';
import { CanonicalDocument, CanonicalNode, NodeShape, DocumentTheme } from '../model/types';
import { BUILTIN_THEMES, PaletteDefinition } from '../model/theme';
import { PanelRightClose, RotateCcw, Palette, Layers, Sparkles, Image as ImageIcon, Trash2, Upload } from 'lucide-react';

interface InspectorPanelProps {
  document: CanonicalDocument;
  selectedNode: CanonicalNode | null;
  onUpdateTheme: (theme: DocumentTheme) => void;
  onUpdateNode: (nodeId: string, updates: Partial<CanonicalNode>) => void;
  onResetNodeStyle: (nodeId: string) => void;
  onCreateGroup?: (title: string, nodeIds: string[]) => void;
  onClose: () => void;
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
  onUpdateTheme,
  onUpdateNode,
  onResetNodeStyle,
  onCreateGroup,
  onClose,
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
      className="w-72 h-full bg-slate-50 border-l border-slate-200 flex flex-col shrink-0 z-10 overflow-y-auto transition-all duration-200"
    >
      {/* Header */}
      <div className="h-12 px-4 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Palette size={14} className="text-slate-600" />
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Inspector
          </span>
        </div>
        <button
          onClick={onClose}
          title="Collapse Inspector (Ctrl+/)"
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
        >
          <PanelRightClose size={15} />
        </button>
      </div>

      <div className="p-4 space-y-6 flex-1">
        {/* Node Styling Section (if node is selected) */}
        {selectedNode ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div>
                <span className="text-xs font-bold text-slate-800">Node Style</span>
                <p className="text-[11px] text-slate-400 truncate max-w-[160px]">
                  {selectedNode.text || selectedNode.id}
                </p>
              </div>
              <button
                onClick={() => onResetNodeStyle(selectedNode.id)}
                title="Reset to Theme Defaults"
                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 px-2 py-1 bg-white border border-slate-200 hover:border-blue-300 rounded shadow-2xs transition-colors"
              >
                <RotateCcw size={11} />
                Reset
              </button>
            </div>

            {/* Shape Selector */}
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                Shape
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {PRESET_SHAPES.map((s) => {
                  const isActive = (selectedNode.shape || selectedNode.style?.shape || 'rounded') === s.value;
                  return (
                    <button
                      key={s.value}
                      onClick={() => handleShapeChange(s.value)}
                      className={`text-xs py-1.5 px-2 rounded font-medium border text-center transition-all ${
                        isActive
                          ? 'bg-blue-50 border-blue-500 text-blue-700 font-semibold shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
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
              <label className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                Fill Color
              </label>
              <div className="flex flex-wrap gap-1 mb-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleNodeStyleChange('backgroundColor', c)}
                    className="w-5 h-5 rounded-full border border-slate-300 shadow-2xs transition-transform hover:scale-110"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={selectedNode.style?.backgroundColor || '#ffffff'}
                  onChange={(e) => handleNodeStyleChange('backgroundColor', e.target.value)}
                  className="w-7 h-7 rounded border border-slate-300 cursor-pointer p-0"
                />
                <input
                  type="text"
                  value={selectedNode.style?.backgroundColor || ''}
                  placeholder="Theme Default"
                  onChange={(e) => handleNodeStyleChange('backgroundColor', e.target.value)}
                  className="flex-1 text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono"
                />
              </div>
            </div>

            {/* Border Color & Width */}
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                Border
              </label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="color"
                  value={selectedNode.style?.borderColor || '#cbd5e1'}
                  onChange={(e) => handleNodeStyleChange('borderColor', e.target.value)}
                  className="w-7 h-7 rounded border border-slate-300 cursor-pointer p-0"
                />
                <input
                  type="text"
                  value={selectedNode.style?.borderColor || ''}
                  placeholder="Border Hex"
                  onChange={(e) => handleNodeStyleChange('borderColor', e.target.value)}
                  className="flex-1 text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Width: {selectedNode.style?.borderWidth ?? 2}px</span>
                <input
                  type="range"
                  min="0"
                  max="8"
                  value={selectedNode.style?.borderWidth ?? 2}
                  onChange={(e) => handleNodeStyleChange('borderWidth', parseInt(e.target.value, 10))}
                  className="w-28"
                />
              </div>
            </div>

            {/* Text Color & Font Size */}
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1.5">
                Typography
              </label>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="color"
                  value={selectedNode.style?.textColor || '#1e293b'}
                  onChange={(e) => handleNodeStyleChange('textColor', e.target.value)}
                  className="w-7 h-7 rounded border border-slate-300 cursor-pointer p-0"
                />
                <input
                  type="text"
                  value={selectedNode.style?.textColor || ''}
                  placeholder="Text Color"
                  onChange={(e) => handleNodeStyleChange('textColor', e.target.value)}
                  className="flex-1 text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono"
                />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Font Size: {selectedNode.style?.fontSize ?? 14}px</span>
                <input
                  type="range"
                  min="11"
                  max="28"
                  value={selectedNode.style?.fontSize ?? 14}
                  onChange={(e) => handleNodeStyleChange('fontSize', parseInt(e.target.value, 10))}
                  className="w-28"
                />
              </div>
            </div>

            {/* Embedded Node Image Attachment */}
            <div className="pt-2 border-t border-slate-200">
              <label className="text-[11px] font-semibold text-slate-600 block mb-1.5 flex items-center gap-1.5">
                <ImageIcon size={12} className="text-blue-500" />
                Image Attachment
              </label>

              {selectedNode.assetRef ? (
                <div className="space-y-2">
                  <div className="w-full h-24 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
                    <img
                      src={selectedNode.assetRef}
                      alt="Attachment Preview"
                      className="h-full object-contain"
                    />
                  </div>
                  <button
                    onClick={() => onUpdateNode(selectedNode.id, { assetRef: undefined })}
                    className="w-full py-1 px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-medium rounded-lg border border-rose-200 transition-colors flex items-center justify-center gap-1"
                  >
                    <Trash2 size={12} />
                    Remove Image
                  </button>
                </div>
              ) : (
                <label className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 border-dashed transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload size={13} className="text-slate-500" />
                  <span>Attach Image...</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
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

            {/* Visual Group Container */}
            {onCreateGroup && (
              <div className="pt-2 border-t border-slate-200">
                <button
                  onClick={() => onCreateGroup('Process Group', [selectedNode.id])}
                  className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Layers size={13} />
                  Wrap in Group Container
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 bg-white border border-slate-200 rounded-lg text-center space-y-1 shadow-2xs">
            <Layers size={18} className="text-slate-400 mx-auto" />
            <div className="text-xs font-semibold text-slate-700">No Node Selected</div>
            <p className="text-[11px] text-slate-400">
              Select a node on the canvas to inspect and customize its shape, borders, and typography.
            </p>
          </div>
        )}

        {/* Document Theme Section */}
        <div className="space-y-4 pt-2 border-t border-slate-200">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-amber-500" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Document Theme
            </span>
          </div>

          {/* Palette Presets */}
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1.5">
              Palette Presets
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(BUILTIN_THEMES).map(([key, theme]: [string, PaletteDefinition]) => {
                const isActive = currentTheme.paletteId === theme.id || currentTheme.name === theme.name;
                return (
                  <button
                    key={key}
                    onClick={() => handlePaletteSelect(key)}
                    className={`p-2 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                      isActive
                        ? 'bg-blue-50 border-blue-500 shadow-2xs ring-1 ring-blue-500'
                        : 'bg-white border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-xs font-medium text-slate-800">{theme.name}</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-slate-200"
                        style={{ backgroundColor: theme.primaryAccent }}
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-slate-200"
                        style={{ backgroundColor: theme.secondaryAccent }}
                      />
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-slate-200"
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
            <label className="text-[11px] font-semibold text-slate-600 block mb-1.5">
              Canvas Pattern
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(['dots', 'grid', 'blank'] as const).map((bgPattern) => (
                <button
                  key={bgPattern}
                  onClick={() => onUpdateTheme({ ...currentTheme, canvasBackground: bgPattern })}
                  className={`text-xs py-1 px-2 rounded border capitalize ${
                    currentTheme.canvasBackground === bgPattern
                      ? 'bg-blue-50 border-blue-500 text-blue-700 font-semibold'
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
            <label className="text-[11px] font-semibold text-slate-600 block mb-1.5">
              Canvas Background Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={currentTheme.canvasBgColor || '#ffffff'}
                onChange={(e) => onUpdateTheme({ ...currentTheme, canvasBgColor: e.target.value })}
                className="w-7 h-7 rounded border border-slate-300 cursor-pointer p-0"
              />
              <input
                type="text"
                value={currentTheme.canvasBgColor || ''}
                placeholder="Canvas Hex"
                onChange={(e) => onUpdateTheme({ ...currentTheme, canvasBgColor: e.target.value })}
                className="flex-1 text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono"
              />
            </div>
          </div>

          {/* Connector Line Color */}
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1.5">
              Edge Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={currentTheme.edgeColor || '#94a3b8'}
                onChange={(e) => onUpdateTheme({ ...currentTheme, edgeColor: e.target.value })}
                className="w-7 h-7 rounded border border-slate-300 cursor-pointer p-0"
              />
              <input
                type="text"
                value={currentTheme.edgeColor || ''}
                placeholder="Edge Hex"
                onChange={(e) => onUpdateTheme({ ...currentTheme, edgeColor: e.target.value })}
                className="flex-1 text-xs px-2 py-1 bg-white border border-slate-200 rounded font-mono"
              />
            </div>
          </div>

          {/* Edge Routing Style */}
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1.5">
              Default Edge Routing
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(['smoothstep', 'orthogonal', 'bezier'] as const).map((routing) => (
                <button
                  key={routing}
                  onClick={() => onUpdateTheme({ ...currentTheme, defaultEdgeRouting: routing })}
                  className={`text-xs py-1 px-1.5 rounded border capitalize ${
                    (currentTheme.defaultEdgeRouting || 'smoothstep') === routing
                      ? 'bg-blue-50 border-blue-500 text-blue-700 font-semibold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {routing === 'smoothstep' ? 'Smooth' : routing === 'orthogonal' ? 'Ortho' : 'Curved'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Document Stats */}
        <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-400 space-y-1">
          <div className="flex justify-between">
            <span>Nodes:</span>
            <span className="font-semibold text-slate-600">{document.nodes.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Connections:</span>
            <span className="font-semibold text-slate-600">{document.edges.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Mode:</span>
            <span className="font-semibold text-slate-600 capitalize">{document.mode}</span>
          </div>
        </div>
      </div>

      {/* Footer shortcut tip */}
      <div className="px-3 py-2 border-t border-slate-200 text-[10px] text-slate-400 flex items-center justify-between shrink-0">
        <span>Toggle Inspector</span>
        <kbd className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded font-mono">
          Ctrl+/
        </kbd>
      </div>
    </aside>
  );
};

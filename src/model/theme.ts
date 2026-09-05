import { CanonicalNode, DocumentTheme, NodeShape } from './types';

export interface PaletteDefinition {
  id: string;
  name: string;
  canvasBg: string;
  nodeBg: string;
  nodeBorder: string;
  nodeText: string;
  rootBg: string;
  rootBorder: string;
  rootText: string;
  primaryAccent: string;
  secondaryAccent: string;
  edgeColor: string;
  // Aliases for component convenience
  canvasBackground: string;
  nodeBackground: string;
  nodeTextColor: string;
  primaryColor: string;
  secondaryColor: string;
}

export const THEME_PALETTES: Record<string, PaletteDefinition> = {
  'nordic-slate': {
    id: 'nordic-slate',
    name: 'Nordic Slate',
    canvasBg: '#f8fafc',
    nodeBg: '#ffffff',
    nodeBorder: '#cbd5e1',
    nodeText: '#0f172a',
    rootBg: '#2563eb',
    rootBorder: '#1d4ed8',
    rootText: '#ffffff',
    primaryAccent: '#3b82f6',
    secondaryAccent: '#64748b',
    edgeColor: '#94a3b8',
    canvasBackground: '#f8fafc',
    nodeBackground: '#ffffff',
    nodeTextColor: '#0f172a',
    primaryColor: '#3b82f6',
    secondaryColor: '#64748b',
  },
  'warm-paper': {
    id: 'warm-paper',
    name: 'Warm Paper',
    canvasBg: '#faf8f5',
    nodeBg: '#ffffff',
    nodeBorder: '#e7e0d6',
    nodeText: '#292524',
    rootBg: '#b45309',
    rootBorder: '#92400e',
    rootText: '#ffffff',
    primaryAccent: '#d97706',
    secondaryAccent: '#78716c',
    edgeColor: '#a8a29e',
    canvasBackground: '#faf8f5',
    nodeBackground: '#ffffff',
    nodeTextColor: '#292524',
    primaryColor: '#d97706',
    secondaryColor: '#78716c',
  },
  'deep-midnight': {
    id: 'deep-midnight',
    name: 'Deep Midnight',
    canvasBg: '#0f172a',
    nodeBg: '#1e293b',
    nodeBorder: '#334155',
    nodeText: '#f1f5f9',
    rootBg: '#0284c7',
    rootBorder: '#0369a1',
    rootText: '#ffffff',
    primaryAccent: '#38bdf8',
    secondaryAccent: '#94a3b8',
    edgeColor: '#475569',
    canvasBackground: '#0f172a',
    nodeBackground: '#1e293b',
    nodeTextColor: '#f1f5f9',
    primaryColor: '#38bdf8',
    secondaryColor: '#94a3b8',
  },
  'forest-sage': {
    id: 'forest-sage',
    name: 'Forest Sage',
    canvasBg: '#f6f8f6',
    nodeBg: '#ffffff',
    nodeBorder: '#d1ded1',
    nodeText: '#142414',
    rootBg: '#2d6a4f',
    rootBorder: '#1b4332',
    rootText: '#ffffff',
    primaryAccent: '#40916c',
    secondaryAccent: '#52796f',
    edgeColor: '#84a98c',
    canvasBackground: '#f6f8f6',
    nodeBackground: '#ffffff',
    nodeTextColor: '#142414',
    primaryColor: '#40916c',
    secondaryColor: '#52796f',
  },
};

export const BUILTIN_THEMES = THEME_PALETTES;

export function getDefaultTheme(mode: 'mindmap' | 'flowchart' = 'mindmap'): DocumentTheme {
  const palette = THEME_PALETTES['nordic-slate'];
  return {
    paletteId: 'nordic-slate',
    canvasBackground: 'dots',
    fontFamily: 'sans',
    defaultEdgeRouting: mode === 'mindmap' ? 'smoothstep' : 'orthogonal',
    name: palette.name,
    edgeColor: palette.edgeColor,
    primaryColor: palette.primaryAccent,
    secondaryColor: palette.secondaryAccent,
    nodeBackground: palette.nodeBg,
    nodeTextColor: palette.nodeText,
  };
}

export function getPalette(paletteId: string): PaletteDefinition {
  return THEME_PALETTES[paletteId] || THEME_PALETTES['nordic-slate'];
}

export interface ResolvedNodeVisuals {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  textColor: string;
  fontSize: number;
  fontFamily: string;
  borderRadius: number;
  shape: NodeShape;
}

/**
 * Two-layer styling resolver:
 * Theme defaults provide baseline; local Inspector style overrides take precedence.
 */
export function resolveNodeVisuals(node: CanonicalNode, theme?: DocumentTheme): ResolvedNodeVisuals {
  const palette = getPalette(theme?.paletteId || 'nordic-slate');
  const isRoot = node.type === 'root';
  const isTerminal = node.type === 'terminal';
  const isDecision = node.type === 'decision';

  const defaultBg = isRoot ? palette.rootBg : palette.nodeBg;
  const defaultBorder = isRoot ? palette.rootBorder : palette.nodeBorder;
  const defaultText = isRoot ? palette.rootText : palette.nodeText;
  const defaultShape: NodeShape = isTerminal ? 'pill' : isDecision ? 'diamond' : 'rounded';
  const defaultRadius = defaultShape === 'pill' ? 24 : defaultShape === 'diamond' ? 2 : 8;

  const local = node.style || {};

  return {
    backgroundColor: local.backgroundColor || defaultBg,
    borderColor: local.borderColor || defaultBorder,
    borderWidth: local.borderWidth ?? (isRoot ? 2 : 1.5),
    textColor: local.textColor || defaultText,
    fontSize: local.fontSize ?? (isRoot ? 16 : 14),
    fontFamily: local.fontFamily || theme?.fontFamily || 'sans',
    borderRadius: local.borderRadius ?? defaultRadius,
    shape: (node.shape || local.shape || defaultShape) as NodeShape,
  };
}

export function resetNodeToTheme(node: CanonicalNode): CanonicalNode {
  const next = { ...node };
  delete next.style;
  delete next.shape;
  return next;
}

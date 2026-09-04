/**
 * Canonical Document Model Types v1.0
 * Completely independent of any UI or canvas rendering library (e.g., React Flow).
 */

export type DocumentMode = 'mindmap' | 'flowchart';

export type NodeShape = 'rectangle' | 'rounded' | 'pill' | 'diamond' | 'parallelogram' | 'circle';

export type NumberingStyle = 'decimal' | 'alpha' | 'roman' | 'bullet' | 'none';

export interface DocumentAsset {
  id: string;
  fileName: string;
  mimeType: string;
  data: Uint8Array;
}

export interface NodeGeometry {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface NodeStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  textColor?: string;
  fontSize?: number;
  fontFamily?: string;
  borderRadius?: number;
  shape?: NodeShape;
}

export interface NodeNumberingRule {
  level1Style?: NumberingStyle;
  level2Style?: NumberingStyle;
}

export interface CanonicalNode {
  id: string;
  text: string;
  geometry: NodeGeometry;
  type?: 'default' | 'root' | 'process' | 'decision' | 'terminal' | 'data';
  parentId?: string; // Hierarchical parent in Mind Map mode
  shape?: NodeShape; // Top-level convenience shape accessor
  assetRef?: string; // Internal URI: "asset://img_<id>.<ext>"
  style?: NodeStyle; // Local property overrides
  numbering?: NodeNumberingRule;
  collapsed?: boolean; // Gather child branches
  manualOffset?: { dx: number; dy: number }; // Preserves fine-tuning post-layout
  data?: Record<string, unknown>;
}

export interface CanonicalEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  type?: 'smoothstep' | 'bezier' | 'straight' | 'orthogonal';
  isCrossLink?: boolean; // Secondary non-hierarchical cross connection in Mind Map mode
  style?: {
    stroke?: string;
    strokeWidth?: number;
    dashed?: boolean;
    arrowEnd?: boolean;
  };
}

export interface CanonicalGroup {
  id: string;
  title: string;
  nodeIds: string[];
  bounds?: { x: number; y: number; width: number; height: number };
  style?: {
    backgroundColor?: string;
    borderColor?: string;
  };
}

export interface ViewportMetadata {
  x: number;
  y: number;
  zoom: number;
}

export interface DocumentTheme {
  paletteId: string;
  canvasBackground: 'blank' | 'dots' | 'grid';
  fontFamily: string;
  defaultEdgeRouting: 'smoothstep' | 'bezier' | 'orthogonal';
  name?: string;
  edgeColor?: string;
  canvasBgColor?: string;
  primaryColor?: string;
  secondaryColor?: string;
  nodeBackground?: string;
  nodeTextColor?: string;
}

export interface CanonicalDocument {
  schemaVersion: '1.0';
  id: string;
  title: string;
  mode: DocumentMode;
  createdAt: string;
  updatedAt: string;
  viewport: ViewportMetadata;
  theme: DocumentTheme;
  nodes: CanonicalNode[];
  edges: CanonicalEdge[];
  groups: CanonicalGroup[];
  metadata?: Record<string, unknown>;
}

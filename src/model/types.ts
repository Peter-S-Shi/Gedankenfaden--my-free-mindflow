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

/**
 * Persisted user intent for a manually-set node size (Product Hardening:
 * Persistent Manual Node Sizing). This is the explicit source of truth for
 * "the user chose this size on purpose" -- layout engines must not infer
 * manual intent from whatever happens to be in `geometry.width`/`height`
 * (that's just the last-computed output, not a record of intent).
 *
 * Mind Map nodes (root and ordinary topics) only ever set `width`: height
 * always stays text-aware-derived from the node's text, font size, and this
 * width (see `computeTextAwareNodeSize`). Flowchart nodes set both `width`
 * and `height` (independent two-dimensional resize; Flowchart geometry is
 * not text-driven).
 */
export interface ManualNodeSize {
  width: number;
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
  maxDepth?: number;
}

export interface CanonicalNode {
  id: string;
  text: string;
  geometry: NodeGeometry;
  type?: 'default' | 'root' | 'process' | 'decision' | 'terminal' | 'data';
  parentId?: string; // Hierarchical parent in Mind Map mode
  shape?: NodeShape; // Top-level convenience shape accessor
  assetRef?: string; // Internal URI: "asset://img_<id>.<ext>"
  icon?: string; // Independent node icon representation (e.g. "💡", "⭐", "🎯")
  style?: NodeStyle; // Local property overrides
  numbering?: NodeNumberingRule;
  collapsed?: boolean; // Gather child branches
  manualOffset?: { dx: number; dy: number }; // Preserves fine-tuning post-layout
  manualSize?: ManualNodeSize; // Preserves a user-driven resize across relayout/save/undo
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

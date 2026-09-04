/**
 * Canonical Document Model Types
 * Completely independent of any UI or canvas rendering library (e.g., React Flow).
 */

export type DocumentMode = 'mindmap' | 'flowchart';

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
  borderRadius?: number;
}

export interface CanonicalNode {
  id: string;
  text: string;
  geometry: NodeGeometry;
  type?: 'default' | 'root' | 'decision' | 'process' | 'terminal';
  parentId?: string; // For mindmap parent-child structural relationship
  style?: NodeStyle;
  data?: Record<string, unknown>;
}

export interface CanonicalEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: 'straight' | 'smoothstep' | 'bezier' | 'orthogonal';
  style?: {
    stroke?: string;
    strokeWidth?: number;
    dashed?: boolean;
  };
}

export interface CanonicalGroup {
  id: string;
  title: string;
  nodeIds: string[];
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

export interface CanonicalDocument {
  schemaVersion: '1.0';
  id: string;
  title: string;
  mode: DocumentMode;
  createdAt: string;
  updatedAt: string;
  viewport: ViewportMetadata;
  nodes: CanonicalNode[];
  edges: CanonicalEdge[];
  groups: CanonicalGroup[];
  metadata?: Record<string, unknown>;
}

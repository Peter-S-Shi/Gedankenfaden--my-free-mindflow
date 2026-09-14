import { DocumentMode } from './types';

/**
 * M3 Behavior Correction Contract (hierarchy-edge ownership): normal Mind
 * Map parent-child edges are algorithm-owned -- users may not drag-create
 * or reconnect them, and there is no manual bend/path editing. Flowchart
 * keeps full manual connectivity. Single source of truth consumed by both
 * `CustomNode` (handle interactivity) and `CanvasEditor` (the `onConnect`
 * gate) so the two policies can't drift apart.
 */
export function allowsManualConnections(mode: DocumentMode): boolean {
  return mode === 'flowchart';
}

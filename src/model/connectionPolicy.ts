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

/** Interaction flags to spread onto a projected React Flow edge object. */
export interface EdgeInteractionFlags {
  selectable?: boolean;
  deletable?: boolean;
  reconnectable?: boolean;
  focusable?: boolean;
  interactionWidth?: number;
}

/**
 * M3 Behavior Correction Contract (hierarchy-edge ownership, second pass):
 * "a parent-child edge is not an interaction object; it is an
 * algorithm-rendered consequence of canonical hierarchy." In Mind Map mode
 * every interaction flag React Flow exposes per-edge is locked off, and the
 * edge's invisible click-catch area is collapsed to zero -- users cannot
 * select, delete, reconnect, or focus a hierarchy edge, full stop. In
 * Flowchart mode no flags are forced, so React Flow's own defaults (and the
 * app's existing flowchart edge behavior) apply unchanged.
 */
export function edgeInteractionFlags(mode: DocumentMode): EdgeInteractionFlags {
  if (allowsManualConnections(mode)) return {};
  return { selectable: false, deletable: false, reconnectable: false, focusable: false, interactionWidth: 0 };
}

/**
 * Defense in depth for `onEdgesChange`, alongside `edgeInteractionFlags`:
 * even if some other path dispatched a select/remove change for a Mind Map
 * edge (bypassing the per-edge flags that normally prevent React Flow from
 * emitting one), it never reaches canonical state. `add`/`replace` changes
 * pass through unaffected in both modes -- they're not user edge-mutation,
 * they're React Flow's own internal bookkeeping.
 */
export function filterEdgeChangesForMode<T extends { type: string }>(changes: T[], mode: DocumentMode): T[] {
  if (allowsManualConnections(mode)) return changes;
  return changes.filter((c) => c.type !== 'select' && c.type !== 'remove');
}

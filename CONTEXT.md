# Gedankenfaden — Domain Glossary

Started during M1-A (production mind-map layout engine). Add to this as
new concepts get named rather than letting them stay implicit in code.

## Canonical Document Model

- **Canonical Document**: the app's own document model
  (`CanonicalDocument`/`CanonicalNode`/`CanonicalEdge` in
  `src/model/types.ts`), independent of any rendering library (React Flow)
  or file format. Everything else (import, layout, canvas projection,
  export) reads or writes this model.
- **Hierarchy**: the tree implied by each node's `parentId`. In `mindmap`
  mode this hierarchy IS the mental model the user is editing; edges are a
  separate, explicit list (not derived from `parentId`) so a future
  cross-link (non-hierarchical edge) can coexist with it.

## Mind Map Layout Engine

- **Band**: the set of nodes sharing the same hierarchy depth and side
  (left/right of the root) in a left-right mind map. A band shares one
  x-coordinate line (the edge facing the root) — this is what "hierarchy
  depth determines the primary growth direction" means concretely.
- **Side**: `'left' | 'right'`, assigned once per node from its top-level
  ancestor's bilateral placement; every node in a subtree shares its
  root-level ancestor's side.
- **Footprint**: a subtree's own rendered vertical extent — its own node
  height, or (if it has visible children) the stacked total of its
  children's footprints. Footprint is what bilateral balance and vertical
  packing are computed from — not descendant *count*.
- **Bilateral balance**: splitting a root's direct children into left and
  right sides so each side's total footprint is as close to equal as
  possible (a greedy longest-processing-time bin balance over footprint
  weight), not by index parity or descendant count.
- **Parent-local recursive packing**: the layout strategy where each
  parent reserves vertical space for its children as a group centered on
  its own Y position, and recurses — as opposed to a fully bottom-up
  tidy-tree that computes children's natural position first and centers
  the parent over them afterward. Chosen (over the bottom-up alternative)
  as the production seam's starting design in M0's Architecture Decision.
- **Fan-out**: how many direct children a single parent has, on one side.
  "High fan-out" (empirically, needing more than the low double digits)
  keeps its children in the *same* band rather than manufacturing fake
  extra hierarchy depth — this is the "same-depth band" invariant holding
  even for wide branches, at the cost of a taller canvas.
- **Fan-out strategy seam**: a decision point (not yet load-bearing in
  production) for what to do when one parent's fan-out is high enough that
  a plain single-column band starts producing badly overlapping edges. Two
  candidate strategies (compact grid packing, radial packing) were
  prototyped in M0 but are not production-ready; see
  `src/model/mindMapLayoutEngine.ts`'s `decideFanoutStrategy`.
- **Text-aware geometry**: a node's width/height computed from its actual
  text (via wrapping) *before* layout positions it, rather than a fixed
  box regardless of text length. The canonical sizing source lives in
  `src/model/textMeasurement.ts` so layout and export can't drift apart on
  how big a node "really" is.
- **Manual offset**: a per-node `{dx, dy}` nudge the user applied by hand,
  layered on top of whatever the layout engine computes — must survive a
  relayout unchanged (adding/removing an unrelated sibling shouldn't erase
  someone's manual fine-tuning).
- **Mental-map stability**: the general goal that relayout preserves what
  the user already understands about the diagram's shape — concretely
  tested as (a) collapse-then-expand round-trips to identical geometry,
  (b) manual offsets survive relayout, and (c, open/unresolved as of
  M1-A) editing one branch shouldn't displace unrelated branches.

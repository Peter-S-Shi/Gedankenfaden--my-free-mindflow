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
- **Fan-out strategy seam**: the decision point for what to do when one
  parent's same-side fan-out is high enough that a plain single-column
  band starts producing badly overlapping edges. M0 prototyped two
  candidates (compact grid packing, radial packing); M1-D promotes a
  corrected reimplementation of grid packing to real production behavior
  above `FANOUT_GRID_ACTIVATION_THRESHOLD` (16, M0's own measured knee) --
  radial was not promoted (worse overlap/canvas-area tradeoff at scale).
  See `src/model/mindMapLayoutEngine.ts`'s `decideFanoutStrategy` and
  "Fan-out grid packing" below.
- **Fan-out grid packing**: the M1-D production strategy for a
  pathologically-fanned parent's direct children: `ceil(sqrt(n))` columns,
  assigned via LPT footprint-balance (fixing M0's round-robin bug) and
  each centered independently on the parent's Y (fixing M0's centering-
  formula overlap bug). A fanned child's own further descendants become
  the root of their own parent-local band rather than falling back to the
  global per-depth band (which could overshoot/undershoot an individual
  column and collide with a neighbor) -- but this does not fully
  guarantee collision-freedom when a fanned child itself has further
  descendants, a case M0's own real-world evidence never exercises (every
  fanned child there is a leaf). See `placeChildrenGrid`'s "KNOWN RESIDUAL
  LIMITATION" doc comment.
- **Fan-out/stabilization interaction**: a deliberate M1-D scope boundary,
  not a bug -- a parent whose children are in the fan-out grid regime is
  *not* anchored by incremental-edit stabilization (below); its children
  are repacked as a group on every relayout regardless of
  `stabilizeAgainst`. Combining per-child anchoring with group-balanced
  grid column assignment is a materially larger feature; every non-fanned
  parent gets full stabilization.
- **Incremental-edit stabilization** (M0/M1 open item #10c, closed in
  M1-D): `layoutMindMapEngineV2`'s optional `options.stabilizeAgainst` --
  the caller's own prior layout output. A node whose own size/collapse
  state and *entire descendant subtree* are unchanged from that prior
  document keeps its exact previous position, verbatim, regardless of
  what changed elsewhere in the tree. Changed or brand-new nodes are
  slotted in next to their nearest still-anchored sibling instead of
  recentering the whole sibling list. This is a bounded, opt-in extension
  of an otherwise pure function (no new persistent state; omitting the
  option reproduces the exact M1-A/B/C behavior) -- the real product path
  (`src/components/CanvasEditor.tsx`) already carries the previous
  layout's own geometry forward into every edit's relayout call, so this
  uses data the caller already has, not a new kind of state.
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
  (b) manual offsets survive relayout, and (c, closed in M1-D via
  incremental-edit stabilization above, for non-fanned parents) editing
  one branch shouldn't displace unrelated branches.

## Geometry Convergence

Terms introduced in M1-C to describe the sizing contract between layout,
canvas, and export.

- **Geometry convergence**: the property that `node.geometry.height` (as
  written by the V2 layout engine via `computeTextAwareNodeSize`) equals
  the height that `computeEffectiveNodeBoxes` in the exporter would derive
  for the same text and width — so no layer silently re-measures and gets
  a different answer. Formally captured by the `nodeGeometryConverges()`
  predicate in `src/model/textMeasurement.ts`.
- **Effective box**: the per-node `{x, y, width, height, lines, lineHeight}`
  structure that `computeEffectiveNodeBoxes` (private to `exporter.ts`)
  computes for SVG/PNG/PDF rendering. For V2 balanced mindmap documents
  the effective box equals the canonical geometry (grownBy = 0); for
  V1-era documents with stale fixed heights, the exporter may grow height
  and re-center the y coordinate (`y - grownBy/2`) to keep edge anchors
  at the vertical midpoint.
- **Canvas-DOM divergence (Divergence A)**: the residual gap between the
  testable geometry convergence contract (layout height = export effective
  height) and live Canvas rendering. The Canvas layer passes
  `node.geometry.{width, height}` to React Flow as CSS `style.{width, height}`
  and renders text as a `break-words` span inside that container. In a
  live browser, if real rendered font metrics differ from the
  `estimatedCharWidth` model (Latin: 0.56em, CJK: 1em), the DOM may
  overflow the container. This divergence cannot be tested in a
  Vitest/Node environment and is documented in
  `src/test/v2-m1c-geometry-convergence.test.ts`; a full proof requires a
  CDP/Puppeteer browser-in-the-loop smoke test (deferred).


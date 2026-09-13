# M0 — Mind Map Layout Contract & Prototype Gate

Branch: `v2-layout-engine-reconstruction` · PR #18 (draft, child of the V2 umbrella PR #4)

Status: **Gate passed.** Recommendation below. Production engine replacement is a
separate, not-yet-started milestone (see "Next milestone" at the end).

## 1. Audit: why the current engine breaks the contract

`layoutMindMapDocument()` / `layoutHorizontalChildren()` in
[src/model/layout.ts](../../model/layout.ts) has four structural problems, all
confirmed by tracing the code (not guessed):

1. **Global column cursor.** `layoutHorizontalChildren` returns a
   `nextColumn` that the *caller* threads into the *next sibling's* starting
   column (`descendantColumn = nextColumn + 1; ... layoutHorizontalChildren(child, side, descendantColumn)`,
   `layout.ts:230-234`). A sibling with a deep subtree inflates that shared
   counter, so a later, shallower sibling starts at a higher column purely
   because of processing order — column is a function of *iteration order*,
   not hierarchy depth.
2. **"Balanced" is `index % 2`.** Level-1 children are split left/right by
   alternating index (`layout.ts:156-162`), not by how much visual space
   (subtree footprint) each side actually needs.
3. **The sqrt-rows fan-out patch doesn't fix space semantics.**
   `fanoutRows = Math.floor(Math.sqrt(children.length))` (`layout.ts:196`)
   spreads a high-fan-out group across *more columns*, which is the same bug
   as (1) in a different guise: it manufactures fake extra hierarchy depth
   for children that are all still logically depth-1.
4. **Geometry is never text-aware before layout runs.** Both the importer
   (`src/model/importers.ts:192`, fixed `140x40`) and the layout defaults
   (`layout.ts:98-99`, fixed `150x44`) size every node identically regardless
   of text length; real wrapping only exists in the *export* pipeline
   (`src/export/exporter.ts`'s `wrapNodeText`/`computeEffectiveNodeBoxes`,
   added for Ledger #8), so the canvas and the export can legitimately
   disagree on how big a node is.

These four map directly onto contract invariants #4, #6, #7, and #8 below.

## 2. The contract (executable)

Encoded as `computeLayoutMetrics()` in
[contract.ts](contract.ts). Each invariant below is a metric a prototype is
checked against on **every** corpus fixture in
[`contract.test.ts`](contract.test.ts):

| # | Invariant | Metric |
|---|---|---|
| 1 | Hierarchy depth determines primary growth direction | node `depth` field, by construction |
| 2 | Same-depth nodes share a consistent band | `sameDepthBandDeviation` (stdev of the parent-facing edge x, per side+depth) |
| 3 | Each subtree has an independent footprint | `subtreeOverlapCount` (sibling subtree bbox overlap) |
| 4 | A sibling subtree must not consume a later sibling's depth/column budget | `siblingConsumesDepthBudget` (same-band x spread > half a column stride) |
| 5 | Parent sits at the visual center of its direct children/subtree | `parentCenteringError` (normalized distance from parent's y to children's midpoint) |
| 6 | Bilateral balance is by subtree footprint, not index | `leftRightFootprintImbalance` |
| 7 | High fan-out keeps same-depth-band semantics | same as #2, exercised by `01_extreme_star_60.md` |
| 8 | Node geometry is text-aware before layout runs | `computeTextAwareSize()` used as layout input, not post-hoc |
| 9 | Edges should not cross unrelated nodes | `edgeThroughNodeCount` (Liang-Barsky segment/rect clip) |
| 10 | Collapse/expand and incremental edits stay mental-map-stable | deterministic, pure functions of the same input (structurally true for both prototypes; not separately fuzz-tested this pass) |

Also tracked per the acceptance ask: `aspectRatio`, `maxParentChildEdgeLength`,
`nodeOverlapCount`, `totalCanvasArea`.

## 3. Corpus

- **Synthetic**: the 11-file `gedankenfaden-layout-regression-corpus`
  (extreme star-60, 24-level chain, severe imbalance, wide-shallow,
  mixed-depth, long-CJK-text, mixed CJK/English, bilateral-footprint,
  collapse/expand, parent-local-packing, OPML parity), copied into
  [`fixtures/`](fixtures) — input-only, neutral, safe to commit.
- **Real**: 6 real local outline files from the user's own knowledge base
  ([REDACTED]-war-policy interest topic and others), 54–353 nodes each, depth
  4–9. Run locally for cross-validation only; **not copied into the repo**
  (per this repo's privacy rule — treat every GitHub repo as potentially
  public) and referenced below only by aggregate numbers, never by content
  or file path.

## 4. Results: baseline vs. prototype A vs. prototype B

Full per-fixture tables were produced by
`npx vitest run src/prototype/m0-layout-engine/contract.test.ts` (prints a
`console.table` per fixture). Aggregated findings:

**Both prototypes, on every one of the 11 synthetic fixtures and all 6 real
files:**

| Metric | Baseline (as shipped) | Prototype A | Prototype B |
|---|---|---|---|
| `sameDepthBandDeviation` | 87 – 4636 (never 0) | **0.0** (all 17 docs) | **0.0** (all 17 docs) |
| `siblingConsumesDepthBudget` | `true` (10/11 synthetic; 6/6 real) | **`false`** (all 17) | **`false`** (all 17) |
| `subtreeOverlapCount` | 0 – 53 | **0** (all 17) | **0** (all 17) |
| `nodeOverlapCount` | 0 (all 17 — production already avoids raw overlap) | 0 | 0 |
| `leftRightFootprintImbalance` (08, hand-built lopsided case) | 0.52 | **0.01** | **0.01** |
| `edgeThroughNodeCount` (353-node real file, worst case) | 488 | 33 | **30** |
| `maxParentChildEdgeLength` (severe-imbalance, 68 nodes) | 7480px | **1201px** | **1201px** |
| `parentCenteringError` (avg across all fixtures) | 0.00* | 0.01 | **0.00** |

\* baseline's `parentCenteringError` reads 0.00 only because it centers
every row *by construction* around a slot the parent already occupies —
it's not evidence of correctness, since the whole row-slot model is what
invariant #4 says is wrong.

**A vs. B, directly:** near-identical on this corpus. B is
architecturally "more correct" for invariant #5 (perfect 0.00 centering
error vs. A's 0.01–0.02, and consistently equal-or-fewer edge-through-node
crossings on the two largest/messiest documents: 353-node real file 33→30,
08 bilateral 9→7) — but B is **not uniformly better**: on
`03_severe_imbalance.md` B produced 2 edge-through-node crossings where A
produced 0, a direct consequence of B's tighter bottom-up packing pulling
sibling subtrees closer together than A's simple additive-footprint
reservation. Both satisfy the executable contract identically (37/37 tests
green either way).

**Important failure mode found and *not* solved by either prototype:**
extreme fan-out (`01_extreme_star_60.md`, 60 siblings). Because both
prototypes keep all 60 children in the same depth/side band (correctly,
per invariant #2/#7 — this is what makes `siblingConsumesDepthBudget` go
from `true` to `false`), the column becomes very tall (aspect ratio 5.20 →
0.15) and *more* straight-line edges pass through unrelated same-column
siblings than the current production engine (186 → 302). The current
engine's sqrt-column spread — illegal under invariant #2/#7 — was
incidentally *masking* this by fanning children across several columns,
each with fewer nodes to cross. **This means invariant #9 (no
edge-through-node) is not something node *positioning* alone can satisfy
for high fan-out; it needs edge *routing* (curved/orthogonal edges that
bend around intervening siblings, not a straight line from parent center
to child center).** That's a distinct, separately-scoped piece of work —
flagged as a follow-up, not fixed in this gate (see §7).

## 5. Architecture Decision

**Winner: Prototype A (parent-local recursive packing).**

Rationale:

- Both prototypes fully satisfy the executable contract on the entire
  corpus (37/37 green, all 17 documents synthetic+real at
  `sameDepthBandDeviation = 0`, `siblingConsumesDepthBudget = false`,
  `subtreeOverlapCount = 0`).
- B's extra architectural cost (two-pass bottom-up packing with parent
  and offset bookkeeping, contour tracking) buys only a marginal,
  sub-pixel-scale improvement on `parentCenteringError` (0.00 vs.
  0.01–0.02 — both negligible relative to node size) and is **not
  uniformly** an improvement (regressed `edgeThroughNode` on
  `03_severe_imbalance.md`).
- A is the lower-risk evolution of the *existing* production algorithm's
  shape (still parent-anchored, top-down cascade) with its three bugs
  fixed, which matters for how much of the current codebase (React Flow
  projection, manual-offset preservation, edge handle assignment) can be
  reused without also having to re-verify a structurally different
  bottom-up traversal.

**Decision for the eventual production engine replacement (a later,
separate milestone — not started in this gate):**

1. Adopt prototype A's three structural fixes as the target design:
   depth-based column assignment (not a global cursor), footprint-weighted
   bilateral split (not `index % 2`), and bottom-up-*reserved*, top-down-
   *placed* vertical packing (no more sqrt-rows patch).
2. Text-aware geometry (contract #8) must run *before* layout, sharing the
   exact wrapping heuristic export already uses — now exported as
   `estimatedCharWidth`/`wrapNodeText` from `src/export/exporter.ts` for
   this reason (see §6).
3. **Open a follow-up ticket** for edge routing (curved/orthogonal, not
   straight-line) specifically for the high-fan-out
   edge-through-node regression found in §4 — this is required before a
   production swap can be considered a strict improvement in the extreme
   fan-out case, not merely equal-or-better everywhere else.

## 6. Changes made to production code (non-behavioral, enabling only)

- [`src/export/exporter.ts`](../../export/exporter.ts): exported
  `estimatedCharWidth`, `WrappedNodeText`, `wrapNodeText` (were
  module-private). No logic changed — this only lets the prototype's
  text-aware sizing reuse the exact same heuristic instead of duplicating
  it, so canvas and export geometry can't drift apart again.

No other production file was modified. Neither prototype is wired into
`autoLayoutDocument`, the importers, or any UI path.

## 7. Remaining limitations / follow-ups

- **Prototype B is a simplified tidy-tree**, not a full
  Reingold-Tilford/Walker's algorithm: it stacks whole-subtree bounding
  boxes rather than merging left/right *contours* to interleave
  asymmetric subtrees more tightly. Since A was selected as the winner,
  this simplification is moot for the production decision, but is noted
  in case B is revisited.
- **Edge-through-node for extreme fan-out** (§4) is an open problem
  neither prototype solves; needs a follow-up ticket scoped to edge
  routing, separate from node positioning.
- **Collapse/expand mental-map stability (#10)** was validated as
  "deterministic given the same input" (both prototypes are pure
  functions), but not fuzz-tested across a sequence of incremental
  collapse/expand/edit operations — `09_collapse_expand_stability.md` was
  laid out once, not exercised through an actual collapse/expand
  interaction sequence.
- The real acceptance sample this pass's brief referenced
  (`2023-2026_Sample Outline Topic_Gedankenfaden导入大纲.md`) was located
  this time (in the linked sponge-knowledge corpus, alongside 5 other real
  outlines) and included in the real-sample comparison in §3/§4, by
  aggregate metrics only, consistent with this repo's privacy rule.

## 8. Next milestone

Per the M0 brief: **do not start production engine replacement in this
PR.** #18 stays draft; the next milestone (implement prototype A's design
in `src/model/layout.ts`, replacing the four bugs in §1, with real
regression tests at the production seam) needs its own scope/approval
before starting. UI Reconstruction, RC/release, Portfolio Packaging, and
macro lifecycle docs remain untouched, as instructed.

# M0 — Mind Map Layout Contract & Prototype Gate

> **HISTORICAL / NON-PRODUCTION (as of M1-D closure).** This report and the
> throwaway prototype code it describes (`prototypeA.ts`, `prototypeB.ts`,
> `prototypeAAdaptive.ts`, `contract.ts`, `treeUtils.ts`, `baselineAdapter.ts`,
> `loadFixture.ts`, `highFanoutStrategies.ts`, `textAwareGeometry.ts`, and
> their own tests) answered the M0 architecture question and were never a
> production dependency -- no production code or production test ever
> imported them; production tests only ever read the neutral fixture data
> below. That prototype implementation has been deleted as genuinely
> throwaway, its job done. This file and `fixtures/` are kept as the
> historical evidence record `src/model/mindMapLayoutEngine.ts`'s own doc
> comments still cite -- read it as a record of a design decision, not as
> a description of current code. The production engine that resulted
> from this gate is `src/model/mindMapLayoutEngine.ts` (M1-A, extended in
> M1-D); its own tests live in `src/test/v2-m1a-mind-map-engine.test.ts`
> and `src/test/v2-m1d-fanout-and-stability.test.ts`.

Branch: `v2-layout-engine-reconstruction` · PR #18 (draft, child of the V2 umbrella PR #4)

Status: **Corrective Gate passed, with two explicit, bounded open items.**
Node-positioning invariants (#1–#8) are satisfied by both prototypes across
the full corpus. Invariant #9 (no edge crosses an unrelated node) still
fails badly for extreme fan-out under a plain straight-line-edge model --
this pass adds two candidate mitigation strategies and an empirical
decision boundary (§5), but does not claim it's solved. Invariant #10 is
split: round-trip (#10a) and manual-offset (#10b) are tested and hold;
incremental-edit displacement (#10c) is tested and **currently fails** --
documented as an open design tradeoff, not silently assumed away (§7).
Production engine replacement is a separate, not-yet-started milestone
(see "Next milestone" at the end).

> **Corrective note (this revision):** an earlier version of this report
> said "both prototypes fully satisfy the whole contract" and "Gate
> passed" without qualification. That overstated the evidence: it treated
> #9's extreme-fan-out failure as a deferred footnote rather than a
> contract violation, and it never tested #10's incremental-edit or
> manual-offset sub-cases at all. This revision corrects both, replaces
> descendant-count bilateral balancing with a real text-aware footprint
> estimate (§4), and adds an explicit high-fan-out decision boundary (§5)
> instead of only naming the problem.

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
| 6 | Bilateral balance is by **rendered** subtree footprint, not descendant count or index | `leftRightFootprintImbalance`, fed by `computeSubtreeFootprintWeights()` (treeUtils.ts) -- a bottom-up text-aware height estimate, not a node count |
| 7 | High fan-out keeps same-depth-band semantics | same as #2, exercised by `01_extreme_star_60.md` |
| 8 | Node geometry is text-aware before layout runs | `computeTextAwareSize()` used as layout input, not post-hoc |
| 9 | Edges should not cross unrelated nodes | `edgeThroughNodeCount` (Liang-Barsky segment/rect clip) -- **fails for extreme fan-out under plain node positioning; see §5** |
| 10a | Collapse then expand round-trips to identical geometry | byte-identical position comparison, `contract.test.ts` |
| 10b | Manual offsets survive relayout and don't perturb other nodes | exact offset comparison, `contract.test.ts` |
| 10c | Adding/removing a sibling minimizes unrelated branch displacement | equality check on unrelated branches' positions before/after -- **currently fails on both prototypes; open tradeoff, see §7** |

Also tracked per the acceptance ask: `aspectRatio`, `maxParentChildEdgeLength`,
`nodeOverlapCount`, `totalCanvasArea`.

## 3. Corpus

- **Synthetic**: the 11-file `gedankenfaden-layout-regression-corpus`
  (extreme star-60, 24-level chain, severe imbalance, wide-shallow,
  mixed-depth, long-CJK-text, mixed CJK/English, bilateral-footprint,
  collapse/expand, parent-local-packing, OPML parity), copied into
  [`fixtures/`](fixtures) — input-only, neutral, safe to commit.
- **Real**: 6 external real-world outline samples from the user's own
  local knowledge base, 54–353 nodes each, depth 4–9. Run locally for
  cross-validation only; **not copied into the repo**
  (per this repo's privacy rule — treat every GitHub repo as potentially
  public) and referenced below only by aggregate numbers, never by content
  or file path. Reproducible by anyone with access to that directory via
  [`realSamples.test.ts`](realSamples.test.ts) (opt-in,
  `GEDANKENFADEN_REAL_SAMPLES_DIR=<dir> npx vitest run
  src/prototype/m0-layout-engine/realSamples.test.ts`; skips cleanly, not a
  failure, when the env var/dir is absent).

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
reservation. Both satisfy the executable node-positioning contract
identically (46/46 tests green either way, invariants #1-#8 plus #10a/10b;
#10c fails on both by design, see §7).

**Bilateral balance is now footprint-based, verified to actually differ
from count-based.** `computeSubtreeFootprintWeights()` replaced the
original descendant-count weight with a bottom-up rendered-height
estimate. `contract.test.ts`'s "#6 ... by rendered footprint, not
descendant count" test constructs the distinguishing case directly: one
branch is a single node with very long wrapped text, the other is 8 short
one-line leaves -- count-based weighting would treat the tall branch as
1/9th the "weight" of the leaf branch and pile it in beside them; both
prototypes now balance it onto its own side instead
(`leftRightFootprintImbalance < 0.5` where a count-based scheme would
produce something close to `1.0`).

**The extreme-fan-out failure mode is real and confirmed** on
`01_extreme_star_60.md` (60 siblings): keeping all 60 children in one
depth/side band (correctly, per #2/#7) produces a very tall column (aspect
ratio 5.20 → 0.15) and *more* straight-line edge-through-node crossings
than the current production engine (186 → 302) -- the production engine's
sqrt-column spread, illegal under #2/#7, was incidentally masking this by
fanning children across fake extra columns. §5 below turns this from a
named-but-unaddressed problem into two prototyped, measured candidate
fixes with a concrete decision boundary.

## 5. High fan-out: candidate strategies and decision boundary

Per the corrective brief: "preserve hierarchy-depth semantics for normal
LR mind maps, but explicitly define an adaptive exception/strategy for
extreme high-fan-out" -- not a silent global hack like the old sqrt-rows
patch (which broke the band invariant for *every* topology and stole
column budget from unrelated siblings). The exception implemented here
(`prototypeAAdaptive.ts`, `highFanoutStrategies.ts`) is **local to one
pathological parent's own direct children only** -- it cannot leak into
siblings or steal their column budget, which is what made the old patch a
bug rather than a deliberate design choice.

Two candidates, both throwaway/measured, neither wired into anything:

- **`packChildrenGrid`**: a compact `⌈√n⌉`-column local micro-grid for just
  this parent's children. Deliberately departs from "one shared x per
  depth" *for this parent's children specifically* -- a bounded, labeled
  exception, not a hidden one.
- **`packChildrenRadial`**: children ringed around the parent at a fixed
  radius. No column concept for this cluster at all.

**Empirical sweep** (`fanoutStrategy.test.ts`, synthetic star fan-outs of
size 6/12/16/24/40/60, and the real `01_extreme_star_60.md` fixture):

| n (children) | strategy=none: aspect / edgeThroughNode | grid: aspect / edgeThroughNode / nodeOverlap | radial: aspect / edgeThroughNode / nodeOverlap |
|---|---|---|---|
| 6 | 2.59 / 0 | (below threshold, same as none) | (below threshold, same as none) |
| 12 | 1.26 / 4 | same | same |
| 16 | 0.93 / 8 | same | same |
| 24 | 0.61 / 20 | same | same |
| 40 | 0.36 / 62 | 7.34 / 64 / **4** | 1.07 / **40** / **20** |
| 60 | 0.24 / 152 | 6.99 / 142 / **2** | 1.06 / **60** / **30** |
| 60 (real fixture, depth-2 parent, threshold triggers on the full 60) | 0.15 / 302 | 3.52 / 180 / 2 | 1.03 / **3** / 0 |

`edgeThroughNode` grows roughly linearly with `n` under the plain
single-column band starting around **n≈16**, and is clearly bad by
**n≈24-40**. **Decision boundary: trigger the exception when a single
parent's direct, same-side children exceed ~15-16** (the sweep's
`fanoutThreshold: 12` in the harness triggers per-*side*, after bilateral
splitting already halves a root-level fan-out -- bilateral balancing is
the first mitigation layer, the grid/radial exception is the second, for
whatever's still too tall after that).

**Neither candidate is production-ready as implemented:**

- `packChildrenGrid` is the more geometrically solid candidate (far fewer
  `nodeOverlap`, ~zero on the corpus's real fixture) and dramatically cuts
  `edgeThroughNode` on the real 60-node case (302→180), but only
  marginally on the synthetic root-level sweep (62→64 at n=40 -- worse!,
  152→142 at n=60) -- its benefit is concentrated on *deep* fan-out
  parents, not root-level ones, and it still has occasional overlaps
  (2-4 nodes) from an imperfect column-height centering formula.
- `packChildrenRadial` dramatically wins on `edgeThroughNode` (302→**3**
  on the real fixture; 152→**60** on the n=60 sweep) because a ring has no
  "far side of the column" for an edge to cross -- but its radius formula
  is too naive and produces real `nodeOverlap` (20-30 nodes) at scale, and
  a much larger `totalCanvasArea` (10.4M vs. grid's 952K on the real
  fixture). Not safe to recommend without fixing the spacing math first.
- **Neither candidate addresses further descendants under a fanned-out
  child** -- the corpus's fan-out parent's 60 children are all leaves, so
  this isn't exercised. A production implementation needs to decide how a
  grid/radial child's own children re-enter normal per-depth banding.
  Flagged as follow-up, not solved here ("smallest viable" scope, per the
  corrective brief).

**Recommendation:** `packChildrenGrid` is the stronger starting point for
a real implementation (fewer overlaps, works on the case that matters
most), but needs its column-centering math fixed before use; `radial` is
worth keeping as an alternative specifically *if* edge-crossing reduction
turns out to matter more than compactness, once its spacing bug is fixed.
Both need the "further descendants" question answered. This is explicitly
**not** a closed decision -- it's the bounded, evidence-backed starting
point the corrective brief asked for instead of an unaddressed footnote.

## 6. Architecture Decision

**Prototype A (parent-local recursive packing) remains the default LR
mind-map engine.**

Rationale:

- Both prototypes satisfy the node-positioning contract (#1-#8) identically
  across the full corpus.
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

**What node positioning (prototype A) solves vs. what remains for later
work, made explicit per the corrective brief:**

| Concern | Status |
|---|---|
| Depth-based columns, no global cursor (#1/#2/#4) | Solved by node positioning (prototype A) |
| Footprint-weighted bilateral balance (#6) | Solved by node positioning (prototype A) |
| Text-aware pre-layout geometry (#8) | Solved by node positioning (prototype A) |
| High fan-out same-band semantics (#7) | Solved by node positioning, but produces a tall canvas -- accepted tradeoff |
| No edge crosses an unrelated node (#9), extreme fan-out | **Not solved by node positioning alone.** §5's grid/radial exception measurably helps but isn't production-ready; a genuinely robust fix likely needs edge *routing* (curved/orthogonal paths), a distinct concern from where nodes sit |
| Collapse→expand round-trip (#10a), manual offsets (#10b) | Solved |
| Incremental-edit minimal displacement (#10c) | **Not solved.** Real tension with #5 (parent-centered) -- see §7 |

**Topology trigger for an alternative representation:** a single parent
with more than ~15-16 direct children on one side (§5) -- normal LR
banding (prototype A, unmodified) is appropriate below that; above it,
the parent needs the grid/radial exception (not yet production-ready) or,
short of that, an explicit "this branch is too wide to render well"
signal to the user rather than silently producing a 300+-crossing mess.

**Decision for the eventual production engine replacement (a later,
separate milestone — not started in this gate):**

1. Adopt prototype A's three structural fixes as the target design:
   depth-based column assignment (not a global cursor), footprint-weighted
   bilateral split (not `index % 2` or raw descendant count), and
   bottom-up-*reserved*, top-down-*placed* vertical packing (no more
   sqrt-rows patch).
2. Text-aware geometry (contract #8) must run *before* layout, sharing the
   exact wrapping heuristic export already uses — now exported as
   `estimatedCharWidth`/`wrapNodeText` from `src/export/exporter.ts` for
   this reason (see §8).
3. Carry forward manual-offset compatibility (#10b) exactly as prototyped
   -- apply the offset after computing the base position, unconditionally.
4. **Open two follow-up tickets**, not blocking this gate but blocking a
   *complete* production swap: (a) edge routing for the extreme-fan-out
   `edgeThroughNode` regression, and (b) a resolution to the #10c
   incremental-edit-displacement vs. #5 parent-centering tension (§7).

## 7. Open design tradeoff: incremental-edit displacement vs. parent-centering (#10c)

Both prototypes center a parent's children as **one symmetric group**
around the parent's Y position. Inserting or removing a sibling anywhere
in that group changes the group's total reserved height, which
re-centers -- and therefore moves -- *every* sibling in the group, not
just the ones after the edit point. `contract.test.ts`'s
`it.fails(...)` test for #10c documents this directly: adding one child
deep inside one top-level branch of `04_wide_shallow.md` moves *other,
unrelated* top-level branches, because the whole document ultimately
re-centers on the root.

This is a genuine, unresolved tension with contract #5 ("parent centered
on children"): a **top-anchored** layout (each sibling group's *first*
position stays fixed; edits only shift what comes after) would satisfy
#10c but would no longer keep the parent visually centered on its
children -- which is exactly the kind of ambiguous product decision the
corrective brief says to flag rather than silently resolve. **Not
resolved in this pass.** Two candidate directions for whoever picks this
up: (a) accept top-anchoring and redefine #5 as "parent centered within a
tolerance" rather than exactly; or (b) keep exact centering and accept
that edits reflow the group, but make that reflow animate smoothly in the
real UI so it reads as "the branch breathed" rather than "everything
jumped."

## 8. Changes made to production code (non-behavioral, enabling only)

- [`src/export/exporter.ts`](../../export/exporter.ts): exported
  `estimatedCharWidth`, `WrappedNodeText`, `wrapNodeText` (were
  module-private). No logic changed — this only lets the prototype's
  text-aware sizing reuse the exact same heuristic instead of duplicating
  it, so canvas and export geometry can't drift apart again.

No other production file was modified. Neither prototype is wired into
`autoLayoutDocument`, the importers, or any UI path.

## 9. Remaining limitations / follow-ups

- **Prototype B is a simplified tidy-tree**, not a full
  Reingold-Tilford/Walker's algorithm: it stacks whole-subtree bounding
  boxes rather than merging left/right *contours* to interleave
  asymmetric subtrees more tightly. Since A was selected as the winner,
  this simplification is moot for the production decision, but is noted
  in case B is revisited.
- **Edge-through-node for extreme fan-out** is measurably mitigated by §5's
  candidates but not solved -- see §5/§6 for the decision boundary and
  what's still needed before either candidate is production-ready.
- **Incremental-edit displacement (#10c)** is an open, documented tradeoff
  against parent-centering (#5) -- see §7.
- **Collapse/expand mental-map stability (#10a)** is behaviorally tested,
  not just asserted in prose: `contract.test.ts`'s "#10a collapse/expand
  mental-map stability" block collapses Branch A of
  `09_collapse_expand_stability.md`, confirms only Branch A's own
  descendants disappear from the laid-out output (Branch B/C untouched),
  then expands it again and asserts the result is byte-identical to the
  original layout (round-trip fidelity). Not fuzz-tested across arbitrary
  multi-step collapse/expand/edit *sequences* — a single collapse→expand
  round-trip per prototype.
- **Manual-offset compatibility (#10b)** is tested and holds for both
  prototypes: a `manualOffset` survives relayout unchanged and doesn't
  perturb any other node's computed position.
- The specific real acceptance sample referenced by an earlier pass's
  brief was located this time, alongside 5 other real outlines in the
  user's own local knowledge base, and included in the real-sample
  comparison in §3/§4 by aggregate metrics only — its filename and
  content are intentionally omitted from this report, consistent with
  this repo's privacy rule.

## 10. Privacy hygiene audit (this corrective pass)

Per the corrective brief's privacy-hygiene ask, three things were checked
and, where found in the *current* tree, fixed forward (see this file's and
the branch's commit history):

- `M0_REPORT.md` and `fixtures/README.md` wording (referencing the user's
  real interest-topic name and a second real sample family by name)
  replaced with neutral language ("external real-world outline samples").
  Fixed on both
  `v2-layout-engine-reconstruction` and (where the same wording had leaked
  via an earlier commit) `v2.0.0-upgrade`.
- Two test files committed earlier in the V2 line
  (`src/test/v2-f07-export-long-text-fidelity.test.ts`,
  `src/test/v2-f13-library-scan-discovers-importable-formats.test.ts`) used
  the user's private interest-topic phrasing as sample text. Replaced with
  topic-neutral placeholders on **both** `v2.0.0-upgrade` (where they
  originate) and `v2-layout-engine-reconstruction` (which had inherited
  them), forward-fix commits, tests re-verified green.

**Git-history scope: investigated, reported, then rewritten on explicit
user authorization.**

`git log --all -S` for the private topic strings found them in **6
reachable commits across two related but distinct regions** of
`v2.0.0-upgrade`'s 31-commit history ahead of `main` (confirmed: `main`
itself is completely unaffected -- it doesn't even contain the files in
question):

1. **Narrow region** (commits `316c66e`, `1dbbe41`, both near the branch
   tip): the two test files above.
2. **Broad region** (commits `37ae82c`, `05e030f`, only 2 commits after
   the branch's root merge from PR #3): `.github/V2_DEFECT_LEDGER.md`
   (pre-existing content, not something this session wrote) referenced
   the same real-world topic names as defect evidence, and that reference
   was still present at HEAD (current tree, not just history).

Per the brief: *"if this requires broad destructive rewriting... stop and
report the exact commits/refs affected... rather than force-push
blindly."* This was reported to the user before any rewrite happened.
The user then explicitly authorized both the ledger wording fix and a
full history rewrite.

**What was actually done:** a fresh, throwaway clone (never pushed except
the two intended branches) was rewritten with `git filter-repo
--replace-text ... --replace-message ...` (both blob content and commit
messages), restricted to exactly `v2.0.0-upgrade` and
`v2-layout-engine-reconstruction` via `--refs` -- no other branch (`main`
included) was included in the rewrite's universe, so nothing else could
be touched by it. Verified before pushing: zero remaining matches for any
of the private topic strings across every commit's file content *and*
message on both branches; `.github/V2_DEFECT_LEDGER.md` reads cleanly at
every historical revision, not just HEAD; `npx tsc --noEmit` and the full
`src/prototype/m0-layout-engine` + affected test-file suites (58 tests)
still pass on the rewritten tree. Pushed with `--force-with-lease`
(pinned to each branch's exact known prior tip, so a concurrent
unexpected push would have aborted the push rather than silently
overwriting it) to both branches.

**One side effect worth naming:** because the rewrite touches everything
reachable from `v2.0.0-upgrade`'s tip, the commit that PR #4 shares with
`main` as its merge-base also gained a new SHA (even though its own
content didn't change) -- this shifted PR #4's *computed* merge-base
slightly, which is why GitHub may briefly show a different mergeability
recompute. Checked directly: `git merge-tree` against `main` produces the
**exact same conflicting files** (`.github/V2_DEFECT_LEDGER.md`,
`PROJECT_STATUS.md`) both before and after the rewrite -- this is a
**pre-existing PR #4 vs. `main` conflict, unrelated to this privacy work**,
not something the rewrite introduced. PR #18's own topology (base
`v2.0.0-upgrade`, head `v2-layout-engine-reconstruction`) was verified
`MERGEABLE` after the rewrite.

## 11. Exit code review

**Original gate (`/code-review` against `dcc480a`, before this corrective
pass):** Standards axis clean (repo has no CODING_STANDARDS.md/
CONTRIBUTING.md); one accepted judgement-call smell (`prototypeA.ts`/
`prototypeB.ts` each carry their own near-identical `nearEdgeX` function --
intentional for an A/B gate, must collapse into one shared module if
prototype A moves into production). Spec axis found two gaps (untested
#10 round-trip, unreproducible real-sample numbers), both fixed before
that gate's push.

**This corrective pass's own exit review** (`/code-review` against
`d807629`, the original gate's exit point): Standards axis found one real
(if minor) bug caused by duplication -- `prototypeAAdaptive.ts` forked
from `prototypeA.ts` and missed the manual-offset fix that landed in A/B
in the same commit; fixed. Also flagged (accepted, not fixed) the
Adaptive fork's ~170-line duplication of A's structure for one branch,
and the identical 8-line manual-offset block duplicated between A and B.
Spec axis: `src/model/layout.ts` confirmed untouched; the Architecture
Decision's default-engine/threshold statement confirmed explicit and
number-backed (not hand-waved); PR #18's own body confirmed independently
updated, not just this file; one gap found and fixed -- the report never
stated an explicit M1-unblocked verdict (now §12).

## 12. Is M1 (Production Layout Engine Replacement) genuinely unblocked?

**Partially, not fully.** The core node-positioning work (§1-§4, §6) is
solid enough to start M1's implementation of prototype A's design in
`src/model/layout.ts` -- that part is genuinely unblocked. But two things
found in this corrective pass should be resolved, or at least explicitly
scoped into M1, before M1 can be called *complete*: §5's high-fan-out
exception (neither candidate is production-ready as implemented) and §7's
incremental-edit-displacement tradeoff (a real, unresolved conflict with
contract #5 that needs a product decision, not just an implementation).
Starting M1 without a plan for those two is starting it with known,
named gaps rather than a clean gate.

Per the M0 brief: **do not start production engine replacement in this
PR.** #18 stays draft; the next milestone (implement prototype A's design
in `src/model/layout.ts`, replacing the four bugs in §1, with real
regression tests at the production seam, PLUS a resolution to §5's
high-fan-out exception and §7's incremental-edit tradeoff) needs its own
scope/approval before starting. UI Reconstruction, RC/release, Portfolio
Packaging, and macro lifecycle docs remain untouched, as instructed.

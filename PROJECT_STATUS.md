# Project Status: Gedankenfaden

**Current State**: V1 Product Development COMPLETE — Release `v1.0.0` Published — Milestones M0–M7 COMPLETE (PASS) — All 20 Test Suites & 116 Tests Passing (100% Green) — Windows Native Release Binary, Installers (NSIS, MSI), and Portable Package Verified & Published — Maintenance Mode ACTIVE  
**Current Milestone**: Portfolio Packaging (External Packaging & Presentation Activity)  
**Active Branch**: `docs/portfolio-packaging` (Release Baseline: `v1.0.0`)  
**Official Remote**: `https://github.com/Peter-S-Shi/Gedankenfaden--my-free-mindflow.git`  
**Last Updated**: 2026-09-05  

---

## 0a. V2 Layout Engine Reconstruction — Merged into `v2.0.0-upgrade` (Complete)

**Scope**: `v2-layout-engine-reconstruction` (formerly PR #18, child of the V2 umbrella `v2.0.0-upgrade`). Replaced the mind-map layout engine's node-positioning architecture end to end: contract definition and prototype evaluation (M0), production engine core (M1-A), live product integration (M1-B), geometry-convergence acceptance across layout/canvas/export (M1-C), and final closure on high fan-out and incremental-edit stability (M1-D). This work is complete and merged; it is not the overall V2 release and does not by itself make `v2.0.0-upgrade` release-ready.

**What changed**:
- `src/model/mindMapLayoutEngine.ts` (new) is the production balanced mind-map layout engine, wired live via `autoLayoutDocument()`/`layout.ts` for the default "balanced" preset. The legacy `layoutMindMapDocument()` remains in place and still serves the `LR`/`RL`/`TB` presets and Flowchart/Dagre, both untouched by this work.
- Footprint-weighted bilateral balance, parent-local recursive packing, same-depth band semantics, text-aware geometry (shared with export via `src/model/textMeasurement.ts`), collapse behavior, and manual offsets are production behavior, not prototype claims.
- High fan-out (parents with pathologically many same-side direct children) is handled by a measured-evidence-activated multi-column grid strategy (`FANOUT_GRID_ACTIVATION_THRESHOLD`), replacing the earlier inert seam.
- Incremental-edit stability (#10c): an opt-in `stabilizeAgainst` option lets a relayout keep every structurally-unchanged node at its exact prior position regardless of edits elsewhere in the tree; wired into every live add/delete/paste/fold-toggle edit handler in `CanvasEditor.tsx`.
- The throwaway M0 prototype implementation (`src/prototype/m0-layout-engine/`'s `.ts` modules) has been retired; only its neutral fixture corpus and historical evidence report remain, clearly marked non-production.

**Known, deliberately-accepted residual limitations** (not blockers, documented in `CONTEXT.md` and the engine's own doc comments):
- A fan-out-grid-packed parent's own children are not covered by incremental-edit stabilization (a documented scope boundary: fan-out and stabilization are two separately-solved contracts, not yet combined).
- A fanned child that itself has further descendants is positioned at correct depth but is not fully guaranteed collision-free against a neighboring grid column — unexercised in real-world evidence (every fanned child in both the synthetic and real acceptance samples was a leaf).
- Canvas-DOM text-metrics divergence from the model's text-wrapping estimator (M1-C's "Divergence A") was checked with a live headless-Chromium acceptance pass for representative long CJK, mixed CJK/English, and long-title text; the model's estimate was conservative (real rendered text stayed within, not beyond, the model's declared box) in every case checked. This is evidence from representative samples, not an exhaustive proof, and is not re-verified on every future text/font change.

**Verification**: full automated suite (39 files / 214 tests) plus focused M1-A/B/C/D suites, `tsc --noEmit`, and `npm run build` all clean; a private real-sample acceptance pass against real local mind-map outlines (topology categories: ordinary, deep/uneven — none in this sample set reached the fan-out threshold) found zero overlaps and confirmed stabilization idempotence; remote GitHub Actions CI ran green (both Ubuntu and Windows legs, including the full Windows native/Tauri build) against the exact merged commit via a temporary `milestone/**`-pattern verification branch, since this child branch's own base (`v2.0.0-upgrade`) is not itself a CI trigger target.

**Next real macro stage for the V2 program**: the remaining `v2.0.0-upgrade` repair tickets and umbrella PR #4's own path to `main` (release readiness for `v2.0.0` overall is a separate, later milestone — not reached by this layout-engine work alone).

---

## 0. Maintenance Update — 2026-09-13

- **Issue #10** (`Export printable PDF diagrams rather than summary pages`) implemented on `v2.0.0-upgrade`.
- PDF export now emits a printable vector diagram containing visible node, edge, group, and label content rather than a summary-only page.
- Added consumer evidence with `pdfjs-dist` that parses the exported PDF, verifies readable diagram text, and confirms vector path geometry.
- Local validation: `npm test` passed (25 files, 122 tests); `npm run build` passed.
- Remote verification target: draft PR #4 (`v2.0.0-upgrade` -> `main`) GitHub Actions CI.

---

## 1. Project Health & Lifecycle Overview

| Dimension | Status | Authoritative Reference |
|---|---|---|
| **Technical & Market Discovery** | **Completed & Incorporated** | Distilled into `PRODUCT_SPEC.md` / `ARCHITECTURE.md` |
| **Product Scope Decisions** | **Completed & Incorporated** | Distilled into `PRODUCT_SPEC.md` / `ROADMAP.md` |
| **M0 Feasibility Spike** | **Completed (PASS)** | Historical spike code & test evidence |
| **M1 Canonical & Workspace Shell** | **Completed (PASS)** | Vitest unit/integration suite & Remote CI Green |
| **M2 Mind Map & Keyboard First** | **Completed (PASS)** | Centered Bidirectional Layout, Multiline Paste, Numbering |
| **M3 Flowchart & Group Containers** | **Completed (PASS)** | Orthogonal Routing, Standard Shapes, Waypoints, Group Containers |
| **M4 Hybrid Library & Recovery** | **Completed (PASS)** | Debounced Autosave, Atomic Writes, Crash Recovery, Rolling Snapshots |
| **M4 Native Verification Gate** | **Completed (PASS)** | Real Windows Rust/Cargo native compilation verified (`gedankenfaden.exe`) & CI Gate |
| **M5 Structured Import & Export** | **Completed (PASS)** | Markdown/OPML Importers, 11 Exporters Matrix, Image Node Pipeline |
| **Architecture Decisions** | **Completed & Incorporated** | Distilled into `ARCHITECTURE.md` |
| **V1 Feature Freeze** | **FROZEN (Feature Complete)** | All M1–M5 Features Implemented & Verified |
| **M6 Product Hardening & Polish** | **Completed (PASS)** | Empirical browser DOM benchmarks, 20-cycle memory slope verification, 1,000-node stress, resource disposal, production keyboard dispatcher & motion wiring |
| **M7-A RC Native Integration Prep** | **Completed (PASS)** | Gates A–H verified: Tauri native bridge, real filesystem library, Recycle Bin delete, `.mflow` OS association, release binary build, portable package, and empirical smoke test |
| **M7-B User Manual Acceptance** | **Completed (PASS)** | Human acceptance passed (clean-machine installer install/uninstall path explicitly user-deferred, not a blocker); Selection UX corrective verified |
| **V1 Release Closure** | **Completed (PASS)** | Version 1.0.0 promoted, release PR merged, tag `v1.0.0` created, GitHub Release published with NSIS/MSI/portable artifacts |
| **Maintenance Mode** | **ACTIVE** | V1 feature development closed; future work strictly limited to maintenance/bug fixes or authorized versions |
| **Product Freeze** | **FROZEN** | `PRODUCT_SPEC.md` |
| **Architecture Freeze** | **FROZEN** | `ARCHITECTURE.md` |
| **Milestone Roadmap** | **Frozen (M0–M7 Complete)** | `ROADMAP.md` |
| **Remote Repository** | **Synchronized & Active** | `origin/main` |


---

## 2. Frozen Product & Architecture Contracts Summary

1. **Product Contract (Frozen)**:
   - Windows-first, local-first, single-user visual thinking desktop tool.
   - Dual-mode canvas (Mind Map & Flowchart) operating on a single canonical graph model.
   - Mind Map default layout: Centered bidirectional balanced expansion with LR/RL/TB presets and manual adjustments preserved.
   - Flowchart default routing: Orthogonal/smooth-step with document-level Bezier switch.
   - Canvas-first editor with collapsible left Outline, collapsible right Inspector, and floating Minimap.
   - Hybrid Library/Home: Real Windows files/folders + local fast metadata cache.
   - Keyboard-first interaction model following established desktop shortcut conventions and multiline paste-to-structure.
   - Embedded image nodes packaged into a single-file portable container (`.mflow`).
   - Dynamic branch list numbering (1234, abcd, Roman, bullets) as structural presentation rules.
   - Signature motion language with full `prefers-reduced-motion` compliance.
   - Invisible reliability: autosave, atomic writes, crash recovery, and bounded rolling local snapshots.
   - Structured import and multi-format exports: JSON, SVG, PNG, JPEG, PDF, Markdown, HTML, Mermaid, OPML, Legacy mind-map XML (`.mm`), JSON Canvas (`.canvas`) open format.
   - Strict V1 non-goals: No cloud sync, accounts, collaboration, mobile, AI whole-map generation, or template marketplace.
   - No user-facing mode conversion: Shared graph model does not imply a V1 user-facing lossless mode-conversion feature.

2. **Architecture Contract (Frozen)**:
   - Canonical document schema strictly decoupled from React Flow.
   - Unidirectional projection boundary via bi-directional adapters.
   - Tauri 2 chosen as the V1 native desktop shell.
   - Single-file container (`.mflow` logical package: `document.json` + `assets/`).
   - Pure transformation adapters for auto-layout and import/export formats.

3. **M7-A Native Release Candidate Integration & Corrective Gates (Verified)**:
   - *Corrective Gate A — Packaging CI Fail-Closed*: Removed `|| echo` fallback and `continue-on-error: true` from Windows installer step in `.github/workflows/ci.yml`. Strictly verify existence and non-trivial size of all 3 required RC artifacts: standalone portable distribution (`.zip`), NSIS installer (`.exe`), and MSI installer (`.msi`).
   - *Corrective Gate B — Complete Native Markdown / OPML Import*: Integrated native `.md`, `.markdown`, and `.opml` outline import into `loadDocumentFromFile` and `pickDocumentFile`. Preserves source files untouched, parses into canonical document tree, and saves to user library as user-owned `.mflow`.
   - *Corrective Gate C — Truthful Empty Library & No Demo Seeding*: Removed automatic demo document seeding on empty library folder. Empty library remains truthfully empty with zero fake/demo files written to disk. Added deliberate empty-state UI providing the four required actions: New Mind Map, New Flowchart, Import File, and Change Folder.
   - *Corrective Gate D — Credible .mflow UI Cold-Start Runtime Proof*: Empirically verified cold-start file launch via Chrome DevTools Protocol attached to live Windows WebView2 runtime (`gedankenfaden.exe <file.mflow>` with `--remote-debugging-port=9222`). Confirmed live DOM elements: `[data-testid="canvas-editor"]` mounted, document title matched, and sentinel node rendered on canvas.
   - *Native Toolchain & Release Stability*: Fixed release profile in `Cargo.toml` by disabling aggressive LTO (`lto = false`) and panic abort, preventing Windows COM vtable memory corruption (0xc0000005). Production binary compiled cleanly via Tauri build.
   - *Local RC Verification (Gate H)*: Full empirical smoke test executed via `scripts/verify-smoke-native.mjs` with 100% green exit code, verifying release binary, real `.mflow` launch, live DOM canvas mount, and portable zip archive integrity.

---

## 3. Milestone Execution Progress

| Milestone | Scope / Goal | Status | Next Milestone Dependency |
|---|---|---|---|
| **M0** | Technical & Autonomous Loop Feasibility Spike | **COMPLETED (PASS)** | Complete |
| **M1** | Canonical Foundation, Workspace Shell & Native Document Foundation | **COMPLETED (PASS)** | Complete |
| **M2** | Mind Map Experience, Centered Bidirectional Layout & Keyboard-First Interaction | **COMPLETED (PASS)** | Complete |
| **M3** | Flowchart Engine, Orthogonal Routing & Visual Group Containers | **COMPLETED (PASS)** | Complete |
| **M4** | Hybrid Library/Home, Tauri 2 Shell & Local Recovery Engine | **COMPLETED (PASS)** | Complete |
| **M4 Native Gate** | M4 Native Verification Corrective Gate (Rust/Cargo toolchain, native Windows build, CI gate) | **COMPLETED (PASS)** | Complete |
| **M5** | Structured Import, Multi-Format Export & Node Image Pipeline | **COMPLETED (PASS)** | Feature Freeze Reached |
| **M6** | Product Hardening, Performance & Edge-Case Polish | **COMPLETED (PASS)** | Complete |
| **M7-A** | Release Candidate & Native Integration Preparation | **COMPLETED (PASS)** | Complete |
| **M7-B** | User Manual Acceptance Testing & Selection UX Corrective | **COMPLETED (PASS)** | Complete |
| **M7** | Release Candidate, Packaging QA & Maintenance Transition | **COMPLETED (PASS)** | V1 Development Complete |

---

## 4. Git & Privacy Status

- **Current Active Branch**: `docs/portfolio-packaging` (Release Baseline: `v1.0.0`).
- **Privacy Exclusions**:
  - `grill/`, `prompt-drafts/`, `dist-portable/`, and `*.mflow` are strictly protected in `.gitignore` and `.git/info/exclude`.
  - Zero sensitive research notes, discovery files, machine-specific absolute paths, or credentials are tracked.
- **Remote Status**: Connected to official remote `https://github.com/Peter-S-Shi/Gedankenfaden--my-free-mindflow.git`.

---

## 5. Current State & Release Truth

1. **Repository & Release Status**:
   - Release PR merged into `main` via history-preserving merge commit.
   - Tag `v1.0.0` created and pushed to GitHub.
   - GitHub Release `v1.0.0` published with complete release notes and distribution assets.
   - Maintenance Mode ACTIVE: V1 feature intake closed; future activities strictly limited to maintenance/bug fixes or explicitly authorized future versions.
2. **Release Artifacts Contract (Verified & Published)**:
   - NSIS Installer: `Gedankenfaden_1.0.0_x64-setup.exe`
   - MSI Installer: `Gedankenfaden_1.0.0_x64_en-US.msi`
   - Windows x64 Standalone Portable Package: `dist-portable/Gedankenfaden-v1.0.0-windows-x64-portable.zip`
   - Checksums: `SHA256SUMS.txt`
3. **Verification Summary**:
   - Automated Unit & Integration Tests: All 20 test files passed (116/116 tests, 100% green).
   - TypeScript Compilation (`tsc --noEmit`): 0 errors.
   - Vite Production Build (`npm run build`): 0 errors.
   - Tauri Native Release Build: `src-tauri/target/release/gedankenfaden.exe` compiled with embedded production bundle.
   - Empirical Native Smoke Test (`verify-smoke-native.mjs`): 100% PASS via Chrome DevTools Protocol attached to real Windows WebView2 runtime (file association cold-start, multi-attribute Inspector edits with persistent selection, and pane click deselect).
   - Remote GitHub Actions CI: 100% Green across matrix targets.
4. **Current & Next Activity**:
   - Portfolio Packaging: README redesigned with real proof visuals (`assets/readme/`), concise value narrative, desktop workflow, engineering highlights, and download entry points; submitted via branch PR.
5. **Governance & Boundaries Preserved**:
   - Feature Freeze respected (zero new functional features).
   - No license declared or added (undecided license status preserved).
   - No force push executed under any circumstances.
   - Unsigned Windows binary truth documented (standard Windows unknown-publisher warnings expected).



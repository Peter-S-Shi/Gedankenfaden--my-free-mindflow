# Project Status: Gedankenfaden

**Current Program**: Gedankenfaden v2.0.0 Reconstruction & Upgrade (In Progress)  
**Active Branch**: `v2.0.0-upgrade` (Umbrella PR #4: OPEN, DRAFT)  
**Stable Published Baseline**: `v1.0.0` on `main`  
**V2 Product Hardening**: COMPLETE / PASS (Repair Queue Closure: PASS)  
**Layout Engine Reconstruction**: COMPLETE (Merged into `v2.0.0-upgrade`)  
**Next Macro Stage**: UI Reconstruction (Active Next Stage)  
**Release Truth**: v2.0.0 RC, Final Release, and Portfolio Refresh are PENDING (PR #4 is Draft, not merge-ready)  
**Official Remote**: `https://github.com/Peter-S-Shi/Gedankenfaden--my-free-mindflow.git`  
**Last Updated**: 2026-09-14  

---

## 1. V2 Program Status & Product Hardening Closure (Current Truth)

| Program Dimension | Status | Authoritative Reference / Evidence |
|---|---|---|
| **V2 Reality Audit & Defect Ledger** | **COMPLETE (PASS)** | `.github/V2_DEFECT_LEDGER.md` (F01–F14 reconciled) |
| **V2 Layout Engine Reconstruction** | **COMPLETE (PASS)** | `src/model/mindMapLayoutEngine.ts` (PR #18 merged, `6e684e1`) |
| **Manual Node Sizing Semantics** | **COMPLETE (PASS)** | `e505f88`, `src/test/v2-manual-node-sizing.test.ts` |
| **#13 Library Live Sync & Startup Hydration** | **COMPLETE (PASS)** | `12d9719`, auto-hydrates on startup, live watcher active |
| **#14 Native Close & Recovery Lifecycle** | **COMPLETE (PASS)** | `12d9719`, clean exit without false recovery; `taskkill` triggers Crash Recovery |
| **#16 Single-Root Preserving Node Deletion** | **COMPLETE (PASS)** | `28ac882`, mid-tree reparenting to parent, single-root invariant intact |
| **#17 Mind-Map Subtree Dragging** | **COMPLETE (PASS)** | `c7eb7e8`, drags entire subtree with uniform displacement delta |
| **F12 Recursive Directory Discovery** | **DEFERRED** | Explicit product decision / out of current scope (single-root preserved) |
| **PH Repair Queue Exit Gate** | **CLOSED (PASS)** | Exact-head CI `34797692094` green; native manual acceptance passed |
| **UI Reconstruction** | **NEXT / ACTIVE STAGE** | Ready to begin from stabilized engine and hardening baseline |
| **V2 Release Candidate & Packaging** | **PENDING** | Scheduled following UI Reconstruction |
| **Umbrella PR #4** | **OPEN (DRAFT)** | Base: `main`, Head: `v2.0.0-upgrade` |

### Key Product Hardening Accomplishments
1. **Startup Library Hydration (#13)**: Persisted library directories hydrate automatically on application startup without requiring manual "Rescan Disk", while non-recursive native filesystem watchers monitor subsequent external file operations.
2. **Native Lifecycle & Recovery (#14)**: Verified with real standalone Windows release binary (`gedankenfaden.exe`):
   - Normal close via window chrome / Alt+F4 executes clean termination (`app.exit(0)` via IPC) with zero false crash-recovery prompts on relaunch.
   - Unsaved document edits produce continuous rolling recovery snapshots; abrupt interruption via `taskkill /F /IM gedankenfaden.exe` reliably triggers the Crash Recovery modal on relaunch with unsaved work intact.
3. **Canonical Single-Root Invariant & Deletion (#16)**: Reconciled deletion semantics—the root node cannot be deleted into multiple detached root subtrees; mid-tree node deletion safely reparents child nodes to the parent's parent, and root clearing uses "Clear all root branches".
4. **Subtree Drag Movement (#17)**: Dragging any parent node in mind-map mode carries all descendant nodes by the identical displacement delta, preserving relative manual layout adjustments.
5. **Balanced Mind Map Engine Live Integration**: Replaced legacy heuristic positioning with footprint-weighted bilateral balance, same-depth band semantics, multi-column fan-out grid packing, and incremental-edit stabilization (`stabilizeAgainst`). Real large-map acceptance confirmed the balanced V2 engine is active and produces clean, non-overlapping layouts.

---

## 2. V2 Layout Engine Reconstruction Summary (Merged Component)

- **Engine Core**: `src/model/mindMapLayoutEngine.ts` is the active production balanced mind-map engine, wired via `autoLayoutDocument()` / `layout.ts`. Legacy `layoutMindMapDocument()` remains in place for `LR`, `RL`, `TB` presets and Flowchart/Dagre.
- **Shared Geometry**: Sizing calculations unify layout and export via `src/model/textMeasurement.ts`.
- **High Fan-Out Strategy**: Multi-column grid packing activates automatically when a single node has a pathologically large number of direct children (`FANOUT_GRID_ACTIVATION_THRESHOLD`).
- **Incremental Stability**: `stabilizeAgainst` option guarantees unaffected nodes remain fixed during local insertion, deletion, paste, or folding operations.

---

## 3. Historical V1 Foundation & Release Baseline (Frozen `v1.0.0`)

> The sections below document the frozen historical `v1.0.0` release baseline published on `main`.

### V1 Milestone Execution Summary (M0–M7)
- **M0 Feasibility Spike**: Web/canvas stack, canonical document model decoupling, signature motions.
- **M1 Canonical & Workspace Shell**: Production schema v1.0, `.mflow` container packager, three-pane shell, command history.
- **M2 Mind Map & Keyboard First**: Bidirectional layout, keyboard navigation, multiline paste, list numbering.
- **M3 Flowchart & Group Containers**: Orthogonal routing, shape family, editable edge labels, group containers.
- **M4 Hybrid Library & Recovery**: Tauri 2 shell, filesystem scanning, debounced autosave, atomic writes, crash recovery.
- **M5 Structured Import & Export**: Markdown/OPML importers, 11 exporters (PDF, SVG, PNG, JPEG, HTML, etc.), node image pipeline.
- **M6 Product Hardening**: Performance benchmarks, memory leak slope audits, reduced motion compliance.
- **M7 Release Candidate & Baseline Freeze**: Windows installer (NSIS, MSI) and portable distribution packages published at tag `v1.0.0`.

### V1 Release Truth & Published Artifacts
- **Release Baseline**: `v1.0.0` published on `main` (Tag `v1.0.0`).
- **Artifacts**: NSIS Installer (`Gedankenfaden_1.0.0_x64-setup.exe`), MSI Installer (`Gedankenfaden_1.0.0_x64_en-US.msi`), Standalone Portable (`dist-portable/Gedankenfaden-v1.0.0-windows-x64-portable.zip`).
- **Test Baseline**: 20 files / 116 tests passing on V1 baseline; expanded to 70+ suites on V2 reconstruction branch.

---

## 4. Git, Governance & Privacy Boundaries

- **Active Branch**: `v2.0.0-upgrade`.
- **Force Push Policy**: Strictly prohibited (`git push --force` forbidden).
- **PR State**: PR #4 remains Open and in Draft status until all V2 macro stages (including UI Reconstruction and V2 RC) are complete.
- **Privacy Exclusions**: `.prompt-drafts/`, `.claude/`, `Gedankenfaden-dev-source/`, `dist-portable/`, and private test corpora are strictly excluded from git tracking.

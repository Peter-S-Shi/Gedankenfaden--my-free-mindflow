# Project Status: Gedankenfaden

**Current Program**: Gedankenfaden v2.0.0 Reconstruction & Upgrade (In Progress)  
**Active Branch**: `v2.0.0-upgrade` (Umbrella PR #4: OPEN, DRAFT)  
**Stable Published Baseline**: `v1.0.0` on `main`  
**V2 Product Hardening**: COMPLETE / PASS (Repair Queue Closure: PASS)  
**Layout Engine Reconstruction**: COMPLETE (Merged into `v2.0.0-upgrade`)  
**V2 M3 UI Reconstruction**: IMPLEMENTATION COMPLETE / HUMAN ACCEPTANCE PENDING  
**Flowchart Fidelity Closure (F6-F10)**: COMPLETE / PASS (`cbbaf70`) -- multiline text, canvas pattern, edge width, theme color, and font-family fidelity  
**Final Export Product Hardening Closure (EX-01..EX-11)**: COMPLETE / PASS (`9bc1e9e`) -- hierarchy-export gating, JSON Canvas standard fidelity, numbering/annotation/background/visual-resolver export parity, PDF text-aware geometry, Unicode filenames, icon/image export  
**V2 Release Candidate Phase A (RC-A)**: COMPLETE -- version/package-config unification, native Windows release build + NSIS/MSI/portable artifact verification, and an isolated v1.0.0-to-v2.0.0-candidate `.mflow` compatibility smoke (see Section 5). The build's machine version has since been normalized to the final `2.0.0` (no prerelease/RC suffix; see the version-normalization note in Section 3) -- previously stale `1.0.0` residue in `package.json`/`tauri.conf.json`/`Cargo.toml`/CI/packaging script, then briefly an interim numeric-only prerelease identifier, both now retired. Branch: `rc/v2.0.0-release-candidate` (child PR into `v2.0.0-upgrade`, not `main`).  
**Next Macro Stage**: M7-B Human Acceptance -- a minimal packaged-candidate smoke of the `2.0.0` candidate build (install/portable launch, cold start, `.mflow` file-association open, one edit-save-close-reopen persistence journey, recovery behavior), per the V1 acceptance model. UI Reconstruction (V2 M3) still awaits its own first human acceptance pass; Product Hardening (including Flowchart Fidelity Closure and Export Closure) is already CLOSED/PASS and is not re-verified end-to-end in RC-B.  
**Release Truth**: the `2.0.0` version string is now correct/final version metadata on this candidate build (RC-A's own version-normalization scope), but this is a metadata change only -- it does **not** constitute Release Closure. PR #4 remains Draft; the RC-A child PR (PR #19) is also not merge-ready and must not be merged without explicit human review; no `v2.0.0` git tag exists yet. Merge, tagging, and portfolio refresh remain PENDING.  
**Official Remote**: `https://github.com/Peter-S-Shi/Gedankenfaden--my-free-mindflow.git`  
**Last Updated**: 2026-09-15  

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
| **UI Reconstruction (V2 M3)** | **IMPLEMENTATION COMPLETE / HUMAN ACCEPTANCE PENDING** | Text-first dynamic sizing, border hover resize, 8 context menu families, collapsible Inspector, independent icon picker |
| **Flowchart Fidelity Closure (F6-F10)** | **COMPLETE (PASS)** | `cbbaf70`; focused + full suite (58/58, 428/428) green; exact-head CI `34917893819` SUCCESS |
| **Final Export Product Hardening Closure (EX-01..EX-11)** | **COMPLETE (PASS)** | `9bc1e9e`, `src/export/exportScene.ts`; full suite (499/499) green; exact-head CI `34920635735` SUCCESS |
| **V2 Release Candidate Phase A (RC-A)** | **COMPLETE** | Branch `rc/v2.0.0-release-candidate`; version/config normalized to final `2.0.0` (no prerelease/RC suffix); native release build + NSIS/MSI/portable verified via the correct `tauri build` bundle pipeline; V1-compat smoke `src/test/v2-rc-a-v1-compat-smoke.test.ts` |
| **V2 Release Candidate Phase B (Human Acceptance)** | **PENDING** | Scheduled next: minimal packaged-candidate smoke of the `2.0.0` candidate build (install/portable launch, cold start, `.mflow` open, one save/reload journey, recovery check) -- not a re-verification of already-closed Product Hardening or UI Reconstruction's first acceptance pass |
| **Umbrella PR #4** | **OPEN (DRAFT)** | Base: `main`, Head: `v2.0.0-upgrade` -- unaffected by RC-A; RC-A is a separate child PR into `v2.0.0-upgrade` |

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

## 3. V2 Release Candidate Phase A (RC-A)

- **Status**: **COMPLETE**. This phase is a version/package-configuration audit plus native build verification -- it does not redesign or reopen anything already accepted in Product Hardening, and it does not promote a `v2.0.0` release.
- **Branch**: `rc/v2.0.0-release-candidate`, cut from `v2.0.0-upgrade` exact HEAD `9bc1e9e`. Delivered as a **child PR into `v2.0.0-upgrade`**, not into `main`, and not merged by the automated agent.
- **Version/config unification**: `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` all still read stale `1.0.0` (the frozen V1 baseline version) even on the V2 branch. `scripts/package-portable.mjs` previously hardcoded `"1.0.0"` independently of `package.json` in five places (staging folder name, zip filename, README text, manifest version); it now reads `package.json` as the single source of truth and derives its README/manifest labeling generically from whatever version string is present. `.github/workflows/ci.yml`'s artifact-existence check and `upload-artifact` name were likewise hardcoded to `v1.0.0`; both now resolve the version from `package.json` at CI time.
- **Genuine release blocker found and fixed during RC-A's own fail-closed verification (version scheme)**: the first candidate version, `2.0.0-rc.1`, is valid semver but Tauri's Windows MSI/WiX bundler rejects it -- `npx tauri build` failed with `optional pre-release identifier in app version must be numeric-only ... for msi target`. This was caught locally (not just assumed from CI) by actually running the full `npx tauri build` bundle pipeline end to end, which is what surfaced the failure. Worked around at the time with an interim numeric-only prerelease identifier while candidate builds were still explicitly non-final. That interim identifier has since been retired: see the version-normalization note below.
- **Version normalization to final `2.0.0`**: following a subsequent, explicit, narrowly-scoped instruction, the interim prerelease identifier was retired and `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` were all normalized to the bare final version `2.0.0` (no prerelease/RC suffix). `scripts/package-portable.mjs`'s RC-vs-final labeling logic is unchanged (it already derives "release candidate" purely from whether the version string carries a prerelease identifier), so a bare `2.0.0` now packages and labels as the real final release. **This is a version-metadata change only** -- it does not merge PR #4 or PR #19, does not create a `v2.0.0` git tag, and does not constitute Release Closure; see Release Truth above.
- **Fail-closed native verification performed** (against the version-scheme-corrected candidate build, produced by the real `npx tauri build` bundle pipeline -- not a raw `cargo build --release`, which does not embed the production frontend and produces a non-functional binary that tries to reach the dev server):
  - `cargo check` / `cargo build` / `cargo build --release` (`src-tauri`) all succeed.
  - `cargo test --manifest-path src-tauri/Cargo.toml`: 7/7 Rust unit tests pass (native filesystem authorization + Library watcher).
  - `npx tauri build`: completes successfully, producing the NSIS installer, the MSI installer, and the `gedankenfaden.exe` release binary used by the portable packager.
  - `node scripts/package-portable.mjs` run locally against the `tauri build`-produced release binary: produces a correctly labeled portable zip, `README.txt`, and `manifest.json`.
  - A native cold-start smoke test (real Windows process launch + `PrintWindow`-based screenshot capture, never touching real user data) confirms the `tauri build`-produced binary actually renders the application UI -- see the delivery report for confirmation this was re-run against the corrected binary after an earlier raw-cargo binary was found to be non-functional.
  - Full existing GitHub Actions pipeline (Windows native `cargo build --release`, `tauri build` NSIS+MSI bundle, portable packaging, and the `Verify Release Artifacts Exist` fail-closed check) re-run on the RC branch's exact-head CI -- see the delivery report for the run link/result.
- **Isolated V1-to-V2 compatibility smoke**: `src/test/v2-rc-a-v1-compat-smoke.test.ts` hand-builds a `.mflow` zip byte-for-byte matching what V1.0.0's container writer actually produced (schema version `1.0`, `meta.generator: 'Gedankenfaden 1.0'`, no V2-only optional fields), then proves the current `parseMflowFromBytes`/`deserializeDocument` open it and the current `packageDocumentToMflow`/`serializeDocument` can resave it losslessly, for both Mind Map and Flowchart mode. Entirely synthetic fixture data -- no real user file, path, or library directory is touched.
- **Genuine release blocker found and fixed during RC-A's own fail-closed verification (dev-tooling)**: after a local `cargo build --release`, Tauri's build script writes generated codegen HTML assets under `src-tauri/target/`, which Vite's dependency-scanner then picked up as extra entry points, hanging/breaking the two real-headless-Chrome consumer tests (`f06-pdf-diagram-consumer.test.ts`, `f09-browser-raster-consumer.test.ts`) whenever a native build had already run before `npm test`. Fixed narrowly with `optimizeDeps: { entries: ['index.html'] }` in `vite.config.ts` -- no packaging/bundling architecture change. Regression evidence: `src/test/v2-rc-a-vite-config-entries.test.ts` asserts the real resolved Vite config, plus both consumer tests re-verified green (16-17s each, back to healthy baseline) after the fix, with a fresh native release build already on disk.
- **Explicitly out of scope for RC-A** (per the batch's own boundary): no Product Hardening rework, no UI polish, no new features, no `v2.0.0` tag/release, no merge of PR #4 or the RC child PR, no advancing `PROJECT_STATUS.md`/`ROADMAP.md`/`.github/V2_DEFECT_LEDGER.md` past "RC-A complete, next is M7-B Human Acceptance."

---

## 4. Historical V1 Foundation & Release Baseline (Frozen `v1.0.0`)

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

## 5. Git, Governance & Privacy Boundaries

- **Active Branch**: `v2.0.0-upgrade`.
- **RC Branch**: `rc/v2.0.0-release-candidate` (child PR into `v2.0.0-upgrade`, not `main`).
- **Force Push Policy**: Strictly prohibited (`git push --force` forbidden).
- **PR State**: PR #4 remains Open and in Draft status until all V2 macro stages (including UI Reconstruction and V2 RC) are complete. The RC-A child PR is likewise not merge-ready and requires explicit human review.
- **Privacy Exclusions**: `.prompt-drafts/`, `.claude/`, `Gedankenfaden-dev-source/`, `dist-portable/`, and private test corpora are strictly excluded from git tracking.

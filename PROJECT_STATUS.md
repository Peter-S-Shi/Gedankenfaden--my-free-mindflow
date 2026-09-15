# Project Status: Gedankenfaden

**Current Program**: Gedankenfaden v2.0.0 -- RELEASED / STABLE  
**Active Branch**: `main`  
**Stable Published Baseline**: `v2.0.0` on `main` (`v1.0.0` is now the historical baseline; see Section 5)  
**V2 Product Hardening**: COMPLETE / PASS (Repair Queue Closure: PASS)  
**Layout Engine Reconstruction**: COMPLETE (Merged into `v2.0.0-upgrade`, then into `main`)  
**V2 M3 UI Reconstruction**: COMPLETE / HUMAN ACCEPTANCE PASS  
**Flowchart Fidelity Closure (F6-F10)**: COMPLETE / PASS (`cbbaf70`) -- multiline text, canvas pattern, edge width, theme color, and font-family fidelity  
**Final Export Product Hardening Closure (EX-01..EX-11)**: COMPLETE / PASS (`9bc1e9e`) -- hierarchy-export gating, JSON Canvas standard fidelity, numbering/annotation/background/visual-resolver export parity, PDF text-aware geometry, Unicode filenames, icon/image export  
**V2 Release Candidate Phase A (RC-A)**: COMPLETE -- version/package-config unification, native Windows release build + NSIS/MSI/portable artifact verification, and an isolated v1.0.0-to-v2.0.0-candidate `.mflow` compatibility smoke (see Section 3). The machine version was normalized to the final `2.0.0` (no prerelease/RC suffix) -- previously stale `1.0.0` residue in `package.json`/`tauri.conf.json`/`Cargo.toml`/CI/packaging script, then briefly an interim numeric-only prerelease identifier, both retired.  
**V2 Release Candidate Phase B (RC-B) & Human Acceptance**: COMPLETE / PASS -- real human-operated smoke of the packaged `2.0.0` build, plus independent V2 M3 UI Reconstruction human acceptance. See Section 4 for full evidence, including the Active Library Folder cross-root cache-leakage defect this pass found and its fix.  
**Portfolio Packaging**: COMPLETE -- public-facing screenshots captured and committed at `assets/v2pp/PP01.png`-`assets/v2pp/pp07.png`; README refreshed to a real V2 showcase.  
**Release Closure**: COMPLETE -- PR #19 integrated into `v2.0.0-upgrade`; PR #4 integrated into `main`; `v2.0.0` tagged and published as a GitHub Release with GitHub-hosted NSIS/MSI/portable artifacts.  
**Next Macro Stage**: Post-release maintenance and future updates (no open V2 macro stage remains).  
**Release Truth**: all V2 functional and release gates are PASS. `v2.0.0` is the current stable published baseline on `main`. The Windows release binaries are GitHub-hosted NSIS/MSI/portable artifacts and remain unsigned (Windows will show an unknown-publisher warning) -- no code-signing has been performed or claimed.  
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
| **UI Reconstruction (V2 M3)** | **COMPLETE (PASS)** | Text-first dynamic sizing, border hover resize, 8 context menu families, collapsible Inspector, independent icon picker -- independently human-accepted in RC-B (Section 4) |
| **Flowchart Fidelity Closure (F6-F10)** | **COMPLETE (PASS)** | `cbbaf70`; focused + full suite (58/58, 428/428) green; exact-head CI `34917893819` SUCCESS |
| **Final Export Product Hardening Closure (EX-01..EX-11)** | **COMPLETE (PASS)** | `9bc1e9e`, `src/export/exportScene.ts`; full suite (499/499) green; exact-head CI `34920635735` SUCCESS |
| **V2 Release Candidate Phase A (RC-A)** | **COMPLETE** | Branch `rc/v2.0.0-release-candidate`; version/config normalized to final `2.0.0` (no prerelease/RC suffix); native release build + NSIS/MSI/portable verified via the correct `tauri build` bundle pipeline; V1-compat smoke `src/test/v2-rc-a-v1-compat-smoke.test.ts` |
| **V2 Release Candidate Phase B (Human Acceptance)** | **COMPLETE (PASS)** | Real human-operated smoke of the packaged `2.0.0` build (install/portable launch, cold start, `.mflow` open, save/reload journey, recovery check) plus independent V2 M3 UI acceptance; found and closed an Active Library Folder cross-root cache-leakage defect (`ac0632d9`, see Section 4) |
| **Portfolio Packaging** | **COMPLETE** | Public-facing screenshots `assets/v2pp/PP01.png`-`assets/v2pp/pp07.png`; README refreshed to a real V2 showcase |
| **Release Closure** | **COMPLETE** | PR #19 integrated into `v2.0.0-upgrade`; PR #4 integrated into `main`; `v2.0.0` tagged and published as a GitHub Release with GitHub-hosted NSIS/MSI/portable artifacts |
| **Umbrella PR #4** | **MERGED** | Base: `main`, Head: `v2.0.0-upgrade` -- integrated as part of Release Closure |

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

- **Status**: **COMPLETE**. This phase was a version/package-configuration audit plus native build verification -- it did not redesign or reopen anything already accepted in Product Hardening. RC-A itself did not promote the `v2.0.0` release; that promotion is recorded as complete separately in Section 4 (RC-B & Release Closure), once human acceptance had actually passed.
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
- **Historical note -- RC-A's own scope boundary**: at the time this phase ran, it was explicitly scoped to exclude Product Hardening rework, UI polish, new features, a `v2.0.0` tag/release, or any merge of PR #4/the RC child PR, and it explicitly did not advance status docs past "RC-A complete, next is M7-B Human Acceptance." That boundary was correct for RC-A itself; the subsequent RC-B Human Acceptance pass and Release Closure (Section 4) have since completed everything that boundary deferred.

---

## 4. V2 Release Candidate Phase B (RC-B) & Release Closure (COMPLETE)

- **Status**: **COMPLETE / PASS**. Real, human-operated acceptance of the packaged `2.0.0` candidate build, following the V1 acceptance model (a minimal packaged-candidate smoke, not a second full end-to-end regression of already-closed Product Hardening), plus V2 M3 UI Reconstruction's own independent human acceptance pass.
- **RC-B packaged-candidate smoke evidence** (human-operated, on the real packaged `2.0.0` build):
  - Install/portable launch and real application cold start (not a dev-server proxy) confirmed rendering the actual application UI.
  - Active Library Folder switched Folder A -> Folder B -> back to A, with a Rescan Disk cycle exercised at each step, confirming the visible Library stays correctly scoped to the active root.
    - **Defect found and fixed during this pass**: this exact A -> B -> A exercise surfaced a genuine cross-root cache-leakage bug -- `syncLibraryWithDisk` seeded its merge from the *entire* persisted `library.json` cache rather than scoping it to the currently active root(s), so a previous folder's entries survived the "still exists on disk" prune check forever and leaked into the newly active folder (and back again on switching back). Fixed in commit `ac0632d9dd4a116fdb10ead6ef48d250170df159` by scoping the cache-seed merge to the active `scanDirs`. Automated regression coverage: `src/test/v2-rc-active-library-folder-cross-root-leak.test.ts` (exercises the same three-step Folder A -> Folder B -> switch back to A sequence). The fix was then re-verified with a second human Active Library Folder A -> B -> A + Rescan Disk pass, confirming isolation holds.
  - `.mflow` file opened via Windows Explorer file association.
  - One representative edit -> save -> close -> reopen persistence journey completed with no data loss.
  - Forced-crash recovery: the process was force-terminated mid-edit; relaunch correctly surfaced the Crash Recovery prompt with unsaved work intact.
- **V2 M3 UI Reconstruction human acceptance**: **PASS**, independently exercised end to end: text-first dynamic node sizing, left/right border hover resize handles, the 8-family right-click context menu, the collapsible Inspector, the independent icon picker, and Focus Mode.
- **Portfolio Packaging**: **COMPLETE**. Public-facing screenshots captured and committed at `assets/v2pp/PP01.png` through `assets/v2pp/pp07.png`; `README.md` refreshed to a real V2 showcase using them (Library, Mind Map, and Flowchart views) rather than the old V1 `assets/readme/` screenshots.
- **Release Closure**: **COMPLETE**. PR #19 (RC engineering: RC-A version/config unification, the Active Library Folder cross-root corrective, and RC-B evidence) is integrated into `v2.0.0-upgrade`; PR #4 (the V2 umbrella) is integrated into `main`; `v2.0.0` is tagged and published as a GitHub Release with GitHub-hosted NSIS/MSI/portable artifacts. Exact-head CI SUCCESS: run `34976631500` (#74) at `a86b6e85838bd7be6531b1b6fbbecfbae931e631`. The Windows binaries remain unsigned (Windows shows an unknown-publisher warning); no code-signing has been performed or is claimed anywhere in this document.

---

## 5. Historical V1 Foundation & Release Baseline (Frozen `v1.0.0`)

> The sections below document the frozen historical `v1.0.0` release baseline. `v1.0.0` was superseded on `main` by `v2.0.0` at Release Closure (Section 4); this section is preserved as historical record.

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

## 6. Git, Governance & Privacy Boundaries

- **Active Branch**: `main` (current stable branch, at `v2.0.0`).
- **RC Branch**: `rc/v2.0.0-release-candidate` -- historical release branch; its child PR (PR #19) was integrated into `v2.0.0-upgrade` as part of Release Closure.
- **Force Push Policy**: Strictly prohibited (`git push --force` forbidden).
- **PR State**: PR #4 (the V2 umbrella) and PR #19 (the RC child) are both merged release-path records: all V2 macro stages (Product Hardening, UI Reconstruction with human acceptance, RC-A, RC-B with human acceptance, and Portfolio Packaging) completed before either was integrated.
- **Privacy Exclusions**: `.prompt-drafts/`, `.claude/`, `Gedankenfaden-dev-source/`, `dist-portable/`, and private test corpora are strictly excluded from git tracking.

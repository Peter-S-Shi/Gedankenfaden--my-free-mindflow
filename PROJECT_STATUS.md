# Project Status: Gedankenfaden

**Current State**: Milestone 7-B Human Manual Acceptance PASS (Installer installation/uninstallation path explicitly deferred by user instruction, not a blocker) — M7-B Corrective Complete (Selection UX persistence across Inspector property edits, text editing, and canvas interactions repaired and verified) — All 20 Test Suites & 116 Tests Passing (100% Green) — Release Binary & Standalone Portable Package Empirically Verified with Live WebView2 CDP Probe — Ready for Release Closure  
**Current Milestone**: M7-B Corrective Complete / Next: Release Closure  
**Active Branch**: `rc/m7b-corrective-round1`  
**Official Remote**: `https://github.com/Peter-S-Shi/Gedankenfaden--my-free-mindflow.git`  
**Last Updated**: 2026-09-04  

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
| **M4 Native Verification Gate** | **Completed (PASS)** | Real Windows Rust/Cargo native compilation verified (`gedankenfaden.exe` 237MB) & CI Gate |
| **M5 Structured Import & Export** | **Completed (PASS)** | Markdown/OPML Importers, 11 Exporters Matrix, Image Node Pipeline |
| **Architecture Decisions** | **Completed & Incorporated** | Distilled into `ARCHITECTURE.md` |
| **V1 Feature Freeze** | **FROZEN (Feature Complete)** | All M1–M5 Features Implemented & Verified |
| **M6 Product Hardening & Polish** | **Completed (PASS)** | Empirical browser DOM benchmarks, 20-cycle memory slope verification, 1,000-node stress, resource disposal, production keyboard dispatcher & motion wiring |
| **M7-A RC Native Integration Prep** | **Completed (PASS)** | Gates A–H verified: Tauri native bridge, real filesystem library, Recycle Bin delete, `.mflow` OS association, release binary build, portable package, and empirical smoke test |
| **M7-B User Manual Acceptance** | **Completed (PASS)** | Human acceptance passed; installer install/uninstall path deferred by user; Selection UX corrective verified |
| **Product Freeze** | **FROZEN** | `PRODUCT_SPEC.md` |
| **Architecture Freeze** | **FROZEN** | `ARCHITECTURE.md` |
| **Milestone Roadmap** | **Frozen (M0–M7)** | `ROADMAP.md` |
| **Remote Repository** | **Synchronized & Active** | `origin/rc/m7b-corrective-round1` |


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
| **M7-B** | User Manual Acceptance Testing & Selection UX Corrective | **COMPLETED (PASS)** | Ready for Release Closure |

---

## 4. Git & Privacy Status

- **Current Active Branch**: `rc/m7b-corrective-round1`.
- **Privacy Exclusions**:
  - `grill/`, `prompt-drafts/`, `dist-portable/`, and `*.mflow` are strictly protected in `.gitignore` and `.git/info/exclude`.
  - Zero sensitive research notes, discovery files, machine-specific absolute paths, or credentials are tracked.
- **Remote Status**: Connected to official remote `https://github.com/Peter-S-Shi/Gedankenfaden--my-free-mindflow.git`.

---

## 5. Current State & Handoff
 
1. **Repository & Remote Synchronization**:
   - Branch `rc/m7b-corrective-round1` committed and pushed to `origin/rc/m7b-corrective-round1`.
   - Previous M7-A Remote CI run passed 100% green with all Windows installer & portable packaging artifacts verified.
2. **M7-B Corrective Fix (Selection UX Persistence)**:
   - Root Cause: React Flow node projection reconstructed nodes without selection state, resetting `selectedNodeId` on document mutations (Inspector updates, layout, text edit blur).
   - Solution: Promoted `selectedNodeId` to first-class interactive state in `CanvasEditor.tsx`, passed `selectedNodeId` through `canonicalToReactFlow`, preserved `node.selected` across all attribute updates, added input blur/Enter label synchronization via `onUpdateLabel` callback, and wired pane click deselect.
   - Preserved Codex uncommitted baseline: test app data isolation and clean native shutdown.
3. **Verification Summary**:
   - Automated Unit & Integration Tests: All 20 test files passed (116/116 tests, 100% green).
   - TypeScript Compilation (`tsc --noEmit`): 0 errors.
   - Vite Production Build (`npm run build`): 0 errors.
   - Tauri Native Release Build: `src-tauri/target/release/gedankenfaden.exe` (23.61 MB) compiled with embedded production bundle.
   - Standalone Portable Package: `dist-portable/Gedankenfaden-v0.1.0-rc-windows-x64-portable.zip` (6.52 MB).
   - Empirical Native Smoke Test (`verify-smoke-native.mjs`): 100% PASS via Chrome DevTools Protocol attached to real Windows WebView2 runtime (file association cold-start, multi-attribute Inspector edits with persistent selection, and pane click deselect).
4. **Next Milestone / Next Step**:
   - Release Closure (final merge to main, tagging, and formal GitHub release).
5. **Strict Boundaries Preserved**:
   - Feature Freeze respected (zero new functional features).
   - No force push under any circumstances.
   - Do NOT merge to `main`, do NOT tag `v1.0.0`, and do NOT create GitHub release without explicit user instruction.




# Gedankenfaden — Authoritative Roadmap (V1 Baseline & V2 Program)

**Document Status**: AUTHORITATIVE ACTIVE ROADMAP  
**Methodology**: Milestone-driven, Test-Verified, Autonomous Engineering Loop  
**Active Working Branch**: `v2.0.0-upgrade` (Umbrella PR #4: Draft)  
**Historical Stable Baseline**: `v1.0.0` on `main`  

---

## 1. V2 Reconstruction Program (Active Program)

The V2 program reconstructs the core layout architecture, hardens data-integrity and persistence layers against real desktop usage, modernizes the workspace user interface, and delivers a hardened, production-grade release.

```text
[ 1. V2 Reality Audit & Product Hardening ] (COMPLETE - PASS)
  ├── Sub-Milestone: V2 Layout Engine Reconstruction (COMPLETE - Merged)
  └── Sub-Milestone: Ticket Repair Queue & Corrective Passes (COMPLETE - PASS)
          │
          ▼
[ 2. Product Hardening Exit Gate ] (COMPLETE - PASS: CI 34797692094 & Native Windows Pass)
          │
          ▼
[ 3. UI Reconstruction (V2 M3) ] (IMPLEMENTATION COMPLETE / HUMAN ACCEPTANCE PENDING)
          │
          ▼
[ 4. V2 Release Candidate (RC) & Full Native Regression ] (PENDING - BLOCKED UNTIL HUMAN ACCEPTANCE)
          │
          ▼
[ 5. Release v2.0.0 & Portfolio Packaging Refresh ] (PENDING)
```

### V2 Milestone Breakdown

#### 1. V2 Reality Audit & Product Hardening
- **Status**: **COMPLETED (PASS)**
- **Scope & Accomplishments**:
  - Comprehensive reality audit across canonical graph model, rendering projection, export truthfulness, persistence, and native OS boundaries (F01–F14).
  - Child milestone **Layout Engine Reconstruction** (`v2-layout-engine-reconstruction`, PR #18): Rebuilt the balanced mind-map layout engine (`src/model/mindMapLayoutEngine.ts`), footprint-weighted bilateral balance, text-aware geometry estimation (`textMeasurement.ts`), high fan-out grid packing, and incremental edit stabilization (`stabilizeAgainst`).
  - Preserved manual node sizing semantics across document serialization, canvas manipulation, and export.
  - Resolved export fidelity issues for PDF (vector diagram), PNG/JPEG (genuine browser raster encoding), and SVG/HTML (full shape and styling representation).
  - Enforced authorized native filesystem boundaries in Tauri backend.

#### 2. Ticket Repairs, Corrective Passes & PH Exit Gate
- **Status**: **COMPLETED (PASS)**
- **Scope & Accomplishments**:
  - Closed defect tickets #7–#17 and verified focused regression suites.
  - Startup Library auto-hydration (#13): Persisted folder documents populate automatically on application launch without manual rescan.
  - Native lifecycle and recovery distinction (#14): Clean exit via window chrome / Alt+F4 cleanly terminates process with no false recovery banner; abrupt process kill (`taskkill`) triggers Crash Recovery with rolling snapshots intact.
  - Single-root invariant preservation on parent deletion (#16) and multi-node subtree drag translation (#17).
  - All 70+ test suites green; Windows native release build verified; exact-head CI run `34797692094` passed on Ubuntu and Windows.

#### 3. UI Reconstruction (V2 M3)
- **Status**: **IMPLEMENTATION COMPLETE / HUMAN ACCEPTANCE PENDING**
- **Scope & Accomplishments**:
  - Text-first dynamic node sizing for Mind Map nodes with single-line bias, 360px ceiling, and live height reflow, while manual width overrides remain authoritative.
  - Replaced bottom-right resize dot on Mind Map nodes with clean left/right border hover horizontal resize handles. Flowchart retains 2D `NodeResizer`.
  - Reconstructed 8-family right-click context menu (Clipboard, Topic Creation, Media, Numbering with maxDepth limits, separate Collapse and Expand submenus, Selection, Delete with keep-children vs subtree options, and Focus Mode) with viewport-aware flip/clamp submenus.
  - Reorganized Inspector into 6 collapsible structured sections (Node Appearance, Media & Grouping, Structure & Branch, Document Theme & Canvas, Connections, Document Info) preserving all styling controls.
  - Implemented Focus Mode with branch isolation, top banner, and Esc/F hotkey, plus low-zoom adaptive edge rendering.
  - Independent icon storage & visual icon picker across Canvas, Inspector, and serialization.

#### 4. V2 Release Candidate (RC) & Full Native Regression
- **Status**: **PENDING (BLOCKED UNTIL HUMAN ACCEPTANCE)**
- **Scope**:
  - End-to-end regression across all canvas modes, exporters, importers, and recovery systems.
  - Clean installer generation (NSIS, MSI) and standalone portable package validation.
  - Complete native smoke and cold-start verification.

#### 5. Release v2.0.0 & Portfolio Packaging Refresh
- **Status**: **PENDING**
- **Scope**:
  - Merge PR #4 to `main` via history-preserving merge.
  - Tag and publish release `v2.0.0` with signed/verified release artifacts.
  - Update public documentation, architectural overviews, and portfolio showcase.

---

## 2. Historical V1 Milestone Roadmap (Frozen `v1.0.0` Baseline)

> The sections below record the completed historical milestones (M0–M7) for the initial `v1.0.0` release.

### Milestone 0: Technical & Autonomous Loop Feasibility Spike (M0)
- **Status**: **COMPLETED (PASS)**
- Independent canonical document model and bi-directional adapter for React Flow.
- Signature motion implementations (Node Birth and Library Focus).

### Milestone 1: Canonical Foundation, Workspace Shell & Native Document Foundation (M1)
- **Status**: **COMPLETED (PASS)**
- Full canonical document schema v1.0, `.mflow` container packager, three-pane workspace shell, Theme/Inspector override foundation, transactional command history.

### Milestone 2: Mind Map Experience, Centered Bidirectional Layout & Keyboard Flow (M2)
- **Status**: **COMPLETED (PASS)**
- Centered bidirectional layout algorithm, LR/RL/TB presets, branch fold/unfold, keyboard navigation, multiline paste-to-structure, branch list numbering.

### Milestone 3: Flowchart Engine, Orthogonal Edge Routing & Group Containers (M3)
- **Status**: **COMPLETED (PASS)**
- Flowchart shapes (Terminal, Process, Decision, Data), orthogonal/smooth-step routing, editable edge labels, visual group containers.

### Milestone 4: Hybrid Library/Home, Tauri 2 Desktop Shell & Local Recovery (M4)
- **Status**: **COMPLETED (PASS)**
- Tauri 2 Rust wrapper, filesystem library scanning, debounced autosave, atomic writes, crash recovery modal.

### Milestone 5: Structured Import, Multi-Format Export & Node Image Pipeline (M5)
- **Status**: **COMPLETED (PASS)**
- Markdown/OPML outline import, 11 export formats (JSON, SVG, PNG, JPEG, PDF, Markdown, HTML, Mermaid, OPML, .mm, .canvas), embedded image container packaging.

### Milestone 6: Product Hardening, Performance & Edge-Case Polish (M6)
- **Status**: **COMPLETED (PASS)**
- Interaction budgets on reference hardware, 20-cycle memory slope verification, reduced-motion compliance, keyboard conflict audits.

### Milestone 7: Release Candidate, Packaging QA & Maintenance Transition (M7)
- **Status**: **COMPLETED (PASS)**
- Windows NSIS/MSI installers and portable package, clean-machine verification, release `v1.0.0` published on `main`.

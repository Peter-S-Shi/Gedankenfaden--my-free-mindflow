# Gedankenfaden — Authoritative Milestone Roadmap (V1)

**Document Status**: FROZEN BASELINE  
**Milestone Scope**: Formal Execution Roadmap for V1 Release  
**Methodology**: Milestone-driven, Test-Verified, Autonomous Engineering Loop  

---

## 1. Roadmap Architecture Overview

```text
[ M0: Feasibility Spike ] (COMPLETED - PASS)
          │
          ▼
[ M1: Canonical Foundation, Workspace Shell & Native Document Foundation ]
          │
     ┌────┴──────────────────────────┐
     ▼                               ▼
[ M2: Mind Map & Keyboard Flow ] [ M3: Flowchart & Routing ]
     └────┬──────────────────────────┘
          ▼
[ M4: Hybrid Library, Tauri 2 Shell & Local Recovery ]
          │
          ▼
[ M5: Structured Import, Multi-Format Export & Node Images ]
          │
    ================ FEATURE FREEZE ================
          │
          ▼
[ M6: Product Hardening, Performance & Edge Polish ]
          │
          ▼
[ M7: Release Candidate, Packaging QA & Baseline Freeze ]
```

---

## 2. Milestone Definitions & Exit Gates

### Milestone 0: Technical & Autonomous Loop Feasibility Spike (M0)
- **Status**: **COMPLETED (PASS)**
- **Objective**: Validate the core Web/canvas stack, canonical document model decoupling, signature motion interactions, and autonomous engineering loop self-repair.
- **Deliverables**:
  - Independent canonical document model and bi-directional adapter for React Flow.
  - Signature motion implementations (Node Birth and Library Focus).
  - Automated test suite and production build.
  - Completed feasibility reports.

---

### Milestone 1: Canonical Foundation, Workspace Shell & Native Document Foundation (M1)
- **Objective**: Formalize the production canonical graph document engine, single-file native container (`.mflow` packager/parser), three-pane workspace shell, Theme/Inspector override foundation, and transactional command history.
- **Scope**:
  - Implement full canonical document schema v1.0 with invariant validators.
  - Implement `.mflow` container packager (logical package with `document.json` and internal `assets/` store; verify ZIP container candidate).
  - Construct the Canvas-First workspace shell: collapsible left Outline/Structure panel, collapsible right Inspector, and floating Minimap.
  - Implement two-layer styling foundation: document-level Theme defaults, Inspector local override model, reset-to-theme semantics, and persistence of style overrides.
  - Implement transactional command history with compound actions and debounced drag tracking.
- **Exit Criteria**:
  - Automated test coverage for `.mflow` serialization and deserialization roundtrips.
  - Functional three-pane layout with fluid panel collapse/expand and responsive canvas resizing.
  - Verified undo/redo stack across node creation, text modification, and deletion.
  - Theme defaults and local style overrides correctly persist and render.

---

### Milestone 2: Mind Map Experience, Centered Bidirectional Layout & Keyboard-First Interaction (M2)
- **Objective**: Deliver the complete Mind Map editing experience, including the centered bidirectional balanced layout engine, keyboard-first interaction following desktop shortcut conventions, multiline paste-to-structure, and branch list numbering.
- **Scope**:
  - Implement the centered bidirectional balanced layout algorithm (central root topic with symmetrically balanced subtrees).
  - Implement layout presets: Left-to-Right (`LR`), Right-to-Left (`RL`), and Top-to-Bottom (`TB`).
  - Implement branch fold/unfold interaction with animated gather/unfurl transitions.
  - Implement keyboard-first interaction contract (`Enter` sibling, `Tab` child, `Space` edit, Arrow navigation).
  - Implement multiline paste-to-structure parser (indented text splits into hierarchical subtrees).
  - Implement dynamic branch/list numbering styles (1234, abcd, Roman numerals, bullets) with automatic renumbering on reorder/delete/reparent.
- **Exit Criteria**:
  - Real-time balanced tree layout recalculation upon node insertion or deletion.
  - Fast, fluid keyboard-only mind map creation without requiring mouse interaction.
  - Multiline clipboard paste accurately parses varying indentation depths into valid node hierarchies.
  - List numbering updates instantaneously upon branch reparenting without modifying canonical text.

---

### Milestone 3: Flowchart Engine, Orthogonal Edge Routing & Keyboard-First Graph Interaction (M3)
- **Objective**: Complete the Flowchart modeling engine, featuring standard diagramming shapes, clean orthogonal/smooth-step edge routing with obstacle avoidance, and visual node groupings.
- **Scope**:
  - Implement flowchart node shape family: Terminal (pill), Process (rounded rect), Decision (diamond with 4 connection ports), and Data (parallelogram).
  - Implement orthogonal / smooth-step edge routing algorithm with corner fillets and document-level Bezier toggle.
  - Implement editable edge labels with auto-centering and directional arrowheads.
  - Implement visual group containers (movable bounding boxes that encapsulate and drag child nodes collectively).
  - Support cyclic loops and bidirectional relationships.
  - Validate graph-specific keyboard mappings against the approved external reference audit, then store only the resulting neutral interaction contract in the repository.
- **Exit Criteria**:
  - Clean edge path rendering without awkward overlaps across common decision-loop topologies.
  - Group containers correctly translate all enclosed nodes during canvas drag operations.
  - Neutral graph-specific keyboard shortcuts operate reliably alongside canvas mouse tools.

---

### Milestone 4: Hybrid Library/Home, Tauri 2 Desktop Shell & Local Recovery Engine (M4)
- **Objective**: Bridge the application to the native Windows desktop via Tauri 2, implement the Hybrid Library/Home dashboard, and establish the invisible reliability and recovery system.
- **Scope**:
  - Set up Tauri 2 Rust desktop wrapper with native Windows window framing and file association for `.mflow`.
  - Implement the Hybrid Library: scan real Windows directories, watch for external filesystem changes, and maintain local metadata cache (`%APPDATA%\Gedankenfaden\library.json`).
  - Implement signature Library Focus motion (elevate on hover, recede surrounding cards).
  - Implement Invisible Reliability: debounced autosave, atomic writes (`.mflow.tmp` rename), dirty journal log, and bounded rolling local snapshots.
  - Implement startup crash recovery modal to restore unsaved work from snapshots.
- **Exit Criteria**:
  - Standalone Windows executable launches cleanly from desktop and opens `.mflow` files via double-click.
  - Files created or renamed in Windows Explorer reflect synchronously in the Library.
  - Simulated process kill during editing successfully prompts recovery and restores dirty state upon relaunch.
  - Native Windows desktop build verified via Cargo (`gedankenfaden.exe`) locally and on GitHub Actions `windows-latest` CI.

---

### Milestone 5: Structured Import, Multi-Format Export & Node Image Pipeline (M5)
- **Objective**: Implement the complete import and export matrix and the embedded node image pipeline.
- **Scope**:
  - Implement structured import pipeline:
    - Native `.mflow` / native JSON open and validation.
    - Markdown outline $\to$ Mind Map hierarchy.
    - OPML outline $\to$ Mind Map hierarchy.
    - Robust handling for malformed or unsupported input structures.
  - Implement pure canonical exporters: Native JSON, Vector SVG, Hierarchical Markdown, Standalone HTML with SVG embed, Mermaid diagram code, OPML outline, Legacy mind-map XML (`.mm`), and JSON Canvas (`.canvas`) open format.
  - Implement raster/document exporters: High-DPI PNG, JPEG, and vector printable PDF.
  - Implement node image import: process image data, bundle into `.mflow` `assets/` store, and resolve internal `asset://` URIs on canvas.
- **Exit Criteria**:
  - Structured Markdown and OPML import generate clean, navigable mind map trees.
  - All 11 export formats generate structurally valid, test-verified output files.
  - Documents containing embedded images travel between different Windows directories and machines without broken image references.
  - SVG and PDF exports render crisp vector text and paths at any zoom level.

---

### Milestone 6: Product Hardening, Performance & Edge-Case Polish (M6)
- **Status**: **COMPLETED (PASS)**
- **Objective**: Execute a strict Feature Freeze. Undertake intensive performance optimization, memory leak audits, and accessibility validation. Strictly zero new features.
- **Scope**:
  - Performance benchmarking: define and meet representative large-document interaction budgets during Product Hardening on documented reference Windows hardware.
  - Memory leak testing: verify clean resource disposal and zero persistent memory creep across extended editing sessions.
  - Accessibility audit: verify full `prefers-reduced-motion` compliance across all 9 signature motions.
  - Keyboard conflict audit: ensure zero collisions between canvas shortcuts, panel toggles, and text editing.
  - Stress testing: large file load/save, rapid undo/redo cycles, and extreme canvas zoom bounds.
- **Exit Criteria**:
  - Verified fluid interaction budgets on reference Windows hardware with representative large document loads.
  - Clean resource disposal with zero persistent memory creep.
  - Comprehensive automated regression test suite passing across all components.

---

### Milestone 7: Release Candidate, Packaging QA & Maintenance Transition (M7)
- **Status**: **COMPLETED (PASS)**
- **Objective**: Package the final V1 Release Candidate, execute full manual acceptance QA on clean Windows environments, and transition the project to maintenance mode.
- **Scope**:
  - Build Windows installer (NSIS, MSI) and portable executable distributions via Tauri 2.
  - Execute full manual acceptance matrix covering clean install, file associations, offline usage, and uninstallation (installer manual install/uninstall path explicitly user-deferred, not a blocker).
  - Resolve final UX corrective findings (Selection UX persistence across Inspector edits and canvas interactions).
  - Freeze all user documentation, keyboard shortcut cheat sheets, and architecture references.
  - Establish release baseline tag (`v1.0.0`) in Git.
  - Transition repository status to Current Version Complete / Maintenance Mode.
- **Exit Criteria**:
  - Verified installation and execution on clean Windows 10 and Windows 11 environments.
  - Clean packaging lifecycle leaving zero unintended residual files upon uninstall.
  - All authoritative documentation perfectly matches the final released binary.
  - V1 Product Development successfully concluded; Maintenance Mode active.

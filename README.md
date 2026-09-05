# Gedankenfaden — My Free Mindflow

A free, local-first Windows desktop workspace for mind maps and flowcharts, built for fluid personal visual thinking.

---

## 1. Product Philosophy & Target User

Gedankenfaden is built for developers, researchers, technical writers, and systems thinkers who need a distraction-free, fluid workspace to reason through complex architectures, project outlines, and workflows.

- **Durable Local Ownership**: Your thoughts belong on your local drive. No mandatory accounts, no cloud sync, no tracking, and no proprietary vendor lock-in.
- **Single Canonical Graph**: Mind maps (hierarchical trees) and flowcharts (directed cyclic graphs) share the exact same underlying graph data model. Each document operates with a designated primary mode.
- **Soft Minimalism & Restrained Motion**: An aesthetic that breathes. The interface recedes to let your thoughts flow, using purposeful physical motion cues (grow, extend, elevate, recede) that reinforce structural changes without distracting.
- **Portfolio-Grade Engineering**: Crafted with rigorous architectural separation between canonical document state and canvas rendering projection.

---

## 2. V1 Capability Summary

- **Unified Canvas Modes**:
  - **Mind Map**: Centered bidirectional balanced layout by default (with LR / RL / TB presets), rooted parent-child hierarchy, supported cross-links, collapsible branches, and automatic list numbering (`1.`, `a.`, `i.`, bullets).
  - **Flowchart**: General directed graphs with cycles, orthogonal / smooth-step edge routing (with Bezier option), common flowchart shapes (terminal, process, decision, data), and structural node groups.
- **Canvas-First Workspace**:
  - Distraction-free canvas with collapsible left Outline/Structure panel, collapsible right Inspector, and a floating Minimap.
  - Full keyboard-first interaction model with established desktop shortcut conventions (Mind Map: Enter for sibling, Tab for child; universal: Space/direct typing for edit, Delete to remove, multiline paste-to-structure; Flowchart graph-specific shortcuts to be finalized in M3).
- **Embedded Visual Assets**:
  - Nodes support embedded images bundled directly into a portable single-file container (`.mflow`).
- **Hybrid Library & Home**:
  - Home dashboard reflecting real Windows folders while maintaining local metadata for recents, tags, and favorites, featuring focused elevation and contextual recession dynamics.
- **Invisible Reliability**:
  - Debounced background autosave, atomic filesystem writes, crash recovery journal, and bounded rolling local snapshots.
- **Structured Import & Multi-Format Export**:
  - Native lossless JSON, vector SVG, raster PNG/JPEG, printable PDF, hierarchical Markdown, standalone HTML, Mermaid diagram code, OPML, Legacy mind-map XML (`.mm`), and JSON Canvas (`.canvas`) open format.

---

## 3. Scope Boundaries (Explicit V1 Non-Goals)

To guarantee software polish, reliability, and zero runtime bloat, the following are strictly excluded from V1:

- **No Cloud Sync / Third-Party Storage**: Operates 100% on the local Windows filesystem.
- **No Multi-User Collaboration / Accounts**: Single-user desktop tool with zero authentication friction.
- **No AI Whole-Map Generation**: Preserves pure human-in-the-loop visual thinking without token hallucinations or generative noise.
- **No Mobile / Web SaaS Target**: Purpose-built and optimized exclusively for Windows desktop.
- **No Presentation / Pitch Mode**: Focuses purely on visual thinking and authoring.
- **No Template Marketplace / Social Plugins**: Clean, private, zero-bloat standalone software.

---

## 4. High-Level Architecture

Gedankenfaden enforces a strict unidirectional projection architecture:

```text
┌────────────────────────────────────────────────────────┐
│             Native .mflow Container                    │
│      (Logical: document.json + embedded assets/        │
│       ZIP package candidate to be verified in M1)      │
└──────────────────────────┬─────────────────────────────┘
                           │ Deserialization / Serialization
┌──────────────────────────▼─────────────────────────────┐
│          Canonical Document State (Pure TypeScript)     │
│   - Nodes, Edges, Groups, Viewport, Document Metadata  │
│   - History Manager (Undo / Redo Transactions)         │
│   - Auto-Layout Engine (Dagre / Radial Hierarchy)      │
└──────────────────────────┬─────────────────────────────┘
                           │ Bi-directional Projection Adapter
┌──────────────────────────▼─────────────────────────────┐
│       UI Projection & Rendering Layer (React 19)       │
│   - React Flow (@xyflow/react) as Canvas Projection    │
│   - Custom Nodes (DOM/SVG, inline editor, animations)  │
│   - Outline Panel, Inspector, Library/Home Dashboard   │
└──────────────────────────┬─────────────────────────────┘
                           │ Desktop Shell Bridge
┌──────────────────────────▼─────────────────────────────┐
│         Tauri 2 Native Windows Desktop Shell           │
│   - Direct Windows File System I/O & Atomic Saves      │
│   - Native Window Controls & System File Associations  │
└────────────────────────────────────────────────────────┘
```

---

## 5. Repository Lifecycle & Document Directory

- **Current Lifecycle State**: **V1 Released (v1.0.0)** — Milestones M0–M7 Complete with PASS verdicts; V1 Product Development Closed; Maintenance Mode Active.
- **Authoritative Project Documentation**:
  - [PRODUCT_SPEC.md](PRODUCT_SPEC.md): Complete V1 product behavior contract, user interactions, keyboard shortcuts, and visual specification.
  - [ARCHITECTURE.md](ARCHITECTURE.md): Authoritative technical architecture, data models, Tauri 2 integration, and verified vs unverified items.
  - [ROADMAP.md](ROADMAP.md): Complete milestone roadmap (M0 to M7), dependency sequence, and acceptance criteria.
  - [PROJECT_STATUS.md](PROJECT_STATUS.md): Real-time repository status, validation evidence, and next immediate actions.

---

## 6. Quick Start

### Running the Native Application
- Download the latest Windows release from GitHub Releases (MSI, NSIS setup, or standalone portable ZIP).
- Or run the local native release binary:
  ```cmd
  start-gedankenfaden-rc.cmd
  ```

### Development & Source Build
- **Prerequisites**: Node.js >= 20.19, npm >= 10.x, Rust (stable with Windows GNU/MSVC toolchain)
- **Install & Test**:
  ```cmd
  npm install
  npm test
  ```
- **Build Web Assets & Native Binary**:
  ```cmd
  npm run build
  npx tauri build --no-bundle
  ```
- **Web Preview**:
  ```cmd
  start-gedankenfaden.cmd
  ```

---

## 7. License

License has not yet been selected.

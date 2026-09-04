# Gedankenfaden — Authoritative Architecture Contract

**Document Status**: FROZEN BASELINE  
**Milestone Scope**: Architecture Definition for V1 Release  
**System Type**: Windows-First, Local-First Desktop Application  

---

## 1. Core Architectural Principles

1. **Canonical Decoupling**: The visual rendering library (React Flow) is strictly an editor projection layer. The canonical document model is the sole source of truth and has zero dependency on UI frameworks.
2. **Unified Document Model**: A single graph data representation accommodates both hierarchical rooted trees (Mind Maps) and directed general graphs (Flowcharts). Each document specifies a primary mode.
3. **Durable Local Ownership**: Documents are self-contained, portable single-file packages (`.mflow`) on the local Windows filesystem.
4. **Pure Adapters**: Import/export formats and layout algorithms are isolated transformation adapters that read from or write to the canonical document model.

---

## 2. Layered Architecture Diagram

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                       Tauri 2 Native Desktop Shell                         │
│  - Native Windows Window Management (Frameless / Native Titlebar)         │
│  - Local Filesystem Bridge (Atomic Saves, Temp Renames, Dir Watching)      │
│  - Shell Lifecycle (Graceful Shutdown, Crash Detection, Single Instance)  │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │ IPC / Webview Bridge
┌─────────────────────────────────────▼──────────────────────────────────────┐
│                    Application State & Workspace Shell                      │
│  - Hybrid Library Manager (Real Folder Watcher + Local Metadata Cache)     │
│  - Persistence & Recovery Engine (Autosave, Snapshots, Journal Log)        │
│  - Document Container Manager (.mflow Packaging / Asset Resolver)          │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
┌─────────────────────────────────────▼──────────────────────────────────────┐
│                     Canonical Document Model Core                          │
│  - TypeScript Canonical Schema (Nodes, Edges, Groups, Viewport, Meta)      │
│  - Transactional Command History (Undo / Redo Stack)                       │
│  - Invariant Validators (Tree Integrity, Cycle Checks, ID Uniqueness)     │
└───────────────────┬──────────────────────────────────┬─────────────────────┘
                    │                                  │
      Projection    │                                  │ Pure Transformation
      Adapter       │                                  │ Adapters
┌───────────────────▼──────────────────┐   ┌───────────▼─────────────────────┐
│  React Flow Canvas Projection Layer  │   │     Export & Layout Adapters    │
│  - @xyflow/react Engine (Pan/Zoom)   │   │  - Dagre Layout Engine (LR/TB)  │
│  - Custom Node Components (DOM/SVG)  │   │  - Bidirectional Radial Layout  │
│  - Signature Motion Hooks (CSS/RAF)  │   │  - Exporters: SVG, JSON, MD,    │
│  - Outline & Inspector Panels        │   │    Mermaid, OPML, XML, PDF      │
└──────────────────────────────────────┘   └─────────────────────────────────┘
```

---

## 3. Canonical Document Model Specification

### 3.1 Document Schema Definition
The canonical document model is defined in pure TypeScript without any DOM or canvas dependencies:

```typescript
export type DocumentMode = 'mindmap' | 'flowchart';

export interface NodeGeometry {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface NodeStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  textColor?: string;
  fontSize?: number;
  fontFamily?: string;
  borderRadius?: number;
  shape?: 'rectangle' | 'rounded' | 'pill' | 'diamond' | 'parallelogram';
}

export interface NodeNumberingRule {
  level1Style?: 'decimal' | 'alpha' | 'roman' | 'bullet' | 'none';
  level2Style?: 'decimal' | 'alpha' | 'roman' | 'bullet' | 'none';
}

export interface CanonicalNode {
  id: string;
  text: string;
  geometry: NodeGeometry;
  type?: 'default' | 'root' | 'process' | 'decision' | 'terminal' | 'data';
  parentId?: string; // Defines hierarchical tree structure in Mind Map mode
  assetRef?: string; // Internal URI: "asset://img_<id>.<ext>"
  style?: NodeStyle;
  numbering?: NodeNumberingRule;
  collapsed?: boolean; // If true, child branches are gathered
  manualOffset?: { dx: number; dy: number }; // Preserves manual fine-tuning
  data?: Record<string, unknown>;
}

export interface CanonicalEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  type?: 'smoothstep' | 'bezier' | 'straight' | 'orthogonal';
  isCrossLink?: boolean; // Secondary cross-hierarchy connection in Mind Map mode
  style?: {
    stroke?: string;
    strokeWidth?: number;
    dashed?: boolean;
    arrowEnd?: boolean;
  };
}

export interface CanonicalGroup {
  id: string;
  title: string;
  nodeIds: string[];
  bounds?: { x: number; y: number; width: number; height: number };
  style?: {
    backgroundColor?: string;
    borderColor?: string;
  };
}

export interface ViewportMetadata {
  x: number;
  y: number;
  zoom: number;
}

export interface CanonicalDocument {
  schemaVersion: '1.0';
  id: string;
  title: string;
  mode: DocumentMode;
  createdAt: string;
  updatedAt: string;
  viewport: ViewportMetadata;
  theme: {
    paletteId: string;
    canvasBackground: 'blank' | 'dots' | 'grid';
    fontFamily: string;
    defaultEdgeRouting: 'smoothstep' | 'bezier' | 'orthogonal';
  };
  nodes: CanonicalNode[];
  edges: CanonicalEdge[];
  groups: CanonicalGroup[];
  metadata?: Record<string, unknown>;
}
```

---

## 4. Projection & Adapter Boundary

### 4.1 Unidirectional Projection Contract
React Flow (`@xyflow/react`) is treated solely as an interactive virtual DOM renderer. State transitions flow unidirectionally:

```text
User Interaction (Canvas Drag / Keypress / Input)
     │
     ▼
Command Transaction Dispatched
     │
     ▼
Canonical Document Updated & Validated
     │
     ▼
Bi-Directional Adapter (canonicalToReactFlow)
     │
     ▼
React Flow Nodes & Edges Re-rendered
```

### 4.2 Adapter Transformation Rules
- **`canonicalToReactFlow(doc)`**: Converts `CanonicalNode[]` to `Node<CustomNodeData>[]`, injecting presentation decorators (such as computed numbering prefixes `1.`, `a.`, birth animation flags, and asset URLs).
- **`reactFlowToCanonical(rfNodes, rfEdges, baseDoc)`**: Synchronizes user repositioning, dimension edits, and interactive edge connections back into the canonical model, preserving node hierarchy and metadata.

---

## 5. Command & History Architecture

- **Transactional History**: The `HistoryManager` maintains an undo and redo stack of immutable canonical document snapshots.
- **Debounced Position Tracking**: Node dragging emits transient position updates for smooth canvas motion, but commits to the history stack only upon drag completion (`onNodeDragStop`), preventing stack pollution.
- **Compound Commands**: Complex operations (such as multiline paste or deleting a node with its entire subtree) execute as a single atomic transaction.

---

## 6. Layout Strategy & Engine Boundaries

### 6.1 Layout Engine Separation
The auto-layout engine is an isolated pure function:
$$\text{layout}(D_{\text{canonical}}, \text{options}) \to D_{\text{canonical}}'$$

### 6.2 Supported Layout Engines
1. **Dagre Engine (Proven in M0)**:
   - Permissive pure-JS directed graph layout.
   - Powers `LR` (Left-to-Right), `RL` (Right-to-Left), and `TB` (Top-to-Bottom) hierarchical flowcharts and unilateral mind maps.
2. **Centered Bidirectional Layout (V1 Frozen Default for Mind Maps)**:
   - Roots the central topic at $(0, 0)$.
   - Partitions top-level child subtrees into Left and Right wings based on subtree height and node count balancing.
   - Runs layout on both wings independently and projects symmetrically around the central topic.
   - *Status*: Algorithm architecture frozen; scheduled for full implementation and verification in M2.

---

## 7. Native Container & Asset Strategy (`.mflow`)

### 7.1 Single-File Logical Container
V1 uses a portable single-file `.mflow` container whose logical contents are a versioned canonical document plus embedded assets. A ZIP-based package is the leading implementation candidate and will be verified in M1 before the physical container format is considered implementation-frozen:

```text
document.mflow (Logical Single-File Container / ZIP Candidate)
├── document.json        <-- Canonical document JSON schema v1.0
├── meta.json            <-- (Candidate for M1: lightweight preview metadata)
└── assets/              <-- Encapsulated binary media files
    ├── img_01.png
    └── img_02.jpg
```

### 7.2 Asset Resolution Pipeline
- On image import:
  1. The image is loaded into memory, assigned an identifier (`img_<id>.<ext>`), and staged for packaging.
  2. The image data is bundled into the container's `assets/` directory.
  3. The canonical node records `assetRef: "asset://img_<id>.<ext>"`.
- During canvas rendering, the desktop shell or object URL provider resolves `asset://` URIs to local blob URLs.
- Moving or backing up the `.mflow` file never breaks image links.

---

## 8. Persistence, Autosave & Recovery Architecture

```text
[ Document Modified ]
         │
         ▼
[ Debounced Autosave Timer ] ──▶ [ Append Dirty Log (.recovery.log) ]
         │
         ▼
[ Write to Temp File: document.mflow.tmp ]
         │
         ▼
[ Atomic Filesystem Rename: .tmp ──▶ .mflow ]
         │
         ▼
[ Rolling Snapshot Rotator (Bounded retention in %APPDATA%\Gedankenfaden\snapshots) ]
```

- **Atomic File Writes**: Prevents partial or corrupted saves by writing to a temporary file on the same Windows volume and executing an atomic move/rename.
- **Rolling Local Snapshots**: Automatically archives historical milestones locally, providing effortless rollback without git complexity. Retention policy is implementation-tuned.
- **Crash Detection**: If `.recovery.log` indicates an ungraceful shutdown, the startup sequence triggers a recovery modal offering snapshot restoration.

---

## 9. Desktop Shell & Native Platform Strategy

### 9.1 Tauri 2 Selection Rationale
- **Binary Footprint**: Compact executable size utilizing the evergreen Windows Edge WebView2 runtime preinstalled on Windows 10/11.
- **Resource Efficiency**: Low baseline memory footprint and fast startup.
- **Security & Sandboxing**: Rust backend enforces strict file path boundaries and system integration.

### 9.2 Toolchain & Implementation Verification Note
- While Tauri 2 is the frozen V1 desktop shell architecture, the development machine used during the M0 spike lacked `rustc`, `cargo`, and MSVC C++ tools.
- Therefore, the M0 spike validated the web core and filesystem I/O directly via Node/Vite.
- Packaging of native Tauri 2 binaries will be executed once the Rust toolchain is active on the build host (scheduled in M4).

---

## 10. Privacy & Local-First Boundaries

- **Zero Network Egress**: The application makes 0 telemetry calls, 0 phone-home checks, and 0 remote API requests.
- **Local-Only Storage**: All documents, metadata, and snapshots reside exclusively on the user's physical disks.
- **Git Tracking Discipline**: The project repository strictly excludes `grill/`, `prompt-drafts/`, temporary cache files, and private workspace data from version control.

---

## 11. Architecture Verification Matrix

| Architectural Component | Target Architecture | Current Status | Evidence / Verification Path |
|---|---|---|---|
| **Canonical Model Decoupling** | Standalone TS schema | **Empirically Proven** | Verified in M0 (`src/model/`, Vitest unit tests). |
| **Projection Boundary** | Bi-directional adapter | **Empirically Proven** | Verified in M0 (`src/model/adapter.ts`, 9 unit tests). |
| **Core Editing & History** | Undo/Redo & React Flow | **Empirically Proven** | Verified in M0 (`CanvasEditor.tsx`, `history.ts`). |
| **Dagre Layout (LR / TB)** | Pure JS directed layout | **Empirically Proven** | Verified in M0 (`src/model/layout.ts`). |
| **Centered Bidirectional Layout** | Balanced Mind Map layout | **Architecture Frozen** | Algorithm designed; implementation in M2. |
| **Signature Motion System** | Birth, Elevate, Recede | **Empirically Proven** | Verified in M0 (`animations.css`, `LibraryHome.tsx`). |
| **Lossless JSON & SVG Export** | Pure XML / JSON adapters | **Empirically Proven** | Verified in M0 (`src/export/exporter.ts`). |
| **Tauri 2 Native Desktop Shell**| Rust + WebView2 | **Architecture Frozen** | Shell architecture frozen; toolchain verification in M4. |
| **`.mflow` Single-File Container**| Portable package (JSON+assets)| **Architecture Frozen** | Schema frozen; ZIP packager implementation in M1. |
| **Atomic Saves & Snapshots** | Temp rename + rollback | **Architecture Frozen** | File I/O verified in M0; snapshot pipeline in M4. |
| **Full Import/Export Matrix** | 11 formats | **Architecture Frozen** | JSON/SVG verified in M0; remaining formats in M5. |
| **Performance Budgets** | Large-document responsiveness | **Architecture Frozen** | Benchmarks to be verified in M6 on reference hardware. |

# M0 Technical Spike Report

**Milestone**: M0 — Technical & Autonomous Loop Feasibility Spike  
**Workspace**: `Gedankenfaden` (Local Workspace)  
**Status**: COMPLETE  
**Spike Outcome**: **PASS**  
**Stack Freeze Recommendation**: **PROCEED WITH CONDITIONS** (Freeze Web Core: React 19 + TypeScript + React Flow `@xyflow/react` + Dagre; Defer Native Desktop Shell binding between Tauri 2 and Electron until Rust toolchain presence is resolved).

---

## 1. Tested Stack Candidate

| Layer | Selected Candidate | Version | Evaluation / Role |
|---|---|---|---|
| **UI Framework** | React + React DOM | 19.0.0 | High reactivity, virtual DOM, modern hooks, component composition |
| **Language** | TypeScript | 5.8.2 | Strict typing, AST/schema safety for canonical documents |
| **Build Tool** | Vite | 6.2.0 | Instant HMR, ESM packaging, fast bundling |
| **Styling** | Tailwind CSS v4 | 4.0.0 | Soft minimalism, responsive UI tokens, low CSS overhead |
| **Canvas / Projection** | React Flow (`@xyflow/react`) | 12.4.4 | Editor projection layer (pan/zoom/drag/connect/handles) |
| **Auto-Layout Engine** | Dagre (`@dagrejs/dagre`) | 1.1.4 | Permissive pure-JS directed graph layout (LR and TB) |
| **Testing** | Vitest | 3.2.7 | In-memory unit & regression testing |
| **Desktop Shell** | Windows Desktop Runner / Local FS | Node 24 | Evaluated Tauri 2 prerequisites vs Lightweight Webview/Electron |

---

## 2. Implementation Scope & Architecture Verification

### Proof Track A — Core Graph Feasibility
- **Independent Canonical Document Model**:
  - Implemented in [`src/model/types.ts`](file:///F:/CodexWorkspaces/mindmap/src/model/types.ts) and [`src/model/document.ts`](file:///F:/CodexWorkspaces/mindmap/src/model/document.ts) with **zero dependencies on React Flow**.
  - Encapsulates `schemaVersion: '1.0'`, `mode` (`mindmap` | `flowchart`), `nodes`, `edges`, `groups`, and `viewport`.
  - Proved bi-directional projection via [`src/model/adapter.ts`](file:///F:/CodexWorkspaces/mindmap/src/model/adapter.ts): `canonicalToReactFlow()` and `reactFlowToCanonical()`.
- **Editing Primitives Verified**:
  - Create node (root, child, process, terminal).
  - Inline text editing with blur/enter/esc commit.
  - Interactive edge connection with handles.
  - Interactive drag, pan, zoom, fit view, and node deletion with edge cleanup.
  - Command History: Undo/Redo stack via [`src/model/history.ts`](file:///F:/CodexWorkspaces/mindmap/src/model/history.ts).
- **Auto-Layout & Manual Adjustability**:
  - Implemented via [`src/model/layout.ts`](file:///F:/CodexWorkspaces/mindmap/src/model/layout.ts) using Dagre. Supports `LR` (Left-to-Right for Mind Maps) and `TB` (Top-to-Bottom for Flowcharts).
  - Manual dragging and repositioning post-layout works seamlessly without losing canonical synchronization.

### Proof Track B — Signature Motion Feasibility
1. **Node Birth**:
   - Implemented in [`src/styles/animations.css`](file:///F:/CodexWorkspaces/mindmap/src/styles/animations.css) via `@keyframes nodeBirth` and hooked into `CustomNode.tsx`.
   - Motion language: `Add → connector extends → new node grows/fades into place` (240ms cubic-bezier curve, non-blocking).
   - Fully respects `@media (prefers-reduced-motion: reduce)`.
2. **Library Focus (Home Screen View)**:
   - Implemented in [`src/components/LibraryHome.tsx`](file:///F:/CodexWorkspaces/mindmap/src/components/LibraryHome.tsx).
   - Motion language: `Hover/focus → selected card elevates slightly + theme emphasis increases → surrounding cards recede modestly` (1.02x scale, -4px translation, 60% opacity recession on siblings).

### Proof Track C — Desktop / Local-First Feasibility
- Tested and verified direct Windows filesystem read/write via [`src/test/desktop-storage.test.ts`](file:///F:/CodexWorkspaces/Gedankenfaden/src/test/desktop-storage.test.ts).
- Verified stable Windows application data path (`%APPDATA%\Gedankenfaden`).
- Provided [`start-gedankenfaden.cmd`](file:///F:/CodexWorkspaces/Gedankenfaden/start-gedankenfaden.cmd) for one-click local Windows desktop launch and automated dependency/build verification.

### Proof Track D — Export Architecture Feasibility
- **Lossless Native JSON**: Fully implemented and tested via `exportToJSON()`.
- **Vector-Oriented SVG**: Pure headless SVG generation implemented in [`src/export/exporter.ts`](file:///F:/CodexWorkspaces/mindmap/src/export/exporter.ts) generating standards-compliant XML without DOM dependency.
- **Export Matrix Technical Assessment**: (See Section 5 below).

---

## 3. Evidence & Verification

### Automated Test Execution
Command: `npm.cmd test` (`vitest run`)
```text
 RUN  v3.2.7 F:/CodexWorkspaces/mindmap

 ✓ src/test/desktop-storage.test.ts (2 tests) 6ms
 ✓ src/test/model.test.ts (7 tests) 13ms

 Test Files  2 passed (2)
      Tests  9 passed (9)
   Duration  607ms
```

### Production Build Execution
Command: `npm.cmd run build` (`tsc --noEmit && vite build`)
```text
vite v6.4.3 building for production...
transforming...
✓ 2065 modules transformed.
dist/index.html                   0.80 kB │ gzip:   0.48 kB
dist/assets/index-CAG6rfVs.css   36.58 kB │ gzip:   7.28 kB
dist/assets/index-DWlN21IO.js   455.50 kB │ gzip: 146.83 kB
✓ built in 3.85s
```

### Loop Autonomous Failure & Repair Cycle
During the initial build pass, TypeScript compiler flagged 4 unused variables under strict `noUnusedLocals`:
- `CanvasEditor.tsx`: `useEffect`, `CanonicalNode`, `CanonicalEdge`
- `exporter.ts`: `tgtW`
**Autonomous Action**: Observed failure, analyzed root cause, applied minimal diffs via `replace_file_content`, retried build, verified zero compilation errors, and completed green test execution without blocking the user.

---

## 4. Licensing & Dependency Discipline

All dependencies in the spike use permissive, open-source licenses compatible with a public portfolio and local-first distribution:

| Package | License | Dependency Burden / Risk |
|---|---|---|
| `react` / `react-dom` | MIT | None |
| `@xyflow/react` | MIT | None (core is MIT; Pro features not required) |
| `@dagrejs/dagre` | MIT | None (pure JS layout, zero native bindings) |
| `lucide-react` | ISC | None |
| `vite` / `vitest` | MIT | Dev-only |
| `tailwindcss` | MIT | None |

**Conclusion**: Zero GPL/AGPL copyleft issues, zero paid license requirements, zero proprietary cloud runtime dependencies.

---

## 5. Exporter Matrix Technical Assessment

| Format | Direct / Transformed / Lossy | Likely Preservation Level | Implementation Risk | Dependency / Licensing Concern |
|---|---|---|---|---|
| **JSON (Native)** | Direct | **Complete** (Structure + Semantics + Presentation + Geometry) | Negligible | Pure native; zero dependencies. |
| **SVG** | Transformed | **High** (Visual Presentation + Vector Scalability) | Low | Implemented in spike; pure XML. |
| **PNG / JPEG** | Transformed | **High** (Visual Presentation, 0% semantics) | Low to Medium | Canvas rasterization (`html-to-image` or OffscreenCanvas). |
| **PDF** | Transformed | **High** (Print presentation, vector text) | Medium | Requires `jspdf` or `pdf-lib`. MIT licensed. |
| **Markdown** | Transformed (Lossy) | **Structure & Text Only** (Hierarchical bullets) | Very Low | Pure string parser; no layout geometry preserved. |
| **HTML** | Transformed | **Presentation / Interactive Preview** | Medium | Can bundle standalone SVG + micro-viewer. |
| **Mermaid** | Transformed (Lossy) | **Semantics & Graph Topology** (`graph TD`, `mindmap`) | Low | Direct syntax mapping (`A --> B`). Zero licensing risk. |
| **OPML** | Transformed (Lossy) | **Mind Map Hierarchy** (Outlines) | Low | Standard XML outline format for mindmaps. |
| **Legacy mind-map XML (`.mm`)** | Transformed (Lossy) | **Mind Map Hierarchy & Core Colors** | Medium | Legacy XML schema; straightforward tree translation. |
| **JSON Canvas (`.canvas`)** | Transformed | **High** (Open canvas node/edge alignment) | Low | Open JSON specification. |

---

## 6. Observed Limitations & Performance Notes

1. **Native Desktop Toolchain**:
   - The current Windows host does not have `rustc`, `cargo`, or Visual Studio C++ build tools installed.
   - Therefore, building Tauri 2 binaries requires installing Rust (~500MB) and MSVC C++ Build Tools (~1.5GB).
   - If user prefers zero native build toolchain overhead on dev machines, Electron or standard Node/Webview desktop shell offers immediate packaging.
2. **DOM vs Canvas Rendering Limits**:
   - React Flow renders nodes as HTML DOM elements and edges as SVG paths.
   - This provides superior styling, accessibility, and CSS animation capabilities (perfect for < 500 nodes).
   - For ultra-large graphs (> 2,000 nodes simultaneously active on screen), pure WebGL/Canvas (e.g. PixiJS or Konva) would be faster, but loses DOM styling and seamless animation fluidity. For a personal visual thinking tool, React Flow's sweet spot (50–500 nodes per document) is ideal.

---

## 7. Exit Gate & Recommendations

### Final Recommendation
**`PROCEED WITH CONDITIONS — Resolve listed narrow gates first`**

### Explicit Reasons
1. **Core Graph & Architecture**: Completely proven. Canonical document model is 100% decoupled from React Flow and serializes losslessly.
2. **Motion Language**: Both signature motions (Node Birth & Library Focus) are demonstrated with smooth, restrained transitions and reduced-motion fallbacks.
3. **Narrow Gates for Round 2 Grill**:
   - Gate 1: Finalize Desktop Shell binding (Tauri 2 with Rust toolchain installation vs Electron with zero new toolchain requirement).
   - Gate 2: Confirm export priority order for V1 (SVG and Native JSON are proven; prioritize Markdown/Mermaid vs PDF/PNG next).

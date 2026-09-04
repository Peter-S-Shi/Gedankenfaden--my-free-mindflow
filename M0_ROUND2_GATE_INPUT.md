# M0 Round 2 Grill Gate Input

**Milestone**: M0 — Technical & Autonomous Loop Feasibility Spike  
**Purpose**: Provide narrow, unresolved technical and UX decisions that genuinely require user alignment in Round 2 Grill.  
*(Note: Decisions already established in the Product Contract and Round 1 Grill—such as single-user, local-first, no cloud/collab, no mobile, canonical graph independence, and signature motion language—are strictly preserved and not re-asked).*

---

## Unresolved Decision 1: Desktop Shell Binding & Host Toolchain

### Context:
The local Windows host has Node.js v24.18.0 and npm 11.16.0 installed, but **lacks the Rust toolchain (`rustc`/`cargo`) and MSVC C++ build tools**.

### Choices:
- **Option 1.A (Tauri 2)**:
  - *Pros*: Smallest executable binary footprint (< 15 MB), minimal RAM footprint, utilizes Windows WebView2.
  - *Cons*: Requires installing Rust toolchain (~500MB) and MSVC C++ Build Tools (~1.5GB) on the development machine.
- **Option 1.B (Electron / Electron-Vite)**:
  - *Pros*: Runs immediately using existing Node.js toolchain; zero extra compilers required; mature native Windows file dialogs and window framing.
  - *Cons*: Larger binary package size (~80–90 MB) and higher baseline memory footprint (~100–120 MB RAM).
- **Option 1.C (Hybrid / Local App Launcher)**:
  - *Pros*: Vite preview / standalone app window launched via `start-gedankenfaden.cmd`; zero packaging overhead.
  - *Cons*: Relies on system browser window rather than customized native desktop titlebar.

---

## Unresolved Decision 2: V1 Exporter Staged Priority

### Context:
Lossless Native JSON and pure vector SVG exporter adapters are already implemented and proven in M0. The Round 1 grill requested a broad 10-format export matrix. For V1 delivery velocity, which secondary export tier should be prioritized immediately after SVG/JSON?

### Choices:
- **Priority Path A: Documentation & Markdown First**:
  - Implement `Markdown` (hierarchical outlines) and `Mermaid` (`graph TD` / `mindmap`) export. High developer utility, zero heavyweight external dependencies.
- **Priority Path B: Visual Sharing First**:
  - Implement `PNG/JPEG` (raster canvas screenshot) and `PDF` (printable vector). High presentation utility, requires rasterization/PDF libraries (`html-to-image`, `jspdf`).
- **Priority Path C: Interoperability First**:
  - Implement JSON Canvas (`.canvas`) open format and Legacy mind-map XML (`.mm`). High cross-tool integration for PKM (Personal Knowledge Management).

---

## Unresolved Decision 3: Mind Map Directional Expansion

### Context:
The M0 Dagre layout engine currently implements Left-to-Right (`LR`) tree hierarchy (root on left, children expanding rightward).

### Choices:
- **Choice 3.A**: Keep unidirectional Left-to-Right (`LR`) layout as the sole V1 Mind Map layout pattern.
- **Choice 3.B**: Support bidirectional radial expansion (Root node centered; odd children branch right, even children branch left).

---

## Unresolved Decision 4: Flowchart Edge Routing Default

### Context:
Flowcharts require clean edge crossings.

### Choices:
- **Choice 4.A**: Orthogonal / Smoothstep (step-based right-angle paths with rounded fillets).
- **Choice 4.B**: Smooth Bezier curves (flowing organic lines).
- **Choice 4.C**: Configurable per-edge or per-document style toggle.

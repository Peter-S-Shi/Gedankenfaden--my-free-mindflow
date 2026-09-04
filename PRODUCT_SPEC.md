# Gedankenfaden — Authoritative Product Specification (V1)

**Document Status**: FROZEN BASELINE  
**Milestone Scope**: Product Definition for V1 Release  
**Target Platform**: Windows 10/11 Desktop (x64)  
**Intake Status**: Feature Intake Closed  

---

## 1. Product Vision & Success Criteria

### 1.1 Product Definition
Gedankenfaden is a local-first, single-user desktop application for Windows designed for personal visual thinking. It unifies **Mind Mapping** (hierarchical, tree-centric ideation) and **Flowcharting** (directed, cyclic process modeling) on top of a single canonical graph data model.

### 1.2 Dual Success Criteria
1. **Primary**: A daily-driver personal tool that is fast to launch, visually calming (soft minimalism + restrained flowing motion), keyboard-fluid, completely private, and highly dependable.
2. **Secondary**: A portfolio-grade software artifact with exemplary architectural boundaries, comprehensive automated test suites, clean separation between document state and canvas projection, and reproducible build pipelines.

---

## 2. V1 Scope Boundaries & Non-Goals

### 2.1 Approved In-Scope Pillars
- Windows desktop executable with local file association (`.mflow`).
- Dual-mode canvas: Mind Map and Flowchart sharing the same document engine.
- Hybrid Library/Home dashboard reflecting real local Windows directories.
- Keyboard-first interaction model following established desktop shortcut conventions.
- Multiline paste-to-structure parser.
- Embedded image nodes packaged into a portable container.
- Dynamic branch/list numbering styles (1234, abcd, Roman, bullets).
- Signature motion language with reduced-motion accessibility.
- Invisible reliability: autosave, atomic writes, rolling snapshots, crash recovery.
- Structured import and multi-format exporter adapters (JSON, SVG, PNG, JPEG, PDF, Markdown, HTML, Mermaid, OPML, Legacy mind-map XML, JSON Canvas).

### 2.2 Explicit V1 Non-Goals (Strictly Excluded)
- **No Cloud Services / Sync**: No remote database, proprietary sync server, or cloud storage login.
- **No User Accounts / Auth**: Zero sign-up, sign-in, JWTs, or license activation keys.
- **No Real-Time Collaboration**: Single-user desktop ownership. No multi-cursor, CRDT/OT sync, or remote presence.
- **No Comments / Threaded Permissions**: No collaborative review workflows.
- **No AI Whole-Map Generation**: No LLM prompt-to-mindmap generation in V1.
- **No Mobile / Web SaaS Target**: Windows desktop is the sole V1 target.
- **No Presentation / Pitch Mode**: No slide transitions or presentation viewports.
- **No Template Marketplace**: No public sharing gallery, online rating system, or plugin store.
- **No Image OCR Import**: No image-to-text scanning or diagram vectorization.
- **No Lossless Mode Conversion**: Mind Map and Flowchart documents share one canonical graph architecture. Each document has a primary mode. Shared representation does not imply a V1 user-facing lossless mode-conversion feature.

---

## 3. Dual-Mode Canvas Contract

### 3.1 Mode Coexistence
Mind Map and Flowchart documents share one canonical graph architecture. Each document has a primary mode (`mindmap` or `flowchart`), which dictates default layout algorithms, connection constraints, and inspector properties.

### 3.2 Mind Map Mode Specifications
- **Data Invariants**: Rooted hierarchical tree structure. Each child node has exactly one primary parent (`parentId`). Cross-hierarchy relationships are supported via secondary directed cross-links (`crossLinks`).
- **Default Layout**: **Centered Bidirectional Balanced Expansion**.
  - The Root Node is placed centrally.
  - Subtrees branch outward to the right and left, automatically balanced by child node count or vertical height.
- **Layout Presets**:
  - `Balanced` (Default): Bidirectional left/right expansion.
  - `Left-to-Right (LR)`: Root on left, all branches grow rightward.
  - `Right-to-Left (RL)`: Root on right, all branches grow leftward.
  - `Top-to-Bottom (TB)`: Organizational tree downward.
- **Branch Collapse/Expand**:
  - Hovering a parent node reveals a fold toggle badge indicating hidden child count.
  - Collapsing gathers child nodes with a subtle smooth transition; expanding unfolds them smoothly.
  - Collapsed state is serialized into document metadata.
- **Manual Adjustment Preservation**:
  - Dragging a node after an auto-layout updates its manual offset; subsequent re-layouts respect manual positioning offsets.

### 3.3 Flowchart Mode Specifications
- **Data Invariants**: Directed general graph. Supports arbitrary node connections, cyclic loops, bidirectional flows, and multiple terminal nodes.
- **Standard Shape Vocabulary**:
  - **Terminal / Start-End**: Pill / rounded rectangle.
  - **Process Step**: Clean rounded rectangle.
  - **Decision**: Diamond shape with decision connection ports.
  - **Data / I/O**: Parallelogram shape.
- **Edge Routing Behavior**:
  - **Default**: **Orthogonal / Smoothstep** with rounded corner fillets.
  - **Alternative (Document Toggle)**: Smooth Bezier curves.
  - **Edge Features**: Center text labels, arrowheads (`target` marker default), optional dashed lines.
- **Visual Grouping**:
  - Rectangular group bounds enclosing multiple nodes with title header and custom boundary stroke/fill.
  - Dragging a group container moves all encapsulated nodes collectively.

---

## 4. Workspace & UI Layout Contract

### 4.1 Interface Architecture
The editor adopts a **Canvas-First** layout where visual thinking occupies the absolute maximum screen area:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Top Bar: [← Library]  Document Title   [Mind Map ▾]   Undo/Redo   Layout   Export   Save │
├──────────────┬──────────────────────────────────────────┬──────────────┤
│              │                                          │              │
│ Left Panel:  │                                          │ Right Panel: │
│ [Outline]    │               INFINITE CANVAS            │ [Inspector]  │
│              │                                          │              │
│ - Tree View  │         • Pan: Space+Drag / Middle Click │ - Theme      │
│ - Structure  │         • Zoom: Ctrl+Scroll              │ - Style      │
│ - Search     │                                          │ - Shapes     │
│              │                                          │ - Numbering  │
│ [Collapse ◀] │                              [Minimap]   │ [▶ Collapse] │
└──────────────┴──────────────────────────────────────────┴──────────────┘
```

- **Top Bar**: Minimal, distraction-free header containing navigation, document title, mode badge, history controls, and primary action buttons.
- **Left Panel (Outline & Structure)**:
  - Collapsible via icon button or `Ctrl + \`.
  - Displays synchronous hierarchical tree view of all nodes. Clicking an item centers and focuses the canvas on that node.
  - Dragging items in outline reparents nodes on canvas.
- **Right Panel (Inspector)**:
  - Collapsible via icon button or `Ctrl + /`.
  - When nothing is selected: displays Document & Theme settings (Color palette, default font, edge style, canvas background).
  - When a node or edge is selected: displays local property overrides (Fill color, stroke, font size, shape type, numbering rule).
- **Minimap**: Floating semi-transparent viewport radar in the bottom-right corner. Click or drag to jump across large canvases. Can be toggled on/off.

---

## 5. Library / Home Screen Contract

### 5.1 Hybrid Storage Model
- **Real Filesystem Ownership**:
  - Documents are real files stored on the user's Windows disk.
  - Library collections correspond directly to real Windows directories selected by the user.
- **Local Application Metadata**:
  - An internal local database (stored in `%APPDATA%\Gedankenfaden\library.json` or SQLite) tracks fast metadata: Recent Documents, Favorites, Tags, Last Opened timestamp, and View Mode.
  - Deleting a document from within the application moves the real file to the Windows Recycle Bin (non-destructive).

### 5.2 Library Signature Motion (Focus & Recede)
- Document cards are presented in a clean grid layout.
- **Interaction Dynamic**:
  - When the cursor hovers or focuses on a document card, the card subtly elevates (slight scale emphasis, gentle vertical translation, deeper soft shadow, primary theme accent border).
  - Simultaneously, surrounding sibling cards recede modestly (relaxed opacity and scale).
  - The focus transition reinforces attention without disorienting layout shifts.

---

## 6. Keyboard-First Interaction Contract

### 6.1 Core Key Bindings

> [!NOTE]
> **Keyboard Strategy across Modes**:
> - **Mind Map**: Core keyboard muscle memory (`Enter`, `Tab`, `Space`, `Delete`, Arrow keys) is fully frozen.
> - **Flowchart**: Universal desktop operations (`Ctrl+C/X/V`, `Undo/Redo`, `Delete`, `Search`, panel toggles, pan/zoom, text edit/escape) are fully frozen and shared across modes. Graph-specific shortcuts (such as `Enter`, `Tab`, and edge-directed navigation) are candidate mappings to be finalized after the approved external reference audit in **Milestone 3**.

| Key Combination | Mind Map Mode Action (Frozen) | Flowchart Mode Action | Text Editing Context |
|---|---|---|---|
| `Enter` | Create sibling node below | *Pending M3 audit* (Candidate: insert connected step) | Commit text edit & exit |
| `Shift + Enter` | Create sibling node above | *Pending M3 audit* (Candidate: insert node above) | Insert newline in text |
| `Tab` | Create child node | *Pending M3 audit* (Candidate: branch connection) | Indent / insert tab |
| `Space` or Direct Typing | Enter inline text editing | Enter inline text editing | Insert space |
| `Escape` | Clear selection | Clear selection | Cancel text edit |
| `Delete` / `Backspace` | Delete selected node & branch | Delete selected node & edges | Delete character |
| `Arrow Keys` (`↑ ↓ ← →`) | Navigate to adjacent node | *Pending M3 audit* (Candidate: spatial / edge navigation) | Move cursor in text |
| `Ctrl + C` / `Ctrl + X` | Copy / Cut selected branch | Copy / Cut selected elements | Copy / Cut text |
| `Ctrl + V` | Paste (Structure / Multiline) | Paste elements | Paste raw text |
| `Ctrl + Z` | Undo last action | Undo last action | Undo text input |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo action | Redo action | Redo text input |
| `Ctrl + F` | Open search & highlight | Open search & highlight | Find in text |
| `Ctrl + A` | Select all nodes | Select all nodes | Select all text |
| `Ctrl + \` | Toggle left Outline panel | Toggle left Outline panel | N/A |
| `Ctrl + /` | Toggle right Inspector | Toggle right Inspector | N/A |
| `Space + Drag` | Pan canvas | Pan canvas | N/A |
| `Ctrl + Scroll` | Zoom canvas in/out | Zoom canvas in/out | N/A |

### 6.2 Multiline Paste-to-Structure Behavior
1. **Canvas Context (Node Selected, Not Editing Text)**:
   - When the user pastes multiline clipboard content:
     - The parser analyzes line breaks and leading indentation (tabs or spaces).
     - Each line creates a distinct node.
     - Indented lines automatically become child subtrees of the preceding line.
     - Automatically attaches under the selected node.
2. **Text Editing Context (Cursor inside Node Input Field)**:
   - Pastes standard raw text into the input field without splitting into new graph nodes.

---

## 7. Node Images & Asset Management

### 7.1 Image Node Contract
- Any node can optionally host an embedded image header or thumbnail.
- Supported image formats: PNG, JPEG, SVG, WebP.
- Automatic image downscaling budget applied for high-resolution images to maintain fluid canvas performance.

### 7.2 Portable Single-File Asset Encapsulation
- On import, the original external file is read and copied into the document's internal `assets/` store.
- Internal references use a content-addressed or UUID-based format: `asset://img_<id>.<ext>`.
- The document never relies on fragile external Windows paths.
- Moving, renaming, or transferring the `.mflow` container preserves all image links intact.

---

## 8. Branch / List Numbering Contract

### 8.1 Presentation-Rule Architecture
- Numbering is a **structural presentation rule**, not hardcoded text in `node.text`.
- The node text remains pure (`"Market Analysis"`).
- The presentation layer calculates the display badge based on the node's position and hierarchy.

### 8.2 Supported Tier Schemes
- **Level 1 Child Nodes**:
  - `Decimal`: `1.`, `2.`, `3.`, `4.`
  - `Alphabetical`: `A.`, `B.`, `C.` or `a.`, `b.`, `c.`
  - `Roman Numerals`: `I.`, `II.`, `III.` or `i.`, `ii.`, `iii.`
  - `Bullets`: Filled disc `•`, square `▪`, circle `◦`
- **Level 2 Child Nodes**:
  - Independently configurable (e.g. Level 1 uses `1.`, Level 2 uses `a.`).
- **Dynamic Renumbering**:
  - Inserting a new node, dragging to reorder, deleting a node, or reparenting automatically updates the numbering of all affected siblings in real time.

---

## 9. Customization System

### 9.1 Two-Layer Customization Architecture
1. **Theme Layer (Document Defaults)**:
   - Global color palettes (curated minimal themes).
   - Global canvas background (blank, dots, subtle grid).
   - Default typography (system sans, serif, monospace, font scale).
   - Default edge style (stroke width, color, routing).
2. **Inspector Override Layer (Local Exceptions)**:
   - Selected node or branch overrides: Custom background fill, custom border stroke, text color, font size, shape geometry, and alignment.
   - "Reset to Theme" action clears local overrides.

---

## 10. Signature Motion & Accessibility Contract

### 10.1 Motion Design Language
All interactions follow purposeful physical metaphors:
- **Create $\to$ Grow**: Nodes expand outward with a gentle pop.
- **Connect $\to$ Draw**: Edge paths trace outward from source handle to target handle.
- **Select $\to$ Breathe**: Subtle glow ring gently fades into focus.
- **Focus $\to$ Elevate**: Active cards elevate with subtle translation and deep shadow.
- **Deselect $\to$ Recede**: Inactive elements gently soften and step back.
- **Move / Re-layout $\to$ Glide**: Nodes transition smoothly to new layout coordinates without abrupt jumping.
- **Expand $\to$ Unfold**: Child branches unfurl outward from the parent.
- **Collapse $\to$ Gather**: Child branches gather gracefully into the parent fold indicator.
- **Delete $\to$ Dissolve**: Elements scale down slightly and fade to zero opacity.

### 10.2 Accessibility & Reduced Motion
- Full compliance with `prefers-reduced-motion: reduce`.
- When active, all transitions, growth curves, and translations become instantaneous, ensuring complete comfort for users sensitive to motion.

---

## 11. Reliability & Recovery Contract

### 11.1 Invisible Reliability Engine
- **Autosave**: Debounced background autosave; exact interval is implementation-tuned and verified for responsiveness and data safety.
- **Atomic Writes**: Saves write to a temporary file (`.mflow.tmp`) first, followed by an atomic filesystem rename to prevent document corruption during unexpected system power loss.
- **Crash Recovery Journal**: A lightweight change log (`.recovery.log`) records dirty state in real time.
- **Rolling Local Snapshots**: Maintain bounded rolling local snapshots in `%APPDATA%\Gedankenfaden\snapshots\`; retention policy is implementation-tuned.
- **Lightweight Recovery Prompt**: If the application detects an ungraceful shutdown on startup, it alerts the user with an option to restore from the latest snapshot.

---

## 12. Import / Export Specifications

### 12.1 Export Matrix Contract

| Format | Category | Fidelity Level | Scope & Notes |
|---|---|---|---|
| **Native JSON** | Structured | Complete | Lossless canonical document export. |
| **SVG** | Vector Graphic | High | Infinite-resolution vector XML, embedded styles and fonts. |
| **PNG** | Raster Image | High | High-DPI raster image snapshot with transparent or solid background. |
| **JPEG** | Raster Image | High | Standard compressed image with background fill. |
| **PDF** | Document Vector | High | Printable page layout with vector text and diagram paths. |
| **Markdown** | Text Hierarchy | Structural | Indented outline bullet points, node text, and task checkboxes. |
| **HTML** | Standalone Web | High | Self-contained HTML file embedding interactive SVG preview. |
| **Mermaid** | Code Diagram | Semantic | Synthesized `graph TD` or `mindmap` code block. |
| **OPML** | Outline Interchange | Structural | Standard XML outline for interchange with external outline tools. |
| **Legacy mind-map XML (`.mm`)** | Structured Outline | Structural | Standard legacy mind-map XML tree format. |
| **JSON Canvas (`.canvas`)** | Open Standard | High | JSON Canvas (`.canvas`) open format specification. |

### 12.2 Import Contract
- **Native JSON / `.mflow`**: Full lossless document import.
- **Markdown / OPML**: Structured text outline import to Mind Map tree.
- **Structured Clipboard Text**: Automatic hierarchical branch creation.
- **Image OCR**: Strictly out of scope for V1.

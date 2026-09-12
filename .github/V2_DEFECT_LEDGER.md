# Gedankenfaden v2.0.0 — Working Defect Ledger

> Provisional Reality Audit ledger for the v2.0.0 reconstruction branch. This is not the final release record.

## Current findings (ordered by product contract)

| ID | Layer | Defect | Evidence | Status |
|---|---|---|---|---|
| F01 | Product representation / canvas | **节点视觉孤儿化——多样本确认** | Reproduced across several real documents; nodes can appear detached from logical parent structure. | Confirmed, multi-sample |
| F02 | Product representation / canvas | **逻辑父子关系仍在，但架构连线不可见** | Reproduced in multiple real documents; hierarchy remains in data/positioning while the connecting edge is absent. | Confirmed, multi-sample |
| F03 | Interaction / canvas | **Group container cannot be dragged by the user** | `CanvasEditor.tsx` renders the group overlay with `pointer-events-none` and no drag handler. `translateGroup()` has a unit test but no production caller, despite the V1 group-drag contract. | Confirmed by code path; real UI reproduction pending |
| F04 | Export truthfulness | **PNG export is not a normal PNG** | Exporter prepends PNG magic bytes to SVG XML; no raster encoder. Existing test checks only first four bytes. | Confirmed by manual failure + code audit; test blind spot |
| F05 | Export truthfulness | **JPEG export is not a normal JPEG** | JPEG magic bytes are prepended to SVG XML; no JPEG encoder. Existing test checks only first two bytes. | Confirmed by code audit; manual reproduction pending; test blind spot |
| F06 | Export truthfulness | **PDF export contains summary text, not the diagram** | Fixed one-page PDF contains title/mode/node count only; no geometry, edges, labels, groups, or shapes. Test checks only `%PDF-1.4`. | Confirmed by code audit; test blind spot |
| F07 | Export truthfulness | **SVG and HTML exports lose the rendered document contract** | SVG always emits rounded rectangles and cubic paths, ignoring node shapes, routing/style, handles, and groups; HTML embeds that SVG. Tests check marker strings only. | Confirmed by code audit; consumer interoperability pending; test blind spot |
| F08 | Structured import | **Markdown/OPML parsing has a narrow fidelity contract** | Adversarial probe (nested headings/lists plus OPML entities) preserved tested Markdown hierarchy and outline entity decoding, but OPML `<title>A &amp; B</title>` became literal `A &amp; B` while outline text decoded. Regex parsing also omits broader XML metadata/grammar. | Confirmed entity-loss case; broader grammar remains evidence gap |
| F09 | Library synchronization | **Library folder does not update live after external file additions** | Real use requires manual import/rescan; implementation has no active filesystem watcher despite V1 watcher contract. | Confirmed by manual test + code audit |
| F10 | Persistence / recovery | **Normal native window close is recorded as unclean** | No Tauri close-event or unload bridge; `heartbeatSession()` has no production caller. Direct close can leave `isCleanShutdown: false`, causing a false recovery banner next launch. | Confirmed by call-graph audit; native close/relaunch reproduction pending |
| F11 | Persistence / data integrity | **Save failures are swallowed and Library metadata can remain stale** | Save catch logs only; UI status is not error. Active LibraryEntry metadata is not updated after edit until rescan. | Confirmed by code audit; failure-injection/native reproduction pending |
| F12 | Persistence / filesystem | **Directory scan is shallow despite folder-based Library contract** | `scanDirectoryForDocuments()` reads one directory and skips child directories; mock creates a subfolder without asserting recursive discovery. | Confirmed by code audit; nested real-folder reproduction pending |
| F13 | Native boundary / security | **Tauri filesystem commands accept arbitrary renderer-supplied paths** | Read/write/remove/rename/read-dir commands take unrestricted strings and do not enforce app-owned, Library, or dialog-authorized roots. Under the V2 policy this is a confirmed security/hardening finding, not merely an architectural risk. | Confirmed by code audit; native policy tests pending |
| F14 | Automated verification | **Verification relies on mocks, headers, and happy paths** | 20 files/116 tests pass, but bridge tests use `MemoryMockNativeBridge`; exports check headers/substrings; no real consumer, OS close/relaunch, external watcher, or Windows boundary test. | Confirmed verification-system finding; bounded acceptance basis for repair tickets |

## Audit evidence

- Baseline: `npm test -- --run` → 20 test files passed, 116 tests passed.
- Red-capable export probe detected PNG/JPEG SVG wrappers and summary-only PDF → RED.
- Adversarial parser probe: nested Markdown hierarchy was emitted; OPML outline entities decoded, but `<title>` entities were not (`A &amp; B` remained literal) → reproducible F08 evidence.
- No product repair, UI redesign, or release-status document changes were made.

## Ticketing judgment

F01–F08 and F09–F12 are ready for focused repair tickets. F13 is ready for a deliberately scoped native-boundary/security ticket under the V2 policy, with native policy tests as its acceptance seam. F14 remains the bounded verification-system basis for those tickets—not a mandate for an unbounded test-suite rewrite.

## Queue rule

This ledger is the sole candidate queue for the Reality Audit closure. Each repair must have an individual ticket and focused regression seam, preserving this product-representation → interaction/output → persistence/data-management → security/verification order. Do not begin repair from this document without ticket-level authorization.

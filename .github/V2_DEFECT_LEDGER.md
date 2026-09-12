# Gedankenfaden v2.0.0 — Working Defect Ledger

> Working audit ledger for the v2.0.0 reconstruction branch. This file is intentionally provisional and should be updated after the systematic hardening audit. It is not the final release record.

## Current confirmed / suspected defects

| ID | Layer | Defect | Evidence | Status |
|---|---|---|---|---|
| F01 | Product representation / canvas | **节点视觉孤儿化——多样本确认** | First confirmed in one real sample; subsequently reproduced in multiple additional real documents, including several other sample families. Nodes can appear detached from their logical parent structure. | Confirmed, multi-sample |
| F02 | Product representation / canvas | **逻辑父子关系仍在，但架构连线不可见** | First confirmed in one real sample; reproduced in multiple additional real documents. Some nodes remain positioned as part of the hierarchy while the connecting edge is visually absent, making the structure appear broken. | Confirmed, multi-sample |
| F03 | Export / output truthfulness | **PNG export produces a file that cannot be opened as a normal PNG** | User manual test failed. Static audit shows the current exporter prepends PNG magic bytes to SVG XML rather than producing a real raster PNG stream. | Confirmed by manual test + code audit |
| F04 | Export / output truthfulness | **JPEG export likely has the same false-format implementation pattern** | Static audit shows JPEG magic bytes are prepended to SVG XML instead of a real JPEG encoding. User has not yet manually tested this format. | Confirmed by code audit; manual reproduction pending |
| F05 | Data / library synchronization | **Library folder does not update live when supported files are added externally** | Reproduced during real use: adding a Markdown file to the active target folder does not make it appear automatically; manual import/rescan is required. Current implementation exposes manual disk rescan but no active filesystem watcher despite the V1 architecture contract describing a real folder watcher. | Confirmed by manual test + code audit |

## Audit rule before ticketing

Do not start bug-fix implementation from this provisional ledger alone. First run a systematic Product Hardening / reality audit over the current v1.0.0 implementation, using this ledger as seed evidence rather than as an exhaustive list. The audit should search for additional failures across product representation, interaction, persistence/recovery, import/export truthfulness, native filesystem behavior, and test blind spots. Update and normalize this ledger only after evidence is collected.

## After the audit

Once the ledger is stable enough, convert each accepted defect into an individual repair ticket. Repair tickets should be handled one by one with focused regression coverage and small reviewable changes. UI/visual reconstruction is a later v2 phase and should not be mixed into the initial defect-hardening pass.

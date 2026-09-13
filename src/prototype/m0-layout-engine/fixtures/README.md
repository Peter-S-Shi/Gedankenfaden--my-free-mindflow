# Gedankenfaden Layout Regression Corpus

Purpose: neutral, synthetic import samples for the Mind Map Layout Engine Reconstruction.

These files are intentionally **input-only**. There are no `.mflow` golden outputs and no pixel-perfect expected screenshots, because the current layout engine is known to be under reconstruction and should not define the future geometry contract.

## Samples

1. `01_extreme_star_60.md` — one parent with 60 direct children.
2. `02_deep_chain_24.md` — a 24-level chain.
3. `03_severe_imbalance.md` — one very large subtree plus several small siblings.
4. `04_wide_shallow.md` — 12 main branches, each with four children.
5. `05_mixed_depth_irregular.md` — uneven branch depths and widths.
6. `06_long_chinese_text.md` — long CJK labels mixed with short labels.
7. `07_mixed_cjk_english.md` — Chinese/English mixed wrapping.
8. `08_bilateral_footprint_balance.md` — main branches with intentionally different subtree footprints.
9. `09_collapse_expand_stability.md` — intended for manual collapse/expand after import.
10. `10_parent_local_packing.md` — siblings at the same depth with uneven descendant subtrees.
11. `11_opml_import_parity.opml` — OPML importer parity sample.

## Observe after import

- node overlap
- edge crossing / edge-through-node
- maximum parent-child edge length
- same-depth horizontal band consistency
- parent visual centering relative to direct children/subtree
- left/right footprint imbalance
- overall aspect ratio
- text overflow / wrapping
- collapse/expand stability
- whether one sibling subtree consumes hierarchy depth that belongs to later siblings

Use these alongside your existing real [REDACTED] / [REDACTED] samples, not instead of them.

# Current Stage Plan

**Created:** 2026-04-16  
**Phase:** Post-roadmap (real-template physical import deepening)  
**Status:** In Progress

> This plan records the currently active execution slice after the completed Phase 10 guardrail work. The roadmap phases through Phase 10 remain complete and are summarized in `docs/progress-snapshot.md`.

---

## Scope

**In Scope:**
- deepen SCN-08 deterministic validation for high-reliability physical planning
- add `device-rack-layout` as a first-class artifact and runtime tool
- stabilize workbook markdown preprocessing for `.xlsx` multi-sheet template inputs
- add deterministic real-template import into `structuredInput`
- make project-bound port-plan workbooks drive actual endpoint port placement
- make project-bound inventory + parameter-response workbooks drive `powerWatts`
- default rack metadata to `48U` / `7kW` when explicit values are absent while keeping those defaults inferred

**Out of Scope:**
- memory / experience layer work
- `.vsdx` adapter work
- auto-confirming inferred physical facts into export-ready state
- complete deterministic ingestion of every workbook family beyond the currently targeted slices

---

## Completed in This Slice

### A. SCN-08 Foundation and High-Reliability Rule Depth

- [x] added `device-rack-layout` artifact + runtime tool
- [x] extended canonical model with typed link/port metadata, HA grouping, and rack power fields
- [x] landed deterministic checks for HA role completeness, HA adjacency, typed plane mismatch, peer/uplink endpoint validity, MLAG symmetry, and rack power thresholds

### B. Workbook Markdown Preprocessing and Real Template Import

- [x] preserved `.xlsx` workbook sheet boundaries through the existing MarkItDown preprocessing path
- [x] added `extract_structured_input_from_templates`
- [x] imported deterministic rack/device/link draft facts from real workbook-shaped markdown

### C. Project-Bound Port and Power Inputs

- [x] made project-bound port-plan workbooks drive actual endpoint port placement for matched devices
- [x] made user-provided inventory + parameter-response workbooks drive device `powerWatts`
- [x] supported project-specific device-name variation and `A设备/B设备 -> A01/B01` parity mapping
- [x] reduced remaining real-bundle profile ambiguity for firewall, SDN gateway, and TOR families with model-first matching plus stronger role/scope/instance scoring
- [x] made core-area out-of-band TOR uplinks consume workbook uplink ports `49-50`, eliminating the last residual TOR warning in the checked-in real bundle

### D. Rack Defaults with Confirmation-Friendly Semantics

- [x] defaulted missing rack height to `48U`
- [x] defaulted missing rack power to `7kW`
- [x] preserved imported/defaulted rack and device facts as inferred draft data so downstream confirmation/validation still gates final artifacts

### E. Structured Pending Confirmation and Direct Artifact Guarding

- [x] promoted workbook-derived plane-type conflicts into schema-backed `pendingConfirmationItems`
- [x] preserved those pending-confirmation items across draft preparation, orchestrated review, agent handoff, and bundle review output
- [x] blocked direct physical artifact generation when relevant pending-confirmation ambiguity remains, so review gating cannot be bypassed by ready-looking final tables

---

## Next Focus

1. Reduce the remaining non-TOR real-template blockers so the next quality run is dominated by true confirmation gaps rather than importer matching gaps.
2. Turn the current structured pending-confirmation items into more operator-friendly explicit confirmation packets instead of leaving them as warning-adjacent metadata.
3. Re-run broader real-template quality checks until the remaining validation issues are mostly confirmation or threshold decisions, not parser ambiguity or review-path drift.

---

## Verification

- [x] run targeted Bun tests for touched template-import, runtime, validator, and scenario files
- [x] run full repo test suite
- [x] run language-server diagnostics on touched files
- [x] run typecheck and build
- [x] manually execute representative runtime template-import flows after implementation

### Verification Evidence

- `bun test` → passing (`360 pass / 0 fail`)
- `bun run typecheck` → passing
- `bun run build` → passing
- manual QA 1: workbook-derived endpoint ports now appear in `structuredInput` (for example `3/0`, `1/1`, `2/49`) instead of synthetic placeholders
- manual QA 2: workbook-derived power now appears in `structuredInput.devices[]` (for example `业务POD-B1H服务器-CS5280H3-1 -> 892W`, `业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 -> 55W`)
- manual QA 3: missing rack metadata defaults to `48U / 7kW` with confirmation warnings, while explicit `45U` rack headers override the default height
- manual QA 4: real-template roundtrip through `draft_topology_model` no longer hits `duplicate_device_id`
- manual QA 5: the checked-in real bundle no longer reports firewall / SDN gateway / TOR alias warnings, and `核心区-千兆带外管理TOR-H3C S5560X-54C-EI-1` now binds uplinks to workbook ports `1/49` and `1/50`
- targeted verification update: `bun test "src/features/extract-structured-input-from-templates.test.ts"` → passing (`35 pass / 0 fail`), `bun run typecheck` → passing, `bun run build` → passing, real-bundle replay → `TOR warning count = 0`
- targeted verification update: real-template replay now reports `plane_link_port_type_mismatch = 0`, `extract_pending_confirmation_items = 4`, `draft_pending_confirmation_items = 4`, and `handoff_unresolved_rows = 4`
- targeted verification update: direct physical artifact generation now rejects relevant pending-confirmation ambiguity instead of emitting ready-looking final artifacts outside the review path

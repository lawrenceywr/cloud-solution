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
- surface unresolved template-derived pending confirmations as operator-facing confirmation packets without treating them as resolved facts

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
- [x] made management-domain M9000-CN04 firewall peer links consume workbook-derived `内部RBM互联` ports instead of falling back to synthesized peer-link names

### D. Rack Defaults with Confirmation-Friendly Semantics

- [x] defaulted missing rack height to `48U`
- [x] defaulted missing rack power to `7kW`
- [x] preserved imported/defaulted rack and device facts as inferred draft data so downstream confirmation/validation still gates final artifacts

### E. Structured Pending Confirmation and Direct Artifact Guarding

- [x] promoted workbook-derived plane-type conflicts into schema-backed `pendingConfirmationItems`
- [x] preserved those pending-confirmation items across draft preparation, orchestrated review, agent handoff, and bundle review output
- [x] blocked direct physical artifact generation when relevant pending-confirmation ambiguity remains, so review gating cannot be bypassed by ready-looking final tables

### F. Operator-Friendly Confirmation Packets

- [x] added a deterministic confirmation-packet projection for unresolved pending-confirmation items
- [x] exposed confirmation packets through design-gap summaries, summarize-design-gaps output, solution-review workflow output, agent briefs, and agent handoff output
- [x] preserved raw `pendingConfirmationItems` and existing artifact/export guard behavior unchanged; packets are presentation/review aids only, not a confirmation mechanism

---

## Next Focus

1. Reduce the remaining non-TOR real-template blockers so the next quality run is dominated by true confirmation gaps rather than importer matching gaps.
2. Re-run broader real-template quality checks until the remaining validation issues are mostly confirmation or threshold decisions, not parser ambiguity or review-path drift.
3. Use the new confirmation packets to drive explicit operator decisions for the remaining true confirmation gaps before broadening importer matching again.

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
- targeted verification update: operator-facing confirmation packets now derive only from unresolved `pendingConfirmationItems` and propagate through design-gap summaries, summarize-design-gaps output, review workflow output, solution-review agent briefs, and handoff output while preserving raw pending-confirmation guard semantics
- targeted verification update: confirmation packet details now render in the human-facing design assumptions/gaps report when packets exist, deterministic assistant fallback includes packet decisions/actions, and older assistant-worker briefs that omit packets remain compatible through an empty default
- targeted verification update: solution-review agent briefs keep packet decision/action/entity/endpoint details but redact packet `sourceRefs` before child-session handoff, while review summaries and handoff top-level packets retain full provenance for local/programmatic consumers
- targeted verification update: design assumptions/gaps markdown now escapes project names and confirmation packet fields for HTML-sensitive characters, pipes, and newlines before rendering
- verification update: `bun test src/renderers/assumption-report-renderer.test.ts src/agents/solution-review-brief.test.ts src/features/solution-review-agent-handoff.test.ts src/artifacts/design-gap-report/build-design-gap-report.test.ts src/agents/solution-review-assistant.test.ts src/artifacts/artifact-bundle/build-artifact-bundle.test.ts src/features/solution-review-workflow.test.ts src/features/summarize-design-gaps.test.ts src/domain/schema/cloud-domain-schema.test.ts` → passing (`60 pass / 0 fail`); `bun run typecheck && bun test && bun run build` → passing (`368 pass / 0 fail`)
- targeted verification update: M9000-CN04 management-domain firewall peer links now bind workbook ports `0/1/15 ↔ 0/1/15`; real-template probe reports `portFallbackWarningCount = 0`, `TOR warning count = 0`, `plane_link_port_type_mismatch = 0`, `extract_pending_confirmation_items = 4`, `draft_pending_confirmation_items = 4`, `handoff_unresolved_rows = 4`, and `confirmationPackets = 4`
- verification update: `bun test src/features/extract-structured-input-from-templates.test.ts` → passing (`38 pass / 0 fail`), targeted real-template regression suite → passing (`112 pass / 0 fail`), `bun run typecheck` → passing, `bun test` → passing (`370 pass / 0 fail`), `bun run build` → passing

---

## Next Phase Plan — BL-029 Real-Template Physical Deepening

### Stage 1 — Template Contract & Fixture Baseline
- **Goal:** lock the exact real-template fields needed for physical import.
- **Deliverable:** minimal fixture set + mapping notes for racks, devices, ports, links, cable metadata, rack adjacency, empty-rack reserve, and port-plane hints.
- **Acceptance:** every required physical artifact field maps to either a template column or an explicit unresolved item; fixtures include server/leaf port-plane cases and adjacent-empty-rack reserve cases.

### Stage 2 — Deterministic Template-to-StructuredInput Import
- **Goal:** deepen workbook/template extraction without letting inferred facts become confirmed truth.
- **Deliverable:** importer updates that convert real-template rows into `structuredInput` entities with source refs and confidence states.
- **Acceptance:** racks, devices, ports, links, and physical metadata import deterministically from fixtures; missing or ambiguous values remain unresolved/pending confirmation instead of being invented.

### Stage 3 — Physical Validation & Conflict Surfacing
- **Goal:** enforce template-derived physical rules before artifact generation.
- **Deliverable:** validator coverage for template-derived rack placement, cable endpoints, port-plane convention, rack adjacency, and power reserve behavior.
- **Acceptance:** invalid or incomplete imports fail validation or produce explicit warnings; server/leaf port-plane conflicts and adjacent-empty-rack reserve behavior match the shipped SCN behavior.

### Stage 4 — Artifact Output Parity from Real Templates
- **Goal:** make real-template imports drive the same deterministic physical artifacts as hand-authored structured input.
- **Deliverable:** end-to-end BL-029 fixture flow producing cabling, rack layout, port plan, port connection, and review/gap output.
- **Acceptance:** generated artifacts contain only validated/imported facts; pending confirmations remain visible in review output and never silently become final rows.

### Final Acceptance Gate
- BL-029 real-template fixture imports into canonical `structuredInput` successfully.
- All ambiguity is explicit through confidence, source refs, and pending confirmations.
- Physical validation blocks or warns on incomplete/conflicting template facts.
- SCN-01 through SCN-08 behavior remains unchanged.
- Typecheck, targeted tests, scenario regressions, and build all pass.

## BL-029 Execution Status

- [x] Stage 1 — Template contract & fixture baseline: verified against the existing real-template fixture set and importer contract tests.
- [x] Stage 2 — Deterministic template-to-structuredInput import: verified through the template extraction tests and manual real-template replay behavior.
- [x] Stage 3 — Physical validation & conflict surfacing: verified through validator and scenario regression tests.
- [x] Stage 4 — Artifact output parity from real templates: verified through artifact builder tests and scenario acceptance output.
- [x] Final acceptance gate: targeted tests, typecheck, and build all pass.

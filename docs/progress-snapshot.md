# Progress Snapshot

**Last Updated:** 2026-04-26
**Status:** MVP Complete → Post-roadmap real-template physical import deepening in progress

---

## Current Stage

✅ **Post-roadmap template-import deepening in progress** - SCN-08 foundation, workbook-driven port placement, device power import, rack defaults, model-first real-template matching for the remaining firewall / gateway / TOR families, machine-readable pending-confirmation surfacing, and operator-facing confirmation packets for workbook plane-type ambiguity are now landed on `dev`; the next focus is reducing the remaining non-confirmed physical blockers now that importer-caused plane ambiguity is both explicit and review-gated.

✅ **Current Status:** all roadmap phases through Phase 10 remain complete, and the active post-roadmap work is now deterministic real-template import quality deepening rather than guardrail hardening.

---

## Completed Capabilities

### SCN-08 Rule Depth + XLSX Workbook Preprocessing (NEW ✅)
- ✅ high-reliability validation now goes beyond the initial foundation and blocks missing HA roles, incomplete HA pairs, invalid peer-link/uplink endpoint types, typed plane mismatches, and missing rack/device power metadata when the rack-layout slice requires power evaluation
- ✅ dual-homed high-reliability peers now must resolve to one complete HA pair before the MLAG symmetry rule is considered satisfied
- ✅ workbook-style `.xlsx` inputs are now explicitly locked into the existing MarkItDown preprocessing path, with multi-sheet markdown boundaries preserved as advisory extraction input
- ✅ regression tests now cover multi-sheet workbook markdown flowing from `document-source-markdown` into the extraction child session without creating a new truth path

### Real Template Import to StructuredInput (NEW ✅)
- ✅ added `extract_structured_input_from_templates` to turn checked-in workbook templates into deterministic draft `structuredInput`
- ✅ the first adapter slice deterministically consumes the cabling workbook and rack-layout workbook through the existing MarkItDown preprocessing path
- ✅ project-bound port-plan workbooks now drive actual endpoint port placement for matched devices instead of warning-only recognition
- ✅ project-bound inventory and parameter-response workbooks now drive device `powerWatts` for deterministically matched devices
- ✅ rack metadata now defaults to `48U` and `7kW` on the import path when the project did not provide explicit rack values, while still surfacing confirmation warnings
- ✅ inventory workbooks are still recognized explicitly and surfaced as warnings instead of being guessed into structured facts
- ✅ automated regression coverage now locks the workbook-markdown parser against real checked-in sheet shapes (including duplicated rack-power headers like `7kw.1`), while real workbook conversion remains manually verified through MarkItDown
- ✅ workbook profile matching now prefers normalized model identifiers, role hints, scope hints, and explicit `-1 / -2` instance binding for the remaining real-template firewall / gateway / TOR families
- ✅ the checked-in real bundle now resolves the previously noisy TOR aliases without residual TOR warnings, and core-area out-of-band TOR uplinks now bind to workbook ports `49-50` instead of synthesized placeholders
- ✅ management-domain M9000-CN04 firewall peer links now bind workbook-derived `内部RBM互联` ports (`0/1/15 ↔ 0/1/15`) instead of synthesized peer-link placeholders
- ✅ workbook-derived business / storage plane conflicts now surface as schema-backed `pendingConfirmationItems` instead of only warning strings
- ✅ those pending-confirmation items now propagate through draft preparation, orchestrated review, agent handoff, and bundle review summaries
- ✅ unresolved pending-confirmation items now also project into operator-facing confirmation packets across design-gap summaries, human-facing assumptions/gaps reports, summarize-design-gaps output, review workflow output, solution-review agent briefs, deterministic assistant fallback, and handoff output without changing guard/export semantics

### Guardrail Hooks & SCN-07 (NEW ✅)
- ✅ 4 new pre-execution hooks now exist: `missing-required-input-guard`, `artifact-generation-precheck`, `low-confidence-export-guard`, and `assumption-review-reminder`
- ✅ runtime tool execution now reuses shared `blocked` / `review_required` / `export_ready` semantics before artifact/export tool execution proceeds
- ✅ `SCN-07` now proves low-confidence export attempts are rejected, incomplete export attempts are rejected, and clean confirmed export still succeeds
- ✅ direct physical artifact tools now refuse generation when relevant `pendingConfirmationItems` remain, closing the bypass around review/bundle gating

### MCP Advisory Source Ingestion (NEW ✅)
- ✅ `extract_document_candidate_facts` can now pull advisory external evidence from approved `inventory` / `system` requirement source refs through a configured MCP tool
- ✅ external retrieval is optional and disabled unless `document_assist_advisory_source_tool_name` is configured
- ✅ extraction child sessions may cite only supplied document sources or approved advisory external source refs
- ✅ draft preparation now keeps advisory `inventory` / `system` provenance visible to the candidate-fact confirmation flow

### MarkItDown Extraction Preprocessing (NEW ✅)
- ✅ `extract_document_candidate_facts` now performs an internal markdown-preparation step before document-assisted extraction
- ✅ converted markdown stays advisory and never replaces original `documentSources` as provenance anchors
- ✅ the markdown-preparation child session now explicitly requests `markitdown_convert_to_markdown`
- ✅ forged `sourceRef` markdown payloads and blank markdown outputs are rejected back into warnings/fallback behavior

### Agent Boundary & Planner Advisory Layer (NEW ✅)
- ✅ `extract_document_candidate_facts`, `draft_topology_model`, and `summarize_design_gaps` now route through `src/features/`
- ✅ document-assisted extraction now follows the same `agent + worker` split used by the review assistant
- ✅ 4 planner agent/worker slices now exist for cabling, device port planning, port connection, and IP allocation
- ✅ planner output now returns draft structured input only and routes back to `draft_topology_model`
- ✅ public artifact generators remain deterministic and validated-model driven

### Evidence Reconciliation (NEW ✅)
- ✅ Cross-source conflict detection (5 domain-specific rules)
- ✅ Multi-document fact reconciliation
- ✅ Conflict reporting without auto-resolution
- ✅ Integration with coordinator workflow
- ✅ 30 unit tests with full coverage
- ✅ SCN-06 fixture (multi-document conflict scenario)

### Domain & Validation
- ✅ Core entity schemas (devices, ports, links, racks, segments, allocations)
- ✅ Deterministic validators (topology, IP allocation, redundancy, rack placement)
- ✅ Normalization layer for structured inputs
- ✅ Confirmation gating (blocks unconfirmed facts from final artifacts)

### Artifact Generation (5 types)
- ✅ `generate_ip_allocation_table`
- ✅ `generate_port_connection_table`
- ✅ `generate_device_cabling_table`
- ✅ `generate_device_rack_layout`
- ✅ `generate_device_port_plan`

### Review & Export
- ✅ `summarize_design_gaps` - assumptions/gaps/unresolved report
- ✅ `export_artifact_bundle` - packages artifacts + review + bundle index
- ✅ `start_solution_review_workflow` - multi-worker orchestration

### Front-Door Intake
- ✅ `capture_solution_requirements` - requirement capture
- ✅ `draft_topology_model` - topology drafting with confirmation flow
- ✅ `extract_document_candidate_facts` - document-assisted extraction

### Scenario Coverage
- ✅ SCN-01: Physical rack planning (device cabling + port plan)
- ✅ SCN-02: Dual-homing redundancy
- ✅ SCN-03: Multi-rack semantics
- ✅ SCN-04: Cloud IP allocation
- ✅ SCN-05: Document-provenanced candidate facts + confirmation
- ✅ SCN-06: Multi-document conflict detection and workflow blocking
- ✅ SCN-07: Guarded export readiness for low-confidence and incomplete inputs
- ✅ SCN-08: High-reliability rack layout + typed cabling foundation

### Orchestration Layer
- ✅ `src/coordinator/` - child-session protocol, dependency-ordered dispatch
- ✅ `src/workers/` - requirements-clarification, extraction, review-assistant, evidence-reconciliation, and 4 advisory planners
- ✅ `src/agents/` - solution-review-assistant, document-assisted-extraction, and 4 advisory planners
- ✅ `src/features/` - feature-layer entry points for extraction, drafting, review summary, and planner-advisory flows

---

## Future Options (Unscheduled)

1. **Broaden external adapters beyond the landed advisory MCP slice** only if a later roadmap phase needs more than `extract_document_candidate_facts`
2. **Decide whether MarkItDown should remain extraction-only or become a reusable internal adapter for other evidence flows**

---

## Key Directories

| Path | Purpose |
|------|---------|
| `src/domain/` | Canonical entity schemas |
| `src/validators/` | Deterministic rule checks |
| `src/normalizers/` | Structured input → canonical model |
| `src/artifacts/` | 5 artifact row builders |
| `src/renderers/` | Markdown + JSON output |
| `src/tools/` | User-facing tool handlers |
| `src/coordinator/` | Multi-worker orchestration |
| `src/workers/` | Child worker implementations |
| `src/agents/` | Agent briefs and responses |
| `src/features/` | Workflow coordination |

---

## Quick Reference

- **Full roadmap:** `docs/roadmap.md`
- **Active backlog:** `docs/backlog-active.md`
- **Completed backlog (archive):** `docs/backlog-archive.md`
- **Current stage plan:** `docs/plans/current.md`
- **Architecture:** `docs/architecture.md`
- **Domain model:** `docs/domain-model.md`
- **Scenarios:** `docs/scenarios.md`

---

## Token-Saving Tip

For new sessions, read **this file only** (~1k tokens) instead of full roadmap/backlog (~80k tokens).

Reference full docs only when implementing specific features.

---

## Phase 10 Summary

**Started:** 2026-04-14  
**Completed:** 2026-04-14  
**Focus:** guardrail hardening plus SCN-07 acceptance coverage for export readiness  
**Verification:** `bun test` (272/272), `bun run typecheck`, `bun run build`, plus manual QA of low-confidence export rejection, incomplete export rejection, empty `documentAssist` rejection, clean export success, and SCN-07 review gating

**Key Deliverables:**
- 4 new runtime hook guards wired into the ordered pre-execution chain
- shared workflow-state evaluation reused by runtime hooks instead of a second readiness model
- canonical `SCN-07` fixture and acceptance coverage for guarded export readiness
- runtime tests that now prove invalid artifact/export requests fail early instead of returning near-final blocked payloads

---

## Phase 9 Summary

**Started:** 2026-04-13  
**Completed:** 2026-04-14  
**Focus:** internal MarkItDown preprocessing plus config-gated advisory MCP source ingestion for `extract_document_candidate_facts`  
**Verification:** `bun test` (258/258), `bun run typecheck`, `bun run build`, plus manual QA of the runtime extraction → draft path with advisory MCP retrieval enabled

**Key Deliverables:**
- internal `document-source-markdown` child-session contract
- internal `document-source-advisory-mcp` child-session contract
- feature-owned markdown preprocessing before extraction worker handoff
- feature-owned advisory external-source filtering before extraction worker handoff
- explicit MarkItDown tool allowlist for the markdown-prep child session
- explicit advisory MCP tool allowlist for approved requirement source refs
- draft preparation that keeps advisory `inventory` / `system` provenance visible to confirmation instead of laundering it into document-only flows

---

## Phase 8 Summary

**Completed:** 2026-04-12  
**Duration:** 1 implementation session  
**Files Created/Modified:
- `src/features/extract-document-candidate-facts.ts`
- `src/features/draft-topology-model.ts`
- `src/features/summarize-design-gaps.ts`
- `src/agents/document-assisted-extraction*.ts`
- `src/agents/*planner*.ts`
- `src/workers/document-assisted-extraction/worker.ts`
- `src/workers/*planner*/worker.ts`

**Key Deliverables:**
- feature-layer boundary cleanup for extraction/draft/review-summary tools
- export public path now also routes through feature-layer conflict handling when a runtime worker client is available
- formal document-assisted extraction agent split
- 4 advisory planner agent + worker slices
- planner output constrained to draft structured input routed back through validation

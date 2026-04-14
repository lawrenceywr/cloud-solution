# Progress Snapshot

**Last Updated:** 2026-04-14  
**Status:** MVP Complete → Phase 9 Complete

---

## Current Stage

✅ **Phase 9 Complete** - internal MarkItDown preprocessing plus optional config-gated MCP advisory source ingestion now land behind `extract_document_candidate_facts`.

✅ **Current Status:** all roadmap phases through Phase 9 are complete on this branch.

---

## Completed Capabilities

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

### Artifact Generation (4 types)
- ✅ `generate_ip_allocation_table`
- ✅ `generate_port_connection_table`
- ✅ `generate_device_cabling_table`
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
| `src/artifacts/` | 4 artifact row builders |
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

# Progress Snapshot

**Last Updated:** 2026-04-13  
**Status:** MVP Complete → Phase 9 In Progress

---

## Current Stage

✅ **Phase 8 Complete** - Agent boundary cleanup, formal extraction agent split, and four advisory planner slices implemented.

🟡 **Active Work:** Phase 9 (MCP / External Integrations) - started with internal MarkItDown preprocessing on the document-assisted extraction path.

---

## Completed Capabilities

### MarkItDown Extraction Preprocessing (NEW 🟡)
- ✅ `extract_document_candidate_facts` now performs an internal markdown-preparation step before document-assisted extraction
- ✅ converted markdown stays advisory and never replaces original `documentSources` as provenance anchors
- ✅ the markdown-preparation child session now explicitly requests `markitdown_convert_to_markdown`
- ✅ forged `sourceRef` markdown payloads and blank markdown outputs are rejected back into warnings/fallback behavior
- ⏳ broader Phase 9 MCP / external-system integration is still pending

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

## Next Up (Not Started)

1. **Broaden Phase 9 MCP integrations** - beyond the current internal MarkItDown preprocessing slice
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

## Phase 9 Current Slice Summary

**Started:** 2026-04-13  
**Focus:** internal MarkItDown preprocessing for `extract_document_candidate_facts`  
**Verification:** `bun test` (249/249), `bun run typecheck`, `bun run build`, plus manual QA of the two-step markdown-prep → extraction path

**Key Deliverables:**
- internal `document-source-markdown` child-session contract
- feature-owned markdown preprocessing before extraction worker handoff
- explicit MarkItDown tool allowlist for the markdown-prep child session
- advisory markdown filtering that keeps original `documentSources` as the provenance anchor

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

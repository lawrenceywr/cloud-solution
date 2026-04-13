# Current Stage Plan

**Created:** 2026-04-12  
**Phase:** 8 (Agent Boundary & Planner Advisory Layer)  
**Status:** Completed

> This plan replaces the previous historical placeholder in `current.md`. The detailed Phase 7 record remains in `docs/plans/stage-07-evidence-reconciliation.md`.

---

## Scope

**In Scope:**
- move tool-to-worker direct calls behind feature-layer entry points
- formalize document-assisted extraction into the same `agent + worker` split used by `solution-review-assistant`
- add four advisory planner agents for the existing artifact domains
- keep planner output draft-oriented and route it back through `draft_topology_model`

**Out of Scope:**
- MCP / external system integrations
- agent-generated final artifact tables
- bypassing confirmation, normalization, or validation for planner output

---

## Implementation Order

### Phase 1 - Feature-Layer Boundary Cleanup

Goal:
- tools stop importing child workers directly for extraction or reconciliation work

Acceptance:
- [x] `extract_document_candidate_facts`, `draft_topology_model`, and `summarize_design_gaps` route through `src/features/`
- [x] tool payloads remain backward compatible
- [x] deterministic validation/conflict logic still runs before optional child-session work

### Phase 2 - Formal Document-Assisted Extraction Agent

Goal:
- move extraction prompt/schema execution into `src/agents/` while keeping worker-level validation strict

Acceptance:
- [x] extraction prompt, brief, and child-session execution live under `src/agents/`
- [x] worker remains the coordinator adapter and performs post-agent validation
- [x] extraction still cannot emit confirmed facts or off-brief provenance

### Phase 3 - Planner Advisory Slices

Goal:
- add four internal planner agent/worker slices aligned to the four artifact domains

Acceptance:
- [x] planners exist for device cabling, device port plan, port connection, and IP allocation
- [x] planner output is structured draft input only
- [x] planners do not generate final artifact tables directly
- [x] planner output can round-trip through `draft_topology_model`

---

## Planned File Areas

### Documentation
- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/progress-snapshot.md`
- `README.md`

### Phase 1
- `src/features/extract-document-candidate-facts.ts`
- `src/features/draft-topology-model.ts`
- `src/features/summarize-design-gaps.ts`
- `src/tools/extract-document-candidate-facts/tools.ts`
- `src/tools/draft-topology-model/tools.ts`
- `src/tools/summarize-design-gaps/tools.ts`

### Phase 2
- `src/agents/document-assisted-extraction-brief.ts`
- `src/agents/document-assisted-extraction.ts`
- `src/workers/document-assisted-extraction/worker.ts`

### Phase 3
- `src/agents/planning-draft-brief.ts`
- `src/agents/ip-allocation-planner.ts`
- `src/agents/port-connection-planner.ts`
- `src/agents/device-cabling-planner.ts`
- `src/agents/device-port-plan-planner.ts`
- `src/workers/ip-allocation-planner/worker.ts`
- `src/workers/port-connection-planner/worker.ts`
- `src/workers/device-cabling-planner/worker.ts`
- `src/workers/device-port-plan-planner/worker.ts`
- `src/features/ip-allocation-planner.ts`
- `src/features/port-connection-planner.ts`
- `src/features/device-cabling-planner.ts`
- `src/features/device-port-plan-planner.ts`

---

## Verification

- [x] run targeted Bun tests for touched agents, workers, features, and tools
- [x] run `src/create-tools.test.ts`
- [x] run `src/index.test.ts`
- [x] run `src/scenarios/scenario-acceptance.test.ts`
- [x] run language-server diagnostics on touched files
- [x] manually execute representative tool flows after implementation

### Verification Evidence

- `bun test src/features/solution-review-agent-handoff.test.ts src/scenarios/scenario-acceptance.test.ts` → passing after wiring worker-only conflicts back into review state
- `bun test` → passing (`244 pass / 0 fail` at final full verification before Oracle re-review)
- `bun run typecheck` → passing
- `bun run build` → passing
- manual QA 1: `extract_document_candidate_facts` returned `nextAction: draft_topology_model` and preserved extraction warnings
- manual QA 2: `draft_topology_model` returned `inputState: candidate_fact_draft` for document-assisted draft input
- manual QA 3: `summarize_design_gaps` returned `workflowState: export_ready` for a clean deterministic slice
- manual QA 4: planner output remained `inferred` with `system` provenance before re-entering draft flow
- manual QA 5: a worker-only blocking conflict changed `start_solution_review_workflow` to `blocked`
- regression 1: `export_artifact_bundle` now routes through `src/features/export-artifact-bundle.ts`
- regression 2: `src/create-tools.test.ts` and `src/index.test.ts` prove a worker-only blocking conflict now blocks the public export path

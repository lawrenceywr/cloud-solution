# cloud-solution Backlog

This backlog converts the roadmap into an ordered implementation list.

## Backlog Principles

- Validate before generating artifacts.
- Model facts explicitly before introducing convenience tools.
- Keep each slice deterministic and independently testable.
- Do not add multimodal extraction, rack/port/link modeling, or background orchestration until the current trust-center slice is stable.

## Current Stage

The current branch satisfies the roadmap MVP done criteria.

Completed in this stage:

1. stabilize the validation issue contract
2. promote IP allocation to a first-class model entity
3. upgrade the IP artifact to use explicit allocation rows
4. add standalone validation tooling
5. land deterministic port-connection artifact generation
6. land rack-aware `device-cabling-table` and `device-port-plan` generation for `SCN-01`
7. land executable acceptance coverage for `SCN-01`, `SCN-02`, and `SCN-03`
8. add a first normalization layer for structured physical/network inputs
9. enforce confirmed-only artifact generation across physical and IP outputs
10. add a deterministic `summarize_design_gaps` review tool and assumption report renderer
11. add a deterministic `export_artifact_bundle` workflow that packages requested artifacts, review output, and a bundle index
12. lock `SCN-01` to `SCN-03` export-bundle outputs into checked-in scenario regression baselines
13. deepen `SCN-02` redundancy validation and `SCN-03` multi-rack validation before any agent work starts
14. add a thin `solution-review-workflow` coordinator in `src/features/` before starting any agent work
15. add a first `start_solution_review_workflow` orchestration launcher on top of the deterministic coordinator
16. add the first deterministic `src/agents/` handoff brief for solution review follow-up
17. add the first actual `solution_review_assistant` agent response on top of the handoff brief
18. add a first `requirements-clarification` child worker plus reusable coordinator/subsession plumbing for the review workflow
19. align the first review-workflow public contract so launcher output, docs, and tests agree on `agentBrief` / `agentResponse`
20. land `SCN-04` as the cloud allocation acceptance anchor with validator and artifact coverage
21. add front-door requirement capture and draft-topology intake tools without weakening confirmed-only artifact gating
22. expand the review path into explicit dependency-ordered multi-worker orchestration

Framework status right now:

1. the plugin boot flow, runtime kernel, tool registry, and basic readiness guard are implemented
2. deterministic model/artifact/review tools plus a first workflow launcher are implemented and verified end to end
3. `src/features/` now contains deterministic review/export coordination and one orchestration launcher, `src/workers/` now contains explicit clarification and review-assistant workers, and `src/agents/` now contains a first actual review assistant
4. `src/coordinator/` now provides child-session execution, dependency-ordered worker dispatch, and explicit worker-to-worker message passing for the live review workflow

Active next focus:

1. define the next post-MVP slice around `SCN-05` candidate-fact extraction
2. defer MCP / external integrations until the candidate-fact path is stable

## Progress Table

| Backlog ID | Status | Notes |
| --- | --- | --- |
| BL-001 | completed | Shared validation issue contract is stable and deterministic. |
| BL-002 | completed | Explicit IP allocation entities and row contracts are modeled. |
| BL-003 | completed | IP validation covers missing segments, invalid IPs, out-of-range IPs, and duplicates. |
| BL-004 | completed | IP allocation artifacts build from explicit allocation rows. |
| BL-005 | completed | `validate_solution_model` is registered and invokable end to end. |
| BL-006 | completed | The second deterministic slice started and landed as `port-connection-table`. |
| BL-007 | completed | First `SCN-01` physical planning slice landed with racks, cabling, and port plan artifacts. |
| BL-008 | completed | `SCN-01` to `SCN-03` now have executable acceptance coverage. |
| BL-009 | completed | Structured inputs normalize into canonical racks/devices/ports/links/segments/allocations. |
| BL-010 | completed | Confirmation gating now blocks weak physical and IP facts from driving final artifacts. |
| BL-011 | completed | `summarize_design_gaps` now returns deterministic assumptions, gaps, and unresolved review output. |
| BL-012 | completed | `export_artifact_bundle` now packages requested artifacts, review output, and a bundle index in one deterministic export response. |
| BL-013 | completed | `SCN-01` to `SCN-03` export bundles are now locked with checked-in regression baselines. |
| BL-014 | completed | SCN-02 dual-homing and SCN-03 multi-rack validation depth now cover the next deterministic edge cases. |
| BL-015 | completed | `solution-review-workflow` now coordinates normalized validation, review summary, and export state before any agent layer exists. |
| BL-016 | completed | `start_solution_review_workflow` now launches a tracked queued→running→terminal orchestration flow before any agent layer exists. |
| BL-017 | completed | `solution_review_assistant` handoff briefs now package workflow results into a deterministic agent-facing contract. |
| BL-018 | completed | `solution_review_assistant` now produces deterministic response/checklist output from workflow handoff state. |
| BL-019 | completed | `start_solution_review_workflow` now exposes stable workflow + agent handoff fields while preserving `finalResponse` and the legacy merged `nextActions` field for compatibility. |
| BL-020 | completed | `SCN-04` now has fixture coverage, cloud validation depth, and acceptance coverage through validation/artifact/export surfaces. |
| BL-021 | completed | `capture_solution_requirements` and `draft_topology_model` now provide the first front-door intake layer without weakening confirmed-only artifact gating. |
| BL-022 | completed | The review workflow now runs through explicit multi-worker orchestration with dependency ordering and worker-to-worker message passing. |

## Ordered Backlog

### BL-001 - Stabilize validation issue contract [completed]

- **Goal**: freeze issue shape, severity, blocking semantics, and code catalog
- **Depends on**: existing first validation slice
- **Source docs**: `docs/domain-model.md`, `docs/plans/next-stage.md`
- **Acceptance**:
  - issue codes are centralized
  - issue ordering is deterministic
  - validators emit one shared issue shape

### BL-002 - Add explicit IP allocation entities [completed]

- **Goal**: stop treating IP allocation as artifact-only derived data
- **Depends on**: `BL-001`
- **Source docs**: `docs/domain-model.md`, `SCN-04`
- **Acceptance**:
  - allocation schema exists
  - slice input includes allocations
  - artifact rows can be built from explicit allocations

### BL-003 - Upgrade IP validation rules [completed]

- **Goal**: validate allocation-to-segment correctness using the shared issue contract
- **Depends on**: `BL-001`, `BL-002`
- **Acceptance**:
  - missing segment references are reported
  - invalid IPs are reported
  - out-of-subnet allocations are reported
  - duplicate allocation identity or addresses are reported

### BL-004 - Upgrade IP allocation artifact generation [completed]

- **Goal**: generate allocation-aware rows instead of segment summary rows
- **Depends on**: `BL-002`, `BL-003`
- **Acceptance**:
  - artifact rows come from explicit allocation records
  - blocked output reflects validation state
  - ready output reflects allocation rows only

### BL-005 - Add `validate_solution_model` [completed]

- **Goal**: expose standalone validation without coupling it to artifact generation
- **Depends on**: `BL-003`
- **Acceptance**:
  - tool is registered
  - tool returns structured validation summary
  - runtime can invoke it end to end

### BL-006 - Start second deterministic slice [completed]

- **Goal**: begin `port-connection-table` after the IP trust-center path is stable
- **Depends on**: `BL-001` through `BL-005`
- **Acceptance**:
  - next slice remains schema -> validator -> artifact -> tool

### BL-007 - Land first SCN-01 physical planning slice [completed]

- **Goal**: add explicit rack modeling plus `device-cabling-table` and `device-port-plan`
- **Depends on**: `BL-006`
- **Source docs**: `docs/scenarios.md`, `SCN-01`, `docs/domain-model.md`
- **Acceptance**:
  - rack entities are explicit in the canonical slice input
  - rack placement validation is deterministic
  - `device-cabling-table` and `device-port-plan` generate from validated model data only
  - runtime can invoke both new tools end to end

### BL-008 - Add scenario acceptance fixtures and snapshots [completed]

- **Goal**: move canonical scenarios from documentation into executable acceptance coverage
- **Depends on**: `BL-007`
- **Source docs**: `docs/scenarios.md`
- **Acceptance**:
  - `SCN-01` fixture produces stable artifact outputs
  - `SCN-02` and `SCN-03` pass end to end through runtime/tool coverage
  - scenario assertions complement unit tests instead of replacing them

### BL-009 - Introduce the normalization layer for structured physical inputs [completed]

- **Goal**: stop requiring already-canonical physical inputs at every tool boundary
- **Depends on**: `BL-007`, `BL-008`
- **Source docs**: `docs/architecture.md`, `docs/roadmap.md`
- **Acceptance**:
  - structured physical inputs normalize into canonical racks/devices/ports/links
  - ambiguity remains explicit instead of being silently filled in
  - artifact generation still consumes validated model data only

### BL-010 - Enforce confirmed-only artifact generation across implemented slices [completed]

- **Goal**: prevent inferred or unresolved physical/IP facts from driving final-looking outputs
- **Depends on**: `BL-007`, `BL-009`
- **Source docs**: `docs/roadmap.md`, `docs/domain-model.md`
- **Acceptance**:
  - requested physical artifacts block on non-confirmed rack/device/port/link facts
  - requested IP artifacts block on non-confirmed segment/allocation facts
  - missing required artifact rows are surfaced explicitly instead of rendering empty ready outputs

### BL-011 - Add design-gap review summary output [completed]

- **Goal**: land the first user-facing review/export sub-slice as a deterministic assumptions/gaps summary
- **Depends on**: `BL-005`, `BL-008`, `BL-009`, `BL-010`
- **Source docs**: `docs/architecture.md`, `docs/roadmap.md`
- **Acceptance**:
  - `summarize_design_gaps` is registered and invokable end to end
  - output separates assumptions, blocking gaps, and unresolved review items
  - report content comes from normalized/validated model data and issue output only
  - markdown report is deterministic and review-friendly

### BL-012 - Add artifact bundle/export workflow [completed]

- **Goal**: package existing validated artifacts and review output into one deterministic export response
- **Depends on**: `BL-005`, `BL-007`, `BL-008`, `BL-010`, `BL-011`
- **Source docs**: `docs/architecture.md`, `docs/roadmap.md`
- **Acceptance**:
  - `export_artifact_bundle` is registered and invokable end to end
  - bundle includes a bundle index, review artifact, and all requested markdown artifacts
  - bundle output stays deterministic and does not invent missing rows or files
  - omitted artifact requests fall back to the configured default artifact set

### BL-013 - Lock canonical export-bundle baselines [completed]

- **Goal**: turn `SCN-01` to `SCN-03` bundle outputs into checked-in regression references before moving into orchestration
- **Depends on**: `BL-008`, `BL-012`
- **Source docs**: `docs/scenarios.md`, `docs/roadmap.md`
- **Acceptance**:
  - each canonical scenario has a checked-in expected export-bundle baseline
  - scenario bundle tests compare normalized bundle payloads to expected files
  - regression baselines cover bundle index, review report, and requested markdown artifacts

### BL-014 - Deepen SCN-02 and SCN-03 deterministic validation [completed]

- **Goal**: harden redundancy and multi-rack semantics before starting agent/background workflow work
- **Depends on**: `BL-007`, `BL-008`, `BL-012`, `BL-013`
- **Source docs**: `docs/scenarios.md`, `docs/domain-model.md`
- **Acceptance**:
  - dual-homed devices require distinct peer coverage instead of raw link counts only
  - redundant links must carry consistent redundancy-group metadata
  - rack-aware port-connection planning rejects missing rack assignments
  - inter-rack and multi-rack connection semantics are checked deterministically

### BL-015 - Add a thin review/export workflow coordinator [completed]

- **Goal**: add the smallest `src/features/` orchestration layer before agent development
- **Depends on**: `BL-011`, `BL-012`, `BL-013`, `BL-014`
- **Source docs**: `docs/architecture.md`, `docs/roadmap.md`
- **Acceptance**:
  - `src/features/solution-review-workflow.ts` coordinates normalization, validation, review summary, and export bundle state
  - `summarize_design_gaps` and `export_artifact_bundle` share the same workflow-state logic
  - workflow output distinguishes `blocked`, `review_required`, and `export_ready`
  - no agent/background worker implementation is introduced yet

### BL-016 - Add the first orchestration launcher [completed]

- **Goal**: add the first user-facing orchestration step before starting agent implementation
- **Depends on**: `BL-015`
- **Source docs**: `docs/architecture.md`, `docs/roadmap.md`
- **Acceptance**:
  - `start_solution_review_workflow` is registered and invokable end to end
  - output includes queued/running/terminal orchestration transitions
  - the launcher exposes `blocked`, `review_required`, and `export_ready` without inventing new artifact data
  - non-ready paths do not expose an export bundle

### BL-017 - Add the first agent-facing handoff contract [completed]

- **Goal**: add the smallest deterministic `src/agents/` slice on top of the orchestration launcher
- **Depends on**: `BL-016`
- **Source docs**: `docs/architecture.md`, `docs/roadmap.md`
- **Acceptance**:
  - `src/agents/solution-review-brief.ts` defines a deterministic agent brief for workflow follow-up
  - `start_solution_review_workflow` returns the workflow result plus `agentBrief`
  - the brief distinguishes blocked, review-required, export-ready, and failed follow-up goals
  - no inter-agent messaging or broad agent runtime is introduced yet

### BL-018 - Add the first actual review assistant [completed]

- **Goal**: complete the first actual agent layer slice without introducing a broad agent platform
- **Depends on**: `BL-017`
- **Source docs**: `docs/architecture.md`, `docs/roadmap.md`
- **Acceptance**:
  - `src/agents/solution-review-assistant.ts` consumes `SolutionReviewAgentBrief`
  - the assistant returns deterministic response/checklist output for blocked, review-required, export-ready, and failed states
  - `start_solution_review_workflow` returns both `agentBrief` and `agentResponse`
  - no inter-agent communication or multi-agent orchestration is introduced yet

### BL-019 - Align the first orchestration contract [completed]

- **Goal**: converge the launcher, handoff, tests, and docs on one stable public result shape for the first review workflow
- **Depends on**: `BL-016`, `BL-017`, `BL-018`
- **Acceptance**:
  - `start_solution_review_workflow` exposes workflow state, clarification summary, `agentBrief`, and `agentResponse` in one public payload
  - existing `finalResponse` and `nextActions` stay available as backward-compatible fields during the transition
  - `finalResponse` mirrors `agentResponse.response`, while `nextActions` preserves the legacy merged action list
  - docs and tests stop disagreeing about whether `agentBrief` / `agentResponse` exist
  - failure and fallback paths preserve the same public contract

### BL-020 - Land `SCN-04` as the cloud post-MVP anchor [completed]

- **Goal**: add the missing cloud-oriented acceptance slice that the docs already describe
- **Depends on**: `BL-019`
- **Source docs**: `docs/scenarios.md`, `docs/domain-model.md`
- **Acceptance**:
  - `SCN-04` has fixture coverage
  - `SCN-04` passes through validation and IP allocation artifact generation end to end
  - acceptance tests prove the cloud-oriented path independently of the physical rack scenarios

### BL-021 - Add front-door requirement capture tooling [completed]

- **Goal**: introduce the first user-facing intake layer before any draft-topology or multimodal slice
- **Depends on**: `BL-020`
- **Source docs**: `docs/architecture.md`, `docs/roadmap.md`
- **Acceptance**:
  - a requirements-capture tool is registered and invokable end to end
  - the tool produces normalized candidate input without weakening the confirmed-only trust boundary
  - follow-up workflow/tool paths can consume the captured structure deterministically

### BL-022 - Expand multi-worker orchestration [completed]

- **Goal**: grow the current review workflow substrate into explicit multi-worker orchestration with visible worker dependencies
- **Depends on**: `BL-019`, `BL-020`, `BL-021`
- **Acceptance**:
  - at least one additional worker joins the current clarification + review path
  - worker dependency ordering is covered by tests
  - public workflow output remains deterministic while surfacing richer orchestration state

### BL-023 - Land SCN-05 candidate-fact drafting [completed]

- **Goal**: add the first document-provenanced candidate-fact layer without introducing autonomous extraction
- **Depends on**: `BL-021`, `BL-022`
- **Source docs**: `docs/scenarios.md`, `docs/architecture.md`
- **Acceptance**:
  - document/image/diagram-backed candidate facts enter `draft_topology_model`
  - candidate facts remain `inferred` or `unresolved` until explicitly confirmed
  - SCN-05 draft tests and scenario acceptance prove the path cannot reach export-ready directly

### BL-024 - Add explicit confirmation/promote flow [completed]

- **Goal**: promote selected candidate facts into confirmed canonical input without breaking the existing review/export contract
- **Depends on**: `BL-023`
- **Source docs**: `docs/scenarios.md`, `docs/architecture.md`
- **Acceptance**:
  - `draft_topology_model` accepts explicit confirmations/promotions
  - `start_solution_review_workflow` distinguishes structured input, candidate-fact draft, and confirmed slice inputs
  - review/export only become export-ready after confirmed data is supplied

## Not Scheduled Yet

- autonomous document-assisted extraction helper
- external system integrations

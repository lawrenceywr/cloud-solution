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

Framework status right now:

1. the plugin boot flow, runtime kernel, tool registry, and basic readiness guard are implemented
2. deterministic model/artifact/review tools plus a first workflow launcher are implemented and verified end to end
3. `src/features/` now contains deterministic review/export coordination and one orchestration launcher, and `src/agents/` now contains a first actual review assistant, but no inter-agent communication or multi-agent orchestration exists yet

Active next focus:

1. inter-agent communication and richer agent-layer orchestration on top of the new workflow launcher and first review assistant
2. post-MVP extensions such as multimodal drafting and external integrations

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

## Not Scheduled Yet

- multimodal candidate fact extraction
- external system integrations

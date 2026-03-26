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

Framework status right now:

1. the plugin boot flow, runtime kernel, tool registry, and basic readiness guard are implemented
2. deterministic model/artifact/review tools are implemented and verified end to end
3. `src/agents/` and `src/features/` are still empty, so agent orchestration, inter-agent communication, and background review workflows are not implemented yet

Active next focus:

1. artifact bundle/export workflow on top of the new review summary output
2. richer scenario fixtures and snapshot maintenance
3. agent/background workflow orchestration only after the export/review foundation is in place
4. post-MVP extensions such as multimodal drafting and external integrations

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

## Not Scheduled Yet

- SCN-02 redundancy intent and dual-homing rule depth
- SCN-03 multi-rack pod validation depth
- multimodal candidate fact extraction
- export bundles and review workflows
- external system integrations

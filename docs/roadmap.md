# cloud-solution Roadmap

> **Status (2026-04-13):** MVP Complete ✅ → Phase 9 Started  
> **Latest Completed Phase:** 8 (Agent Boundary & Planner Advisory Layer)  
> **Active Phase:** 9 (MCP / External Integrations) - in progress via internal MarkItDown preprocessing  
> **Quick Summary:** See `docs/progress-snapshot.md`

## 1. Goal

Deliver a trustworthy MVP that can generate core solution-planning artifacts from explicit or user-confirmed facts.

The roadmap favors correctness and validation ahead of convenience and autonomy.

## 2. MVP Definition

The MVP is successful when it can:

- accept structured or guided requirements
- normalize devices, ports, links, racks, and segments into a canonical model
- validate that model and report blocking issues
- generate the 4 target artifact types
- present assumptions, gaps, and unresolved items clearly

## 3. Phase Plan

## Phase 0 - Documentation and Scenario Lock

Deliverables:

- architecture doc
- domain model doc
- canonical scenarios
- roadmap and repo guidance

Exit criteria:

- the team agrees on trust boundary and MVP scope
- the first scenarios are stable enough to drive implementation

## Phase 1 - Schema Spine

Build:

- Zod schemas for all core entities
- basic config schema
- result and issue schemas

Exit criteria:

- valid and invalid examples are covered by tests
- schema contracts match the scenarios

## Phase 2 - Normalization Layer

Build:

- requirement normalization
- inventory normalization
- naming and identity normalization
- candidate-to-entity transformation

Exit criteria:

- structured inputs produce stable normalized entities
- ambiguous inputs remain flagged instead of silently resolved

## Phase 3 - Validation and Rule Engine

Build:

- topology consistency checks
- rack placement checks
- port/link checks
- subnet and IP allocation checks
- issue severity model

Exit criteria:

- blocking issues stop artifact generation
- warnings are preserved for review/export

## Phase 4 - Artifact Row Builders

Build:

- cabling row builder
- port plan row builder
- port connection row builder
- IP allocation row builder

Exit criteria:

- row outputs are deterministic
- each row builder consumes validated model data only

## Phase 5 - Renderers

Build:

- markdown table renderer
- machine-friendly JSON output
- CSV/Excel-friendly export path if needed

Exit criteria:

- all target scenarios produce readable artifacts
- outputs include assumptions and unresolved items

## Phase 6 - Plugin Integration

Build:

- plugin boot flow
- user-facing tools
- safety hooks
- review/export workflow

Exit criteria:

- an OpenCode session can run the end-to-end draft flow
- low-confidence cases trigger review rather than silent export

## Phase 7 - Extraction Expansion and Workflow Expansion

Build:

- evidence reconciliation on top of the landed document-assisted extraction helper
- optional background review workflows
- optional adjacent agents and skills

Exit criteria:

- extraction outputs are clearly marked as candidate facts
- user confirmation flow is in place
- extracted facts remain non-confirmed until explicit promotion

## Phase 8 - Agent Boundary and Planner Advisory Layer

Build:

- move tool-to-worker direct calls behind feature-layer entry points
- formalize document-assisted extraction into the same agent + worker split used by the existing review assistant
- add four internal planner agents aligned to the existing artifact domains
- keep planner output advisory and draft-oriented instead of generating final artifacts directly

Exit criteria:

- tool handlers no longer import child workers directly for extraction or reconciliation flows
- document-assisted extraction prompt/schema execution lives under `src/agents/`
- four planner agent/worker slices exist for device cabling, device port plan, port connection, and IP allocation
- planner output round-trips back through `draft_topology_model` instead of bypassing validation
- final artifacts still come only from normalized and validated model data

## Phase 9 - MCP / External Integrations

Build:

- optional external integrations for inventory/topology sources
- MCP-backed source ingestion for advisory candidate-fact inputs

Exit criteria:

- integrations remain optional and configurable
- external data stays outside the confirmed trust boundary until normalized, reviewed, and validated
- planner/extraction path is stable enough to accept upstream source adapters

## 4. Suggested Work Tracks

### Track A - Domain Schemas

Owns entity definitions and row contracts.

### Track B - Validation Rules

Owns deterministic checks and issue reporting.

### Track C - Artifact Builders and Renderers

Owns all output rows and export formatting.

### Track D - Plugin Integration

Owns tools, hooks, background flows, and packaging.

### Track E - Scenario Acceptance Coverage

Owns fixtures, snapshot expectations, and end-to-end coverage.

## 5. Dependencies

- stable scenarios
- stable domain model
- consistent naming/ID strategy
- explicit rule coverage boundaries

Tracks B and C should not move ahead aggressively until Track A is stable.

## 6. MVP Out of Scope

- full arbitrary diagram parsing
- auto-generated deployment configs
- deep vendor-specific logic packs
- large external system integration
- claiming final design certainty without review

## 7. Major Risks

1. Ambiguous source material
2. domain model too weak for real-world edge cases
3. renderers becoming a second hidden logic engine
4. plugin wiring consuming time before core modeling is solid

## 8. Risk Controls

- enforce the validated-model trust boundary
- separate extraction from normalization
- keep generators pure
- require explicit confirmation for inferred facts
- start with a narrow scenario set

## 9. Definition of Done for MVP

The MVP is done when:

- at least 3 canonical scenarios pass end to end
- all 4 primary artifacts can be generated from validated model data
- ambiguity and missing data are surfaced explicitly
- final output does not depend on silent inference from weak inputs

## 10. Recommended First Implementation Order

1. tests and fixtures for the first scenario
2. core entity schemas
3. validation issues schema
4. normalization for the first scenario
5. validation for the first scenario
6. artifact row builders
7. markdown renderer
8. plugin tool integration

Do not let agents or multimodal automation bypass the validated-model trust boundary.

## 11. Execution Docs

Use these documents when moving from roadmap phases to actual implementation work:

- `docs/backlog-active.md` — active backlog items and dependencies
- `docs/backlog-archive.md` — completed backlog history and prior slices
- `docs/plans/current.md` — current execution scope, file map, and verification checklist

The roadmap stays phase-oriented. Day-to-day implementation should follow the backlog and current-stage plan instead of expanding this document with task-level checklists.

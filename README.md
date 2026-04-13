# cloud-solution

`cloud-solution` is a new OpenCode plugin project for cloud and data-center solution design.

Its job is to help turn requirements, inventory, topology information, rack information, and supporting documents into validated planning artifacts such as:

- device cabling tables
- device port planning tables
- device port connection tables
- IP allocation tables
- solution notes, assumptions, and review items

## Product Direction

This project is inspired by the OMO architecture, but it will be a separate plugin with its own domain model and validation rules.

The key design principle is:

> only validated, normalized domain data can produce final artifacts.

That means diagrams, PDFs, screenshots, and agent reasoning are useful inputs, but they are not automatically treated as truth.

## MVP Promise

The MVP is human-in-the-loop.

- It should accept structured and semi-structured inputs.
- It may use multimodal extraction as a drafting aid.
- It must surface ambiguity, missing fields, and low-confidence assumptions.
- It must not claim fully autonomous, high-confidence final designs from weak inputs.

## Target Artifact Flow

```text
requirements / inventory / topology / rack docs
  -> extraction
  -> normalization
  -> canonical domain model
  -> validation and rule checks
  -> artifact generation
  -> review and export
```

## Initial Documentation Map

- `AGENTS.md` — repo working rules for coding agents and contributors
- `docs/architecture.md` — architecture, trust boundary, module layout, and workflow
- `docs/domain-model.md` — core entities, relationships, and validation contracts
- `docs/roadmap.md` — phased delivery plan from MVP to later expansion
- `docs/scenarios.md` — canonical scenarios that should drive tests and fixtures
- `docs/progress-snapshot.md` — current implementation snapshot
- `docs/backlog-active.md` — active backlog derived from roadmap phases and scenario coverage
- `docs/backlog-archive.md` — completed backlog history
- `docs/plans/current.md` — current or most recent stage record
- `docs/plans/stage-07-evidence-reconciliation.md` — Phase 7 planning detail

## Recommended First Development Order

1. Finalize domain schemas.
2. Build deterministic validation rules.
3. Build row builders for the target tables.
4. Add markdown and machine-readable renderers.
5. Wire tools and hooks into the plugin.
6. Add evidence-reconciliation on top of the extraction path only after the trust boundary is stable.

## Intended Repository Shape

```text
cloud-solution/
├── AGENTS.md
├── README.md
└── docs/
    ├── architecture.md
    ├── domain-model.md
    ├── roadmap.md
    └── scenarios.md
```

The source layout currently follows this shape:

```text
src/
├── index.ts
├── artifacts/
├── agents/
├── config/
├── coordinator/
├── domain/
├── features/
├── hooks/
├── normalizers/
├── plugin/
├── renderers/
├── scenarios/
├── shared/
├── tools/
├── validators/
└── workers/
```

## Current Status

This directory now contains:

- architecture and delivery docs
- a Bun/TypeScript plugin scaffold
- deterministic schema/validation/tooling for IP allocation, port connection, device cabling, and device port plan artifacts
- executable acceptance coverage for `SCN-01`, `SCN-02`, and `SCN-03`
- a first normalization layer for structured physical/network input into the canonical model
- confirmation gating that blocks weak physical and IP facts from driving final artifacts
- a deterministic `summarize_design_gaps` review tool and assumption report renderer
- a deterministic `export_artifact_bundle` workflow that packages requested artifacts, review output, and a bundle index
- checked-in `SCN-01` to `SCN-03` bundle regression baselines
- deeper deterministic validation for SCN-02 dual-homing and SCN-03 multi-rack semantics
- a thin deterministic `solution-review-workflow` coordinator in `src/features/`
- a first `start_solution_review_workflow` orchestration launcher over that coordinator
- a first `requirements-clarification` child worker in `src/workers/`
- a first deterministic `solution_review_assistant` brief in `src/agents/`
- a first actual `solution_review_assistant` response module built on that brief
- a reusable coordinator / child-session substrate in `src/coordinator/` for later multi-agent expansion
- a converged public review-workflow handoff that now exposes `agentBrief` / `agentResponse` while keeping `finalResponse` / `nextActions` for backward compatibility
- executable `SCN-04` cloud-allocation coverage in fixtures, validation, artifact generation, and scenario acceptance
- executable `SCN-05` document-assisted candidate-fact drafting and confirmation coverage
- executable `SCN-06` multi-document conflict coverage across drafting, review, and scenario acceptance
- first front-door intake tools for `capture_solution_requirements` and `draft_topology_model`
- explicit multi-worker review orchestration with dependency-ordered worker execution and worker-to-worker message passing
- a deterministic evidence-reconciliation validator + worker wired into the review path
- feature-layer entry points for extraction, topology drafting, and review-summary paths so tools stay thin
- a formal `document-assisted-extraction` agent + worker split
- four advisory planner slices for device cabling, device port planning, port connection, and IP allocation

The current implementation covers:

1. stabilize issue contracts
2. explicit IP allocation modeling and artifact generation
3. explicit port connection modeling and artifact generation
4. rack-aware `SCN-01` physical planning via device cabling and device port plan artifacts
5. canonical scenario acceptance for `SCN-01` to `SCN-06`
6. structured-input normalization before validation/tool execution
7. review-ready assumptions/gaps reporting from validated model state
8. export-ready artifact bundle packaging on top of validated/reviewed outputs
9. checked-in bundle regression baselines for SCN-01 to SCN-03
10. stronger deterministic SCN-02 and SCN-03 rule depth before agent work
11. a shared workflow-state coordinator for review/export before any agent layer exists
12. a tracked queued→running→terminal workflow launcher before any agent layer exists
13. a deterministic agent-facing handoff brief for review/export follow-up
14. a first actual review assistant that turns handoff state into deterministic agent output
15. a cloud-oriented `SCN-04` acceptance anchor for IP allocation planning
16. front-door requirement capture and draft-topology intake tools
17. explicit dependency-ordered multi-worker orchestration on the review path
18. document-provenanced SCN-05 candidate-fact drafts with explicit confirmation/promotion
19. a document-assisted extraction helper that feeds directly into the SCN-05 draft path
20. deterministic evidence reconciliation and `SCN-06` multi-document conflict detection on the review path

The current framework maturity is:

1. plugin boot flow, runtime kernel, tool registry, and one pre-execution readiness guard are implemented
2. tool-driven validation, artifact generation, review summary, workflow launch, `SCN-04` acceptance, requirement capture, and draft-topology intake are implemented end to end
3. the review workflow now runs through explicit multi-worker orchestration on the existing coordinator substrate, the SCN-05 path includes document-assisted extraction, candidate-fact drafting, and explicit confirmation/promotion, the SCN-06 path adds blocking conflict detection through evidence reconciliation, and the post-MVP advisory planners now return draft structured input instead of final artifacts

## Current Agent / Orchestration Status

The branch now has six formal child-agent modules and their worker/feature adapters:

1. `start_solution_review_workflow` + `src/features/solution-review-agent-handoff.ts` act as the orchestrator layer.
2. `src/workers/requirements-clarification/worker.ts` runs the clarification child worker.
3. `src/workers/evidence-reconciliation/worker.ts` runs the evidence-reconciliation child worker.
4. `src/workers/solution-review-assistant/worker.ts` runs the dependency-ordered review-assistant worker.
5. `src/agents/solution-review-assistant.ts` runs the review-assistant child agent.
6. `src/agents/document-assisted-extraction.ts` plus the 4 planner agents in `src/agents/` own the extraction/planning child-session contracts.

That means the codebase now has an explicit multi-worker review path, a formal extraction agent split, a document-provenanced candidate-fact draft/promote path, a wired evidence-reconciliation step, and four advisory planner slices that feed back into `draft_topology_model`. Final artifact generation is still deterministic, and external integration layers are not implemented.

The roadmap MVP done criteria are now satisfied on this branch.

The next development focus is now the remaining post-MVP work:

1. define Phase 9 scope around MCP / external integrations
2. add MCP / external-system integrations only after the extraction + planner path is stable

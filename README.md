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
- `docs/backlog.md` — actionable backlog derived from roadmap phases and scenario coverage
- `docs/plans/next-stage.md` — current-stage execution plan and file-by-file scope
- `docs/plans/next-stage-testing.md` — current-stage TDD and verification plan

## Recommended First Development Order

1. Finalize domain schemas.
2. Build deterministic validation rules.
3. Build row builders for the target tables.
4. Add markdown and machine-readable renderers.
5. Wire tools and hooks into the plugin.
6. Add multimodal-assisted extraction only after the trust boundary is stable.

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

Code will be added later, but the intended source layout is expected to follow this shape:

```text
src/
├── index.ts
├── config/
├── domain/
├── normalizers/
├── validators/
├── tools/
├── hooks/
├── features/
├── renderers/
├── agents/
├── mcp/
└── shared/
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

The current implementation covers:

1. stabilize issue contracts
2. explicit IP allocation modeling and artifact generation
3. explicit port connection modeling and artifact generation
4. rack-aware `SCN-01` physical planning via device cabling and device port plan artifacts
5. canonical scenario acceptance for `SCN-01` to `SCN-03`
6. structured-input normalization before validation/tool execution
7. review-ready assumptions/gaps reporting from validated model state
8. export-ready artifact bundle packaging on top of validated/reviewed outputs
9. checked-in bundle regression baselines for SCN-01 to SCN-03
10. stronger deterministic SCN-02 and SCN-03 rule depth before agent work

The current framework maturity is:

1. plugin boot flow, runtime kernel, tool registry, and one pre-execution readiness guard are implemented
2. tool-driven validation, artifact generation, and review summary flows are implemented end to end
3. agent orchestration, inter-agent communication, and background workflow modules are not implemented yet (`src/agents/` and `src/features/` are still empty)

The roadmap MVP done criteria are now satisfied on this branch.

The next development focus is post-MVP:

1. agent/background workflow orchestration after the export/review foundation is stronger
2. optional multimodal drafting and later integrations without weakening the trust boundary

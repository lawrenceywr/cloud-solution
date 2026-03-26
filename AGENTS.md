# cloud-solution - AGENTS.md

## Scope

- This file applies to coding agents and contributors working in the `cloud-solution` repository root.
- More specific `AGENTS.md` files deeper in the tree should override this file.
- The current repository is in planning/bootstrap stage; architecture docs are the source of truth.

## Project Intent

- Build a separate OpenCode plugin for cloud and data-center solution design.
- Reuse the OMO architectural pattern, not the OMO product scope.
- Keep the plugin model-driven: artifacts come from validated domain state, not freeform agent prose.

## Non-Negotiable Rules

- Do not treat multimodal extraction as authoritative truth.
- Do not generate final artifacts from ambiguous or incomplete topology facts without surfacing gaps.
- Do not let renderers invent missing ports, links, racks, or IP allocations.
- Do not implement plugin orchestration before the domain model and validation contracts exist.
- Do not use `as any`, `@ts-ignore`, or `@ts-expect-error`.

## Core Trust Boundary

Only data that has passed these stages may produce final tables:

1. input capture
2. normalization
3. canonical domain model
4. validation and rule checks

Everything else is advisory.

## Development Priorities

1. `docs/scenarios.md` defines target scenarios and expected outputs.
2. `docs/domain-model.md` defines the entities and constraints.
3. `src/domain/` and `src/validators/` should be implemented before `src/tools/`.
4. `src/renderers/` should stay pure and consume validated row data only.
5. `src/index.ts` should remain thin and only assemble plugin components.

## Planned Source Areas

| Area | Purpose |
|------|---------|
| `src/config/` | Plugin config schemas and defaults |
| `src/domain/` | Canonical entities and row contracts |
| `src/normalizers/` | Convert raw inputs into normalized entities |
| `src/validators/` | Deterministic rule checks and consistency validation |
| `src/tools/` | User-facing solution workflow tools |
| `src/hooks/` | Safety checks and workflow guards |
| `src/features/` | Background orchestration and review flows |
| `src/renderers/` | Markdown/JSON/CSV-friendly artifact generation |
| `src/agents/` | Adjacent prompts and review helpers |
| `src/mcp/` | Optional external integrations later |

## Style Guidance

- Prefer small, focused modules.
- Keep `index.ts` to top-level wiring only.
- Use Zod-first schemas for any user-facing or intermediate data.
- Separate extraction, normalization, validation, and rendering into different modules.
- Prefer deterministic logic over agent inference whenever an artifact row is produced.

## TDD Guidance

- Start from a scenario in `docs/scenarios.md`.
- Write or update the matching schema and validation test first.
- Add the minimum implementation needed to satisfy the scenario.
- Only then connect the new logic to tools or hooks.

## Validation Guidance

When code exists, follow this order:

1. typecheck
2. targeted tests for changed area
3. scenario-level tests if shared behavior changed
4. build when plugin wiring or exports changed

## Commit Guidance

- Keep commits atomic.
- Separate schema work, validation work, renderer work, and integration work.
- Do not mix refactors with new domain behavior unless the refactor is strictly required.

## What Success Looks Like

- The plugin can generate draft or final artifacts from validated facts.
- Ambiguity is explicit.
- Confidence and assumptions are visible.
- The system refuses to present weakly inferred data as confirmed design truth.

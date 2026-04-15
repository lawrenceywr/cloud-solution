# Current Stage Plan

**Created:** 2026-04-14  
**Completed:** 2026-04-14  
**Phase:** 10 (Guardrails & Acceptance Expansion)  
**Status:** Complete

> This plan records the completed post-roadmap Phase 10 slice. The roadmap phases through Phase 9 remain complete and are summarized in `docs/progress-snapshot.md`.

---

## Scope

**In Scope:**
- add the four suggested first hook modules to the existing runtime hook surface
- reuse the existing review/export state model instead of creating a second readiness system
- add one new canonical scenario (`SCN-07`) proving low-confidence and incomplete inputs stay out of `export_ready`
- keep tools thin and avoid new public tool surface

**Out of Scope:**
- a broad external-adapter or `src/mcp/` platform phase
- new user-facing tools for export gating
- changing the roadmap phase model beyond recording this post-roadmap slice

---

## Implementation Order

### Phase 10A - Shared Export Guard State

Goal:
- expose reusable workflow-state evaluation so hooks and feature code share the same `blocked` / `review_required` / `export_ready` semantics

Acceptance:
- [x] `runSolutionReviewWorkflow()` reuses a shared evaluator instead of duplicating readiness logic
- [x] no new public tool is introduced for readiness evaluation

### Phase 10B - Hook Guard Expansion

Goal:
- harden runtime tool execution before export/artifact generation proceeds

Acceptance:
- [x] `missing-required-input-guard` exists and rejects missing requirement / planning input
- [x] `artifact-generation-precheck` exists and blocks artifact/export execution on blocking issues
- [x] `low-confidence-export-guard` exists and rejects low-confidence export attempts
- [x] `assumption-review-reminder` exists and rejects remaining review-required export attempts with a review-first message
- [x] the runtime hook chain executes the new guards in deterministic order

### Phase 10C - SCN-07 Acceptance Expansion

Goal:
- add one canonical scenario that proves hook-driven export gating is real, not just unit-tested in isolation

Acceptance:
- [x] `docs/scenarios.md` defines `SCN-07 - Guarded Export Readiness`
- [x] `src/scenarios/fixtures.ts` contains `createScn07GuardedExportFixture()`
- [x] scenario acceptance proves low-confidence export rejection, incomplete export rejection, and clean export success

---

## Planned File Areas

### Documentation
- `docs/scenarios.md`
- `docs/progress-snapshot.md`
- `docs/backlog-active.md`
- `docs/plans/current.md`
- `README.md`
- `README.zh-CN.md`

### Code
- `src/create-hooks.ts`
- `src/plugin-interface.ts`
- `src/features/solution-review-workflow.ts`
- `src/hooks/**`
- `src/scenarios/fixtures.ts`
- `src/scenarios/scenario-acceptance.test.ts`
- `src/index.test.ts`

---

## Verification

- [x] run targeted Bun tests for touched workflow, hook, runtime, and scenario files
- [x] run full repo test suite
- [x] run language-server diagnostics on touched files
- [x] run typecheck and build
- [x] manually execute representative runtime export/review flows after implementation

### Verification Evidence

- `bun test src/features/solution-review-workflow.test.ts src/create-hooks.test.ts src/index.test.ts src/scenarios/scenario-acceptance.test.ts` → passing (`57 pass / 0 fail`)
- `bun test` → passing (`272 pass / 0 fail`)
- `bun run typecheck` → passing
- `bun run build` → passing
- manual QA 1: `export_artifact_bundle` with `createScn07GuardedExportFixture()` rejects with `Artifact bundle export requires confirmation for inferred or unresolved facts before export.`
- manual QA 2: incomplete SCN-07 export rejects with `Artifact bundle export is blocked by validation issues: ip_allocations_missing`
- manual QA 3: `validate_solution_model` with `documentAssist: {}` rejects with `Tool execution requires at least one planning input section for validate_solution_model`
- manual QA 4: clean `SCN-01` export still returns `workflowState: "export_ready"`
- manual QA 5: `start_solution_review_workflow` with SCN-07 returns `review_required`

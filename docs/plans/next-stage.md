# Next Stage Plan

Status: completed.

This post-MVP slice is now complete: `SCN-04`, the front-door intake tools, explicit multi-worker review orchestration, and the first `SCN-05` candidate-fact/confirmation path have all landed. The next remaining post-MVP work needs a fresh plan around autonomous document-assisted extraction and later MCP / external integrations.

## Scope

In scope:

- land `SCN-04` fixture, validation depth, artifact assertions, and scenario acceptance
- add `capture_solution_requirements` and `draft_topology_model` as the first front-door intake tools
- route the review workflow through explicit dependency-ordered multi-worker orchestration
- land the first `SCN-05` document-provenanced candidate-fact and confirmation flow
- update planning/progress docs after those slices land

Out of scope:

- multimodal extraction
- vendor-specific logic packs

## File Map

### Planning docs

- `README.md`
- `docs/backlog.md`
- `docs/plans/next-stage.md`
- `docs/plans/next-stage-testing.md`

### Scenario, intake, and orchestration coverage

- `docs/scenarios.md`
- `src/scenarios/fixtures.ts`
- `src/validators/validate-cloud-solution-model.ts`
- `src/tools/capture-solution-requirements/tools.ts`
- `src/tools/draft-topology-model/tools.ts`
- `src/tools/validate-solution-model/tools.ts`
- `src/tools/generate-ip-allocation-table/tools.ts`

### Artifact / acceptance surfaces

- `src/artifacts/ip-allocation-table/build-ip-allocation-table.ts`
- `src/tools/export-artifact-bundle/tools.ts`
- `src/coordinator/dispatcher.ts`
- `src/workers/solution-review-assistant/worker.ts`
- `src/scenarios/scenario-acceptance.test.ts`
- `src/scenarios/scenario-bundle-snapshots.test.ts`

### Tests

- `src/validators/validate-cloud-solution-model.test.ts`
- `src/artifacts/ip-allocation-table/build-ip-allocation-table.test.ts`
- `src/create-tools.test.ts`
- `src/index.test.ts`
- `src/coordinator/dispatcher.test.ts`
- `src/features/solution-review-agent-handoff.test.ts`
- `src/scenarios/scenario-acceptance.test.ts`
- `src/scenarios/scenario-bundle-snapshots.test.ts`

## Execution Order

1. land `SCN-04` fixture and cloud validation depth
2. add front-door requirement capture and draft-topology intake tools
3. expand the review path into explicit multi-worker orchestration
4. run targeted verification and then full verification

## Progress

- [x] current progress and next-step assessment captured in planning docs
- [x] public handoff contract aligned across features/tools/tests
- [x] backward-compatible result fields verified for current callers
- [x] `SCN-04` fixture and acceptance coverage landed
- [x] cloud-oriented validation / IP allocation gaps closed where needed
- [x] front-door intake tools landed
- [x] dependency-ordered multi-worker review orchestration landed
- [x] SCN-05 document-provenanced candidate-fact draft flow landed
- [x] explicit confirmation/promote flow landed
- [x] progress docs updated after the slice landed

## Acceptance for This Stage

- `SCN-04` exists as executable fixture-driven coverage
- the cloud-oriented path passes validation and IP allocation generation end to end
- `capture_solution_requirements` and `draft_topology_model` provide a front-door intake path without weakening confirmed-only artifact gating
- the review workflow exposes deterministic worker ordering while preserving the stable public handoff contract
- SCN-05 candidate facts remain non-confirmed until explicit confirmation and cannot reach export-ready directly
- explicit confirmations can promote selected candidate facts into a confirmed export-ready slice
- targeted tests, full tests, typecheck, and build pass

# Next Stage Testing Plan

Status: completed.

This testing plan has been satisfied by the completed `SCN-04` + intake-tool + multi-worker orchestration + initial `SCN-05` candidate-fact/confirmation slice. The next post-MVP work needs a fresh testing plan for autonomous document-assisted extraction and later MCP / external integrations.

## Test Layers

### Completed coverage

Covered surfaces:

- `src/validators/validate-cloud-solution-model.test.ts` now covers gateway-required and overlapping-segment behavior for the cloud allocation slice
- `src/artifacts/ip-allocation-table/build-ip-allocation-table.test.ts` now covers deterministic SCN-04 row rendering
- `src/scenarios/scenario-acceptance.test.ts` now covers end-to-end `SCN-04` validation / artifact / export behavior
- `src/create-tools.test.ts` and `src/index.test.ts` now cover `capture_solution_requirements` and `draft_topology_model`
- `src/coordinator/dispatcher.test.ts` and `src/features/solution-review-agent-handoff.test.ts` now cover worker ordering and worker-message flow on the live review path
- `src/normalizers/prepare-draft-solution-input.test.ts`, `src/create-tools.test.ts`, `src/index.test.ts`, and `src/scenarios/scenario-acceptance.test.ts` now cover SCN-05 candidate-fact drafting and explicit confirmation/promote behavior

## Verification Commands

Run in this order:

1. `bun run typecheck`
2. targeted `bun test <files>` for touched validator, artifact, tool, workflow, and scenario files
3. `bun test`
4. `bun run build`

## Commit Slicing Guidance

Recommended atomic sequence:

1. scenario fixture + validation coverage
2. intake tool coverage
3. orchestration coverage
4. verification sweep

Each code commit should stay green.

# Next Stage Plan

Status: superseded by MVP-complete branch state.

This document defined the first physical planning stage that followed the IP trust-center path and the early `port-connection-table` slice. That stage remains complete, and later work on the branch also added scenario acceptance coverage, normalization, redundancy validation, and confirmed-only artifact gating needed for MVP completion.

## Scope

In scope:

- add explicit rack records and placement fields to the canonical slice input
- validate rack references, placement overlap, and rack-height boundaries
- add deterministic `device-cabling-table` artifact generation
- add deterministic `device-port-plan` artifact generation
- wire both physical artifacts into tool registration and runtime tests
- update progress tracking docs after the slice lands

Out of scope:

- normalization and structured input shaping
- `SCN-02` redundancy logic
- `SCN-03` multi-rack logic
- multimodal extraction
- review workflows
- background orchestration
- vendor-specific logic packs

## File Map

### Planning docs

- `docs/backlog.md`
- `docs/plans/next-stage.md`
- `docs/plans/next-stage-testing.md`

### Domain and validation

- `src/domain/schema/cloud-domain-schema.ts`
- `src/tools/solution-slice-tool-args.ts`
- `src/validators/validate-cloud-solution-model.ts`

### Artifacts and tools

- `src/artifacts/device-cabling-table/build-device-cabling-table.ts`
- `src/artifacts/device-port-plan/build-device-port-plan.ts`
- `src/artifacts/index.ts`
- `src/tools/generate-device-cabling-table/tools.ts`
- `src/tools/generate-device-port-plan/tools.ts`
- `src/tools/index.ts`
- `src/plugin/tool-registry.ts`

### Tests

- `src/domain/schema/cloud-domain-schema.test.ts`
- `src/validators/validate-cloud-solution-model.test.ts`
- `src/artifacts/device-cabling-table/build-device-cabling-table.test.ts`
- `src/artifacts/device-port-plan/build-device-port-plan.test.ts`
- `src/create-tools.test.ts`
- `src/index.test.ts`

## Execution Order

1. land physical schema and row contracts
2. land rack validation rules
3. land `device-cabling-table`
4. land `device-port-plan`
5. wire generation tools into the runtime
6. update progress docs
7. run full verification

## Progress

- [x] rack entities and placement fields added to the canonical slice input
- [x] deterministic rack validation added for missing racks, overlaps, and rack-height overflow
- [x] `device-cabling-table` artifact + tests landed
- [x] `device-port-plan` artifact + tests landed
- [x] runtime tool registration and invocation tests landed
- [x] progress docs updated to hand off the next queued work

## Acceptance for This Stage

- rack data is explicit in the canonical slice input
- physical placement issues use the shared validation contract
- `device-cabling-table` and `device-port-plan` rows are built from validated model data only
- both physical generation tools are registered and invokable end to end
- typecheck, tests, and build pass

# Next Stage Testing Plan

Status: superseded by later MVP-completion work on the current branch.

This stage was built in a TDD-first order for the first physical planning slice. Later work extended that test-first approach with scenario acceptance coverage and normalization tests for MVP completion.

## Test Layers

### 1. Domain contract tests

Target file:

- `src/domain/schema/cloud-domain-schema.test.ts`

Add coverage for:

- rack entity parsing
- slice input parsing with explicit rack placement fields
- `DeviceCablingTableRow` parsing
- `DevicePortPlanRow` parsing

### 2. Validator tests

Target file:

- `src/validators/validate-cloud-solution-model.test.ts`

Add coverage for:

- valid `SCN-01` physical happy path
- duplicate rack ids
- missing rack references for placed devices
- missing rack placement fields for physical artifacts
- overlapping rack positions
- device placement exceeding rack height

### 3. Artifact tests

Target files:

- `src/artifacts/device-cabling-table/build-device-cabling-table.test.ts`
- `src/artifacts/device-port-plan/build-device-port-plan.test.ts`

Add coverage for:

- ready markdown built from explicit rack-aware physical rows
- blocked markdown built from blocking issues
- unlinked ports rendered deterministically in the port plan output

### 4. Tool tests

Target files:

- `src/create-tools.test.ts`
- `src/index.test.ts`

Add coverage for:

- `generate_device_cabling_table` registration and execution
- `generate_device_port_plan` registration and execution
- runtime kernel invocation for both new physical tools

## Verification Commands

Run in this order:

1. `bun run typecheck`
2. targeted `bun test <files>` for touched schema, validation, and artifact files
3. `bun test`
4. `bun run build`

## Commit Slicing Guidance

Recommended atomic sequence:

1. physical schema contracts + tests
2. rack validation + tests
3. `device-cabling-table` + tests
4. `device-port-plan` + tests
5. tool wiring + runtime tests
6. docs/progress updates

Each code commit should stay green.

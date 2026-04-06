# cloud-solution Canonical Scenarios

These scenarios should become the first fixtures, tests, and acceptance references.

## SCN-01 - Single Rack Basic Connectivity

### Summary

A small single-rack deployment with a small set of devices and straightforward cabling.

### Inputs

- one rack
- a small set of access and compute devices
- explicit port and link expectations
- a small management subnet

### Expected Outputs

- complete cabling table
- complete port plan
- complete port connection table
- basic IP allocation table

### Expected Validation Behavior

- no duplicate ports
- no unresolved endpoints
- addresses stay inside management subnet

### Acceptance Checks

- all devices appear in at least one relevant artifact
- all planned links appear exactly once
- no blocking issues remain

## SCN-02 - Dual ToR Redundant Rack

### Summary

A rack with dual top-of-rack switches and redundancy requirements.

### Inputs

- one rack
- dual ToR devices
- compute/storage devices with dual links
- explicit redundancy intent

### Expected Outputs

- redundant cabling rows
- port planning reflecting dual-homing
- IP allocation for management and service networks

### Expected Validation Behavior

- missing second uplinks should be warnings or blockers depending on intent
- link groups should reflect redundancy relationships

### Acceptance Checks

- each dual-homed device has expected endpoint coverage
- redundancy group metadata is preserved

## SCN-03 - Small Multi-Rack Pod

### Summary

A pod spread across multiple racks with inter-rack links.

### Inputs

- multiple racks
- per-rack device placements
- inter-rack network links
- multiple segments or subnets

### Expected Outputs

- rack-aware cabling table
- rack-aware port connection table
- segment-aware IP allocation table

### Expected Validation Behavior

- rack references must be valid
- no overlapping placements
- inter-rack links must have valid endpoints on both sides

### Acceptance Checks

- every referenced rack exists
- every inter-rack link maps to real ports/devices

## SCN-04 - Simple Cloud Network Allocation

### Summary

A small cloud-oriented planning case focused on address segmentation rather than physical rack layout.

### Inputs

- cloud scope type
- service segments
- subnet allocations
- gateway and service attachment intent

### Expected Outputs

- IP allocation table
- design-gap / unresolved-question output when subnet boundaries are unclear
- unresolved questions if subnet boundaries are unclear

### Expected Validation Behavior

- CIDR validity
- non-overlapping allocation checks
- required gateway logic

### Acceptance Checks

- all allocations belong to a known segment
- no overlapping ranges unless policy says so

## SCN-05 - Document-Assisted Drafting

### Summary

The user provides a local PDF or image as supporting material, but confirmation is still required.

### Inputs

- one local PDF/image/diagram
- explicit textual requirements
- optional inventory list

### Expected Outputs

- candidate facts
- clarification questions
- draft artifacts only after confirmation or normalization

### Expected Validation Behavior

- extracted facts stay tagged as inferred until approved
- missing or conflicting evidence produces review items

### Acceptance Checks

- the system never upgrades extracted facts directly to confirmed truth
- unresolved extraction ambiguity appears in the review output

## Scenario Authoring Rules

Each future scenario should include:

1. input summary
2. explicit assumptions
3. expected blocking issues
4. expected warnings
5. expected artifacts
6. minimum acceptance checks

These scenarios should be treated as the source of truth for early tests and snapshot outputs.

## Scenario Traceability Notes

- `SCN-01` to `SCN-03` mainly drive later physical connectivity slices.
- `SCN-04` is the current cloud-oriented acceptance anchor for the IP allocation path.
- `SCN-05` remains out of scope for the current deterministic implementation stage.

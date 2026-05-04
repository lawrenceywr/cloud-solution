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

- one local PDF/image/diagram/spreadsheet
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

## SCN-06 - Multi-Document Evidence Reconciliation

### Summary

Multiple documents and sources provide conflicting or overlapping information about the same infrastructure entities, requiring evidence reconciliation, conflict reporting, and workflow blocking until a human resolves the contradictions outside the current MVP path.

### Inputs

- multiple document sources (PDF, CSV, XLSX, DWG, DOCX, TXT)
- contradictory device specifications from different sources
- overlapping network segment definitions
- duplicate IP allocations across sources
- conflicting physical placement information

### Expected Outputs

- comprehensive conflict report with severity classification
- blocking conflicts that prevent workflow progression
- warning conflicts that require acknowledgment but allow progression
- suggested resolutions for each detected conflict
- no automatic resolved topology model until a later explicit resolution flow exists

### Expected Validation Behavior

- all specified conflict types are detected and classified by severity
- blocking conflicts prevent artifact export until resolved
- warning conflicts are reported but don't block workflow
- conflict reports include entity references, source references, and suggested resolutions
- the current workflow stops at detect / report / block rather than applying stored resolution decisions

### Acceptance Checks

- conflict detection covers all defined conflict types (device attributes, port IDs, link endpoints, segment overlaps, IP duplicates)
- severity classification correctly identifies blocking vs warning conflicts
- conflict reports are properly formatted with all required information
- workflow properly blocks on blocking conflicts and allows progression on warnings
- the review path clearly surfaces that conflict resolution still requires an external human decision outside the current implemented workflow

## SCN-07 - Guarded Export Readiness

### Summary

A nearly complete planning slice still contains inferred facts or missing required export data, so the system must stop it from reaching export-ready output.

### Inputs

- an otherwise exportable slice
- at least one inferred or unresolved fact that still requires review
- an incomplete variant with required export data removed

### Expected Outputs

- export attempts are rejected before producing an export-ready bundle
- review workflow remains `review_required` for the low-confidence variant
- incomplete export attempts are blocked outright

### Expected Validation Behavior

- inferred or unresolved facts remain review-visible and cannot silently pass export gating
- missing required export data produces blocking issues
- guard hooks fail early instead of letting low-confidence export appear nearly final

### Acceptance Checks

- low-confidence export attempts never reach `export_ready`
- incomplete export attempts never reach `export_ready`
- a clean confirmed slice can still export successfully through the same runtime path

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
- `SCN-05` is implemented through document-assisted extraction, candidate-fact drafting, and explicit confirmation.
- `SCN-06` now covers multi-document evidence reconciliation and blocking conflict detection on the review path.
- `SCN-07` covers hook-driven export gating for low-confidence and incomplete inputs.

## SCN-08 - High-Reliability Rack Layout and Cabling Foundation

### Summary

A high-reliability data-center planning slice with paired ToR devices, explicit rack placement, and deterministic physical checks before broader template ingestion lands.

### Inputs

- at least two racks with adjacency metadata
- paired high-availability devices with explicit rack placement
- explicit business/storage/management or uplink-oriented ports and links
- rack power budget plus per-device power draw where available

### Expected Outputs

- device rack layout artifact
- enriched device cabling table with cable metadata and link typing

### Expected Validation Behavior

- rack power above the 80% threshold reserves an adjacent empty rack for power sharing when one exists, and that reserve rack must remain empty
- rack power above the 80% threshold blocks output when no adjacent empty rack can be reserved
- rack power metadata must be complete before high-reliability power validation can run
- high-availability device pairs must resolve to explicit primary/secondary roles
- HA device pairs must be in adjacent racks or adjacent columns
- typed business/storage/in-band/oob links must stay consistent with typed endpoint ports
- deterministic server dual-homing port conventions must hold: server index `1` is business, server index `2` is storage, and server-facing leaf indexes `1-20` are business while `21-40` are storage
- peer-link, inter-switch, and uplink link types must terminate on network-infrastructure devices only
- dual-homed-required peer devices must resolve to one complete HA pair before MLAG symmetry checks can pass
- MLAG-style redundant links must keep peer-facing port indexes symmetric

### Acceptance Checks

- rack layout rows include HA grouping and power metadata
- cabling output preserves cable metadata and typed link semantics
- server dual-homed artifact output surfaces one `bond mode4 / LACP` intent for validated multi-leg redundancy groups
- rack layout output explicitly identifies any adjacent empty rack reserved for power sharing
- invalid power, adjacency, or MLAG symmetry inputs are blocked deterministically
- checked-in workbook templates can be converted into deterministic draft `structuredInput` through the existing markdown-preprocessing path
- unsupported workbook kinds stay advisory with explicit warnings instead of guessed structured facts

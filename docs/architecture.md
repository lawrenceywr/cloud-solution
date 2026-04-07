# cloud-solution Architecture

## 1. Objective

`cloud-solution` should help users move from design inputs to validated planning artifacts for cloud and data-center projects.

Typical inputs include:

- textual requirements
- device inventories
- topology descriptions
- rack placement information
- local PDFs, images, and diagrams used as supporting evidence

Typical outputs include:

- device cabling tables
- device port planning tables
- device port connection tables
- IP allocation tables
- design assumptions and unresolved questions

## 2. Core Architecture Principle

The system must be model-driven.

Only normalized and validated domain data may drive final artifact generation.

That is the trust boundary.

## 3. Architecture Diagram

```text
User Inputs
  requirements / inventory / topology / rack diagrams / notes
        |
        v
[1] Input Intake
        |
        v
[2] Extraction Layer
  - text parsing
  - multimodal document/diagram reading
  - candidate fact extraction only
        |
        v
[3] Normalization Layer
  - naming normalization
  - entity linking
  - ambiguity detection
  - canonical object creation
        |
        v
[4] Canonical Domain Model
  - requirements
  - devices
  - racks
  - ports
  - links
  - segments
  - IP allocations
        |
        v
[5] Validation and Rule Engine
  - completeness checks
  - topology consistency
  - port/link compatibility
  - subnet/IP checks
  - redundancy checks
        |
        v
[6] Planning Coordinator
  - orchestrates generation flow
  - manages review tasks
        |
        v
[7] Artifact Generators
  - cabling table
  - port plan
  - port connection table
  - IP allocation table
  - design notes
        |
        v
[8] Review / Approval / Export
  - assumptions
  - unresolved items
  - confidence
  - markdown / JSON / CSV-friendly output
```

## 4. OMO-Inspired Plugin Shape

This project should reuse the OMO-style boot flow:

```text
loadPluginConfig()
  -> createManagers()
  -> createTools()
  -> createHooks()
  -> createPluginInterface()
```

That pattern is still a good fit here because the plugin needs:

- typed tools
- guard hooks
- background workflow orchestration
- optional agent/skill integration
- optional MCP integration later

## 5. Layer Responsibilities

### 5.1 Input Intake

Responsible for receiving user-provided information in explicit form.

Preferred MVP inputs:

- structured form-like input
- JSON/YAML
- CSV inventories
- explicit text requirements

Supported but lower-trust inputs:

- local PDFs
- images
- diagrams

### 5.2 Extraction Layer

Responsible for deriving candidate facts from raw sources.

Important rule: extracted facts are not final facts.

Every extracted fact should carry:

- source reference
- confidence level
- extraction notes

### 5.3 Normalization Layer

Responsible for turning candidate inputs into canonical entities.

Typical tasks:

- normalize naming conventions
- collapse aliases
- match ports to devices
- match devices to rack locations
- detect conflicts and missing references

### 5.4 Canonical Domain Model

This is the system of record.

All later planning and rendering must consume this model rather than raw source text.

### 5.5 Validation and Rule Engine

This is the second trust pillar.

The engine should classify issues by severity:

- blocking
- warning
- informational

Examples:

- duplicate device IDs
- impossible port references
- broken link endpoints
- invalid subnet masks
- overlapping IP ranges
- unclear redundancy intent

### 5.6 Planning Coordinator

This layer should remain thin in the MVP.

Its job is to:

- run normalization and validation in order
- stop generation on blocking issues
- request clarification when needed
- invoke generators only after model validation passes

### 5.7 Artifact Generators

Generators must be pure and deterministic.

They should not invent missing facts. If required data is missing, they should emit a gap or fail cleanly.

### 5.8 Review and Export

Every artifact bundle should include:

- generated table(s)
- assumptions
- unresolved items
- source/provenance notes
- confidence or confirmation state

## 6. Planned Module Inventory

```text
src/
├── index.ts
├── plugin-config.ts
├── create-managers.ts
├── create-tools.ts
├── create-hooks.ts
├── plugin-interface.ts
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

Suggested responsibilities:

- `config/` — plugin settings and policy schemas
- `domain/` — core entities and row schemas
- `normalizers/` — source-to-model translation
- `validators/` — deterministic rule logic
- `tools/` — user-facing workflow entrypoints
- `hooks/` — safety and lifecycle guards
- `features/` — background jobs and review workflows
- `renderers/` — markdown and machine-friendly output
- `agents/` — optional planning/review assistants
- `mcp/` — optional external systems later

### 6.1 Current Core Tool Modules and Near-Term Additions

The user-facing tools remain narrow and model-driven. Current and near-term tool modules include:

- `capture-solution-requirements`
- `draft-topology-model`
- `validate-solution-model`
- `generate-cabling-table`
- `generate-port-plan`
- `generate-port-connection-table`
- `generate-ip-allocation-table`
- `summarize-design-gaps`

These tools should return validated structures first, and user-friendly tables second.

### 6.2 Suggested First Hook Modules

- `missing-required-input-guard`
- `low-confidence-export-guard`
- `artifact-generation-precheck`
- `assumption-review-reminder`

These hooks should prevent the system from treating draft inference as final truth.

### 6.3 Current Feature Modules and Near-Term Additions

- `solution-review-workflow`
- `artifact-bundle-builder`
- `clarification-loop`
- `background-plan-expander`

These are workflow helpers, not substitutes for validation logic.

### 6.4 Suggested First Renderer Modules

- `markdown-table-renderer`
- `json-artifact-renderer`
- `csv-export-renderer`
- `assumption-report-renderer`

Renderers must remain pure and consume row schemas only.

### 6.5 Later Agent/Skill Modules

The clarification/review path and the document-assisted extraction helper are already landed. Additional agent/skill modules should still wait until the core model is stable:

- artifact explanation assistant
- evidence-reconciliation worker

## 7. MVP Boundary

### In Scope

- structured requirements intake
- device/inventory normalization
- validated model creation
- 4 core artifact types
- assumptions and gap reporting
- human confirmation before low-confidence export

### Out of Scope for MVP

- arbitrary diagram to final truth
- vendor-specific implementation config generation
- wide external system integrations
- automatic high-confidence topology inference from weak evidence

## 8. Architectural Risks

1. Ambiguity laundering: weakly extracted guesses silently become facts.
2. Renderer backfilling: output code invents missing rows or addresses.
3. Under-modeled reality: the schema is too weak to represent real constraints.
4. Scope creep: plugin orchestration grows before the trust boundary is stable.

## 9. Recommended Build Order

1. scenarios
2. domain model
3. validation rules
4. artifact row builders
5. renderers
6. tools and hooks
7. background workflows and optional agent helpers

That order keeps correctness ahead of convenience.

# cloud-solution Domain Model

## 1. Modeling Goal

The domain model is the authoritative representation used to generate all solution artifacts.

Every generated table should be derived from the same validated intermediate model.

## 2. Confidence States

Every important fact should eventually be classified as one of:

- `confirmed` — explicitly provided or approved by the user
- `inferred` — derived from rules or supporting evidence, but not yet confirmed
- `unresolved` — conflicting, incomplete, or ambiguous

Only confirmed or explicitly accepted inferred facts should drive final output.

## 3. Core Entities

## 3.1 SolutionRequirement

Represents the solution request and project context.

Suggested fields:

- `id`
- `projectName`
- `scopeType` (`cloud`, `data-center`, `hybrid`)
- `sites[]`
- `redundancyGoals[]`
- `artifactRequests[]`
- `constraints[]`
- `sourceRefs[]`
- `statusConfidence`

## 3.2 Device

Represents a network, compute, storage, security, or supporting device.

Suggested fields:

- `id`
- `name`
- `role`
- `vendor`
- `model`
- `quantity`
- `rackId?`
- `rackPosition?`
- `portTemplateId?`
- `attributes`
- `sourceRefs[]`
- `statusConfidence`

## 3.3 Rack

Represents a rack or cabinet and its placement metadata.

Suggested fields:

- `id`
- `name`
- `siteId`
- `room?`
- `row?`
- `uHeight?`
- `placements[]`
- `sourceRefs[]`
- `statusConfidence`

## 3.4 Port

Represents a logical or physical device port.

Suggested fields:

- `id`
- `deviceId`
- `name`
- `portType`
- `speed`
- `mediaType`
- `breakoutMode?`
- `purpose?`
- `status`
- `sourceRefs[]`
- `statusConfidence`

## 3.5 Link

Represents a planned or existing connection between endpoints.

Suggested fields:

- `id`
- `endpointA`
- `endpointB`
- `linkType`
- `mediaType`
- `expectedSpeed`
- `redundancyGroup?`
- `patchPanelPath?`
- `sourceRefs[]`
- `statusConfidence`

## 3.6 NetworkSegment

Represents a segment of the network design.

Suggested fields:

- `id`
- `name`
- `segmentType` (`vlan`, `subnet`, `vrf`, `mgmt`, `storage`, `service`)
- `cidr?`
- `gateway?`
- `purpose`
- `environment?`
- `sourceRefs[]`
- `statusConfidence`

## 3.7 IpAllocation

Represents an assigned or reserved address.

Suggested fields:

- `id`
- `segmentId`
- `allocationType`
- `deviceId?`
- `interfaceId?`
- `hostname?`
- `ipAddress`
- `gateway?`
- `dnsNotes?`
- `sourceRefs[]`
- `statusConfidence`

## 3.8 ValidationIssue

Represents a validation outcome.

Suggested fields:

- `id`
- `severity`
- `code`
- `message`
- `entityRefs[]`
- `suggestedAction?`
- `blocking`

## 3.9 Artifact Row Types

Each output type should use its own row schema.

Required row families:

- `CablingTableRow`
- `RackLayoutRow`
- `PortPlanRow`
- `PortConnectionRow`
- `IpAllocationRow`

Renderers should consume row objects, not raw domain entities.

## 4. Relationship Rules

- A `Port` belongs to exactly one `Device`.
- A `Link` references valid endpoints.
- A `Rack` placement must reference valid devices and non-overlapping positions.
- An `IpAllocation` belongs to a valid `NetworkSegment`.
- Artifact rows must reference validated source entities.
- Deterministic dual-homed server links may surface one server-side `bond mode4 / LACP` intent when multiple validated legs share the same redundancy group.

## 5. Validation Principles

The validator should check at least:

### Identity and Uniqueness

- unique IDs
- unique device names within scope where required
- no duplicate port IDs within a device

### Referential Integrity

- every port references an existing device
- every link endpoint exists
- every IP allocation references an existing segment

### Physical/Logical Consistency

- rack positions do not overlap
- links do not connect impossible endpoint types
- media and speed combinations are allowed
- breakout assumptions are explicit
- when a server port exposes deterministic `portIndex` data, index `1` maps to the business plane and index `2` maps to the storage plane
- when a server dual-homed business or storage link lands on a server-facing leaf port, leaf indexes `1-20` map to business and `21-40` map to storage
- rack power above the 80% threshold must either reserve an adjacent empty rack that remains unoccupied for power sharing or produce a blocking threshold issue

### Addressing Consistency

- CIDR format is valid
- gateway is inside subnet where required
- allocated addresses are unique in segment
- no overlapping segment ranges unless policy allows it

### Planning Consistency

- artifact request set matches available model completeness
- redundancy intent is either defined or explicitly unresolved
- assumptions are collected, not hidden

## 6. Artifact Contract

All five primary outputs must be generated from the same validated model:

1. device cabling table
2. device rack layout
3. device port planning table
4. device port connection table
5. IP allocation table

If the model is not complete enough for one of them, the system should emit a gap report rather than guess.

Physical artifacts may surface deterministic operational conventions derived from validated facts, such as server `bond mode4 / LACP` intent and adjacent empty rack power reserves, but they must not invent missing ports, links, racks, or allocations.

## 7. Suggested Status Flow

```text
raw input
  -> candidate fact
  -> normalized entity
  -> validated entity
  -> artifact row
  -> reviewed output
```

## 8. MVP Non-Goals

- No arbitrary image or PDF is treated as definitive topology truth.
- No vendor-specific configuration rendering in the first iteration.
- No silent inference of missing ports, links, or address allocations.
- No external IPAM/DCIM dependency in the initial milestone.

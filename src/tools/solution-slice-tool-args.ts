import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

const artifactTypeSchema = tool.schema.enum([
  "device-cabling-table",
  "device-port-plan",
  "device-port-connection-table",
  "ip-allocation-table",
])

const confidenceStateSchema = tool.schema.enum([
  "confirmed",
  "inferred",
  "unresolved",
])

const sourceReferenceSchema = tool.schema.object({
  kind: tool.schema.enum(["user-input", "inventory", "diagram", "document", "image", "system"]),
  ref: tool.schema.string(),
  note: tool.schema.string().optional(),
})

const requirementSchema = tool.schema.object({
  id: tool.schema.string(),
  projectName: tool.schema.string(),
  scopeType: tool.schema.enum(["cloud", "data-center", "hybrid"]),
  artifactRequests: tool.schema.array(artifactTypeSchema).default([]),
  sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
  statusConfidence: confidenceStateSchema.default("confirmed"),
})

const deviceSchema = tool.schema.object({
  id: tool.schema.string(),
  name: tool.schema.string(),
  role: tool.schema.string(),
  vendor: tool.schema.string().optional(),
  model: tool.schema.string().optional(),
  redundancyIntent: tool.schema.enum([
    "single-homed",
    "dual-homed-preferred",
    "dual-homed-required",
  ]).optional(),
  rackId: tool.schema.string().optional(),
  rackPosition: tool.schema.number().int().positive().optional(),
  rackUnitHeight: tool.schema.number().int().positive().optional(),
  sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
  statusConfidence: confidenceStateSchema.default("confirmed"),
})

const rackSchema = tool.schema.object({
  id: tool.schema.string(),
  name: tool.schema.string(),
  siteId: tool.schema.string().optional(),
  room: tool.schema.string().optional(),
  row: tool.schema.string().optional(),
  uHeight: tool.schema.number().int().positive().optional(),
  sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
  statusConfidence: confidenceStateSchema.default("confirmed"),
})

const portSchema = tool.schema.object({
  id: tool.schema.string(),
  deviceId: tool.schema.string(),
  name: tool.schema.string(),
  purpose: tool.schema.string().optional(),
  sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
  statusConfidence: confidenceStateSchema.default("confirmed"),
})

const linkEndpointSchema = tool.schema.object({
  portId: tool.schema.string(),
})

const linkSchema = tool.schema.object({
  id: tool.schema.string(),
  endpointA: linkEndpointSchema,
  endpointB: linkEndpointSchema,
  purpose: tool.schema.string().optional(),
  redundancyGroup: tool.schema.string().optional(),
  sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
  statusConfidence: confidenceStateSchema.default("confirmed"),
})

const segmentSchema = tool.schema.object({
  id: tool.schema.string(),
  name: tool.schema.string(),
  segmentType: tool.schema.enum([
    "vlan",
    "subnet",
    "vrf",
    "mgmt",
    "storage",
    "service",
  ]),
  cidr: tool.schema.string().optional(),
  gateway: tool.schema.string().optional(),
  purpose: tool.schema.string(),
  sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
  statusConfidence: confidenceStateSchema.default("confirmed"),
})

const allocationSchema = tool.schema.object({
  id: tool.schema.string(),
  segmentId: tool.schema.string(),
  allocationType: tool.schema.enum(["gateway", "device", "service", "reserved"]),
  ipAddress: tool.schema.string(),
  deviceId: tool.schema.string().optional(),
  hostname: tool.schema.string().optional(),
  interfaceName: tool.schema.string().optional(),
  purpose: tool.schema.string().optional(),
  sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
  statusConfidence: confidenceStateSchema.default("confirmed"),
})

const structuredPortSchema = tool.schema.object({
  id: tool.schema.string().optional(),
  name: tool.schema.string(),
  purpose: tool.schema.string().optional(),
  sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
  statusConfidence: confidenceStateSchema.default("confirmed"),
})

const structuredDeviceSchema = tool.schema.object({
  id: tool.schema.string().optional(),
  name: tool.schema.string(),
  role: tool.schema.string(),
  vendor: tool.schema.string().optional(),
  model: tool.schema.string().optional(),
  redundancyIntent: tool.schema.enum([
    "single-homed",
    "dual-homed-preferred",
    "dual-homed-required",
  ]).optional(),
  rackName: tool.schema.string().optional(),
  rackPosition: tool.schema.number().int().positive().optional(),
  rackUnitHeight: tool.schema.number().int().positive().optional(),
  ports: tool.schema.array(structuredPortSchema).default([]),
  sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
  statusConfidence: confidenceStateSchema.default("confirmed"),
})

const structuredRackSchema = tool.schema.object({
  id: tool.schema.string().optional(),
  name: tool.schema.string(),
  siteId: tool.schema.string().optional(),
  room: tool.schema.string().optional(),
  row: tool.schema.string().optional(),
  uHeight: tool.schema.number().int().positive().optional(),
  sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
  statusConfidence: confidenceStateSchema.default("confirmed"),
})

const structuredLinkEndpointSchema = tool.schema.object({
  deviceName: tool.schema.string(),
  portName: tool.schema.string(),
})

const structuredLinkSchema = tool.schema.object({
  id: tool.schema.string().optional(),
  endpointA: structuredLinkEndpointSchema,
  endpointB: structuredLinkEndpointSchema,
  purpose: tool.schema.string().optional(),
  redundancyGroup: tool.schema.string().optional(),
  sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
  statusConfidence: confidenceStateSchema.default("confirmed"),
})

const structuredSegmentSchema = tool.schema.object({
  id: tool.schema.string().optional(),
  name: tool.schema.string(),
  segmentType: tool.schema.enum(["vlan", "subnet", "vrf", "mgmt", "storage", "service"]),
  cidr: tool.schema.string().optional(),
  gateway: tool.schema.string().optional(),
  purpose: tool.schema.string(),
  sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
  statusConfidence: confidenceStateSchema.default("confirmed"),
})

const structuredAllocationSchema = tool.schema.object({
  id: tool.schema.string().optional(),
  segmentName: tool.schema.string(),
  allocationType: tool.schema.enum(["gateway", "device", "service", "reserved"]),
  ipAddress: tool.schema.string(),
  deviceName: tool.schema.string().optional(),
  hostname: tool.schema.string().optional(),
  interfaceName: tool.schema.string().optional(),
  purpose: tool.schema.string().optional(),
  sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
  statusConfidence: confidenceStateSchema.default("confirmed"),
})

const structuredInputSchema = tool.schema.object({
  racks: tool.schema.array(structuredRackSchema).default([]),
  devices: tool.schema.array(structuredDeviceSchema).default([]),
  links: tool.schema.array(structuredLinkSchema).default([]),
  segments: tool.schema.array(structuredSegmentSchema).default([]),
  allocations: tool.schema.array(structuredAllocationSchema).default([]),
})

export function createSolutionSliceToolArgs(): ToolDefinition["args"] {
  return {
    requirement: requirementSchema.describe(
      "Validated solution requirement for the current planning slice.",
    ),
    devices: tool.schema
      .array(deviceSchema)
      .default([])
      .describe("Optional device inventory included in the current slice."),
    racks: tool.schema
      .array(rackSchema)
      .default([])
      .describe("Explicit rack records used by physical planning slices."),
    ports: tool.schema
      .array(portSchema)
      .default([])
      .describe("Explicit port records used by connectivity slices."),
    links: tool.schema
      .array(linkSchema)
      .default([])
      .describe("Explicit logical connections between ports."),
    segments: tool.schema
      .array(segmentSchema)
      .default([])
      .describe("Network segments used by validation and artifact generation."),
    allocations: tool.schema
      .array(allocationSchema)
      .default([])
      .describe("Explicit IP allocation records for the current planning slice."),
    structuredInput: structuredInputSchema
      .optional()
      .describe("Optional structured input that will be normalized into the canonical planning slice before validation."),
  }
}

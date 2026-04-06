import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

function createArtifactTypeSchema() {
  return tool.schema.enum([
    "device-cabling-table",
    "device-port-plan",
    "device-port-connection-table",
    "ip-allocation-table",
  ])
}

function createConfidenceStateSchema(defaultValue: "confirmed" | "inferred" | "unresolved") {
  return tool.schema.enum(["confirmed", "inferred", "unresolved"]).default(defaultValue)
}

function createDraftConfidenceStateSchema(defaultValue: "inferred" | "unresolved") {
  return tool.schema.enum(["inferred", "unresolved"]).default(defaultValue)
}

function createSourceReferenceSchema() {
  return tool.schema.object({
    kind: tool.schema.enum(["user-input", "inventory", "diagram", "document", "system"]),
    ref: tool.schema.string(),
    note: tool.schema.string().optional(),
  })
}

function createRequirementSchema() {
  const artifactTypeSchema = createArtifactTypeSchema()
  const confidenceStateSchema = createConfidenceStateSchema("confirmed")
  const sourceReferenceSchema = createSourceReferenceSchema()

  return tool.schema.object({
    id: tool.schema.string(),
    projectName: tool.schema.string(),
    scopeType: tool.schema.enum(["cloud", "data-center", "hybrid"]),
    artifactRequests: tool.schema.array(artifactTypeSchema).default([]),
    sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
    statusConfidence: confidenceStateSchema,
  })
}

function createDraftStructuredInputSchema() {
  const sourceReferenceSchema = createSourceReferenceSchema()
  const inferredConfidenceSchema = createDraftConfidenceStateSchema("inferred")

  const structuredPortSchema = tool.schema.object({
    id: tool.schema.string().optional(),
    name: tool.schema.string(),
    purpose: tool.schema.string().optional(),
    sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
    statusConfidence: inferredConfidenceSchema,
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
    statusConfidence: inferredConfidenceSchema,
  })

  const structuredRackSchema = tool.schema.object({
    id: tool.schema.string().optional(),
    name: tool.schema.string(),
    siteId: tool.schema.string().optional(),
    room: tool.schema.string().optional(),
    row: tool.schema.string().optional(),
    uHeight: tool.schema.number().int().positive().optional(),
    sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
    statusConfidence: inferredConfidenceSchema,
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
    statusConfidence: inferredConfidenceSchema,
  })

  const structuredSegmentSchema = tool.schema.object({
    id: tool.schema.string().optional(),
    name: tool.schema.string(),
    segmentType: tool.schema.enum(["vlan", "subnet", "vrf", "mgmt", "storage", "service"]),
    cidr: tool.schema.string().optional(),
    gateway: tool.schema.string().optional(),
    purpose: tool.schema.string(),
    sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
    statusConfidence: inferredConfidenceSchema,
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
    statusConfidence: inferredConfidenceSchema,
  })

  return tool.schema.object({
    racks: tool.schema.array(structuredRackSchema).default([]),
    devices: tool.schema.array(structuredDeviceSchema).default([]),
    links: tool.schema.array(structuredLinkSchema).default([]),
    segments: tool.schema.array(structuredSegmentSchema).default([]),
    allocations: tool.schema.array(structuredAllocationSchema).default([]),
  })
}

export function createCaptureSolutionRequirementsArgs(): ToolDefinition["args"] {
  const artifactTypeSchema = createArtifactTypeSchema()
  const confidenceStateSchema = createConfidenceStateSchema("confirmed")
  const sourceReferenceSchema = createSourceReferenceSchema()

  return {
    requirementId: tool.schema
      .string()
      .optional()
      .describe("Optional explicit requirement id. If omitted, one is derived from projectName."),
    projectName: tool.schema.string().describe("Project name for the captured requirement."),
    scopeType: tool.schema
      .enum(["cloud", "data-center", "hybrid"])
      .describe("Planning scope for the captured requirement."),
    artifactRequests: tool.schema
      .array(artifactTypeSchema)
      .default([])
      .describe("Requested artifacts for the captured requirement."),
    requirementNotes: tool.schema
      .string()
      .optional()
      .describe("Optional freeform requirement notes preserved as a user-input source reference."),
    sourceRefs: tool.schema
      .array(sourceReferenceSchema)
      .default([])
      .describe("Optional explicit source references for the captured requirement."),
    statusConfidence: confidenceStateSchema.describe(
      "Confidence state for the captured requirement. Defaults to confirmed for explicit front-door intake.",
    ),
  }
}

export function createDraftTopologyModelArgs(): ToolDefinition["args"] {
  return {
    requirement: createRequirementSchema().describe(
      "Captured or supplied requirement that the draft topology belongs to.",
    ),
    structuredInput: createDraftStructuredInputSchema().describe(
      "Candidate-fact structured input that will be normalized into a canonical draft topology model.",
    ),
  }
}

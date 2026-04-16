import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

function createArtifactTypeSchema() {
  return tool.schema.enum([
    "device-cabling-table",
    "device-rack-layout",
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
    kind: tool.schema.enum(["user-input", "inventory", "diagram", "document", "image", "system"]),
    ref: tool.schema.string(),
    note: tool.schema.string().optional(),
  })
}

function createDocumentSourceSchema() {
  return tool.schema.object({
    kind: tool.schema.enum(["document", "diagram", "image"]),
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
  const portTypeSchema = tool.schema.enum([
    "data",
    "business",
    "storage",
    "inband-mgmt",
    "oob-mgmt",
    "peer-link",
    "uplink",
  ])
  const linkTypeSchema = tool.schema.enum([
    "business",
    "storage",
    "inband-mgmt",
    "oob-mgmt",
    "peer-link",
    "uplink",
    "inter-switch",
  ])
  const highAvailabilityRoleSchema = tool.schema.enum(["primary", "secondary"])

  const structuredPortSchema = tool.schema.object({
    id: tool.schema.string().optional(),
    name: tool.schema.string(),
    purpose: tool.schema.string().optional(),
    portType: portTypeSchema.optional(),
    portIndex: tool.schema.number().int().min(0).optional(),
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
    highAvailabilityGroup: tool.schema.string().optional(),
    highAvailabilityRole: highAvailabilityRoleSchema.optional(),
    powerWatts: tool.schema.number().positive().optional(),
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
    maxPowerKw: tool.schema.number().positive().optional(),
    adjacentRackIds: tool.schema.array(tool.schema.string()).default([]),
    adjacentColumnRackIds: tool.schema.array(tool.schema.string()).default([]),
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
    linkType: linkTypeSchema.optional(),
    redundancyGroup: tool.schema.string().optional(),
    cableId: tool.schema.string().optional(),
    cableName: tool.schema.string().optional(),
    cableSpec: tool.schema.string().optional(),
    cableCount: tool.schema.number().int().positive().optional(),
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

function createDocumentAssistSchema() {
  const documentSourceSchema = createDocumentSourceSchema()
  const draftStructuredInputSchema = createDraftStructuredInputSchema()

  return tool.schema.object({
    documentSources: tool.schema
      .array(documentSourceSchema)
      .min(1)
      .describe("Document, image, or diagram sources that support the candidate facts."),
    candidateFacts: draftStructuredInputSchema.describe(
      "Document-derived candidate facts that remain inferred or unresolved until explicitly confirmed.",
    ),
  })
}

function createConfirmationSchema() {
  return tool.schema.object({
    entityRefs: tool.schema
      .array(tool.schema.string())
      .default([])
      .describe("Canonical entity refs to promote to confirmed after draft normalization."),
  })
}

export function createCaptureSolutionRequirementsArgs(): ToolDefinition["args"] {
  const artifactTypeSchema = createArtifactTypeSchema()
  const confidenceStateSchema = createConfidenceStateSchema("confirmed")
  const sourceReferenceSchema = createSourceReferenceSchema()
  const documentSourceSchema = createDocumentSourceSchema()

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
    documentSources: tool.schema
      .array(documentSourceSchema)
      .default([])
      .describe("Optional document/image/diagram sources that will seed the next draft step."),
    statusConfidence: confidenceStateSchema.describe(
      "Confidence state for the captured requirement. Defaults to confirmed for explicit front-door intake.",
    ),
  }
}

export function createDraftTopologyModelArgs(): ToolDefinition["args"] {
  const draftStructuredInputSchema = createDraftStructuredInputSchema()
  const documentAssistSchema = createDocumentAssistSchema()
  const confirmationSchema = createConfirmationSchema()

  return {
    requirement: createRequirementSchema().describe(
      "Captured or supplied requirement that the draft topology belongs to.",
    ),
    structuredInput: draftStructuredInputSchema
      .optional()
      .describe("Draft structured input that will be normalized into a canonical topology model."),
    documentAssist: documentAssistSchema
      .optional()
      .describe("Optional document-assisted candidate-fact input for SCN-05 draft preparation."),
    confirmation: confirmationSchema
      .optional()
      .describe("Optional explicit confirmation step that promotes selected candidate facts to confirmed."),
  }
}

export function createExtractDocumentCandidateFactsArgs(): ToolDefinition["args"] {
  const documentAssistSchema = createDocumentAssistSchema()

  return {
    requirement: createRequirementSchema().describe(
      "Captured or supplied requirement that the extracted candidate facts belong to.",
    ),
    documentAssist: documentAssistSchema.describe(
      "Document/image/diagram sources plus an empty candidate-fact scaffold to populate via extraction.",
    ),
  }
}

export function createExtractStructuredInputFromTemplatesArgs(): ToolDefinition["args"] {
  const documentSourceSchema = createDocumentSourceSchema()

  return {
    requirement: createRequirementSchema().describe(
      "Captured or supplied requirement that the template-derived structured input belongs to.",
    ),
    documentSources: tool.schema
      .array(documentSourceSchema)
      .min(1)
      .describe("Workbook template sources that will be converted into deterministic structured input."),
  }
}

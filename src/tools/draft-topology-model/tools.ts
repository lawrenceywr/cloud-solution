import { z } from "zod"
import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import { SolutionRequirementSchema, SourceReferenceSchema } from "../../domain"
import { normalizeSolutionToolInput } from "../../normalizers"
import { hasBlockingIssues, validateCloudSolutionModel } from "../../validators"
import { createDraftTopologyModelArgs } from "../intake-tool-args"

const DraftConfidenceStateSchema = z.enum(["inferred", "unresolved"]).default("inferred")

const DraftStructuredPortSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  purpose: z.string().optional(),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  statusConfidence: DraftConfidenceStateSchema,
})

const DraftStructuredDeviceSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  role: z.string(),
  vendor: z.string().optional(),
  model: z.string().optional(),
  redundancyIntent: z.enum([
    "single-homed",
    "dual-homed-preferred",
    "dual-homed-required",
  ]).optional(),
  rackName: z.string().optional(),
  rackPosition: z.number().int().positive().optional(),
  rackUnitHeight: z.number().int().positive().optional(),
  ports: z.array(DraftStructuredPortSchema).default([]),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  statusConfidence: DraftConfidenceStateSchema,
})

const DraftStructuredRackSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  siteId: z.string().optional(),
  room: z.string().optional(),
  row: z.string().optional(),
  uHeight: z.number().int().positive().optional(),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  statusConfidence: DraftConfidenceStateSchema,
})

const DraftStructuredLinkEndpointSchema = z.object({
  deviceName: z.string(),
  portName: z.string(),
})

const DraftStructuredLinkSchema = z.object({
  id: z.string().optional(),
  endpointA: DraftStructuredLinkEndpointSchema,
  endpointB: DraftStructuredLinkEndpointSchema,
  purpose: z.string().optional(),
  redundancyGroup: z.string().optional(),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  statusConfidence: DraftConfidenceStateSchema,
})

const DraftStructuredSegmentSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  segmentType: z.enum(["vlan", "subnet", "vrf", "mgmt", "storage", "service"]),
  cidr: z.string().optional(),
  gateway: z.string().optional(),
  purpose: z.string(),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  statusConfidence: DraftConfidenceStateSchema,
})

const DraftStructuredAllocationSchema = z.object({
  id: z.string().optional(),
  segmentName: z.string(),
  allocationType: z.enum(["gateway", "device", "service", "reserved"]),
  ipAddress: z.string(),
  deviceName: z.string().optional(),
  hostname: z.string().optional(),
  interfaceName: z.string().optional(),
  purpose: z.string().optional(),
  sourceRefs: z.array(SourceReferenceSchema).default([]),
  statusConfidence: DraftConfidenceStateSchema,
})

const DraftTopologyModelInputSchema = z.object({
  requirement: SolutionRequirementSchema,
  structuredInput: z.object({
    racks: z.array(DraftStructuredRackSchema).default([]),
    devices: z.array(DraftStructuredDeviceSchema).default([]),
    links: z.array(DraftStructuredLinkSchema).default([]),
    segments: z.array(DraftStructuredSegmentSchema).default([]),
    allocations: z.array(DraftStructuredAllocationSchema).default([]),
  }),
})

export function createDraftTopologyModelTools(): Record<string, ToolDefinition> {
  const draft_topology_model: ToolDefinition = tool({
    description:
      "Normalize candidate-fact structured input into a canonical draft topology model and return validation results.",
    args: createDraftTopologyModelArgs(),
    execute: async (inputArgs) => {
      const parsedInput = DraftTopologyModelInputSchema.parse(inputArgs)
      const normalizedInput = normalizeSolutionToolInput(parsedInput)
      const issues = validateCloudSolutionModel(normalizedInput)

      return JSON.stringify(
        {
          normalizedInput,
          validationSummary: {
            valid: !hasBlockingIssues(issues),
            blockingIssueCount: issues.filter((issue) => issue.severity === "blocking").length,
            warningCount: issues.filter((issue) => issue.severity === "warning").length,
            informationalIssueCount: issues.filter((issue) => issue.severity === "informational").length,
            issues,
          },
        },
        null,
        2,
      )
    },
  })

  return { draft_topology_model }
}

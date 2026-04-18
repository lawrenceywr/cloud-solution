import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import type { CloudSolutionConfig } from "../../config"
import type { WorkerRuntimeContext } from "../../coordinator/types"
import { runSolutionReviewAgentHandoff } from "../../features"
import type { RuntimeContext } from "../../plugin/types"
import { createInternalWorkerRuntimeContext } from "../internal-worker-runtime"
import { createSolutionSliceToolArgs } from "../solution-slice-tool-args"

function createDraftSourceReferenceSchema() {
  return tool.schema.object({
    kind: tool.schema.enum(["user-input", "inventory", "diagram", "document", "image", "system"]),
    ref: tool.schema.string(),
    note: tool.schema.string().optional(),
  })
}

function createDraftStructuredInputSchema() {
  const sourceReferenceSchema = createDraftSourceReferenceSchema()
  const draftConfidenceSchema = tool.schema.enum(["inferred", "unresolved"]).default("inferred")

  const structuredPortSchema = tool.schema.object({
    id: tool.schema.string().optional(),
    name: tool.schema.string(),
    purpose: tool.schema.string().optional(),
    sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
    statusConfidence: draftConfidenceSchema,
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
    statusConfidence: draftConfidenceSchema,
  })

  const structuredRackSchema = tool.schema.object({
    id: tool.schema.string().optional(),
    name: tool.schema.string(),
    siteId: tool.schema.string().optional(),
    room: tool.schema.string().optional(),
    row: tool.schema.string().optional(),
    uHeight: tool.schema.number().int().positive().optional(),
    sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
    statusConfidence: draftConfidenceSchema,
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
    statusConfidence: draftConfidenceSchema,
  })

  const structuredSegmentSchema = tool.schema.object({
    id: tool.schema.string().optional(),
    name: tool.schema.string(),
    segmentType: tool.schema.enum(["vlan", "subnet", "vrf", "mgmt", "storage", "service"]),
    cidr: tool.schema.string().optional(),
    gateway: tool.schema.string().optional(),
    purpose: tool.schema.string(),
    sourceRefs: tool.schema.array(sourceReferenceSchema).default([]),
    statusConfidence: draftConfidenceSchema,
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
    statusConfidence: draftConfidenceSchema,
  })

  return tool.schema.object({
    racks: tool.schema.array(structuredRackSchema).default([]),
    devices: tool.schema.array(structuredDeviceSchema).default([]),
    links: tool.schema.array(structuredLinkSchema).default([]),
    segments: tool.schema.array(structuredSegmentSchema).default([]),
    allocations: tool.schema.array(structuredAllocationSchema).default([]),
  })
}

function createReviewWorkflowToolArgs(): ToolDefinition["args"] {
  const draftStructuredInputSchema = createDraftStructuredInputSchema()

  return {
    ...createSolutionSliceToolArgs(),
    structuredInput: draftStructuredInputSchema
      .optional()
      .describe("Optional draft structured input that remains inferred or unresolved until confirmed."),
    documentAssist: tool.schema.object({
      documentSources: tool.schema.array(
        tool.schema.object({
          kind: tool.schema.enum(["document", "diagram", "image"]),
          ref: tool.schema.string(),
          note: tool.schema.string().optional(),
        }),
      ).min(1),
      candidateFacts: draftStructuredInputSchema,
    }).optional().describe("Optional document-assisted candidate-fact input for SCN-05 review flow."),
    confirmation: tool.schema.object({
      entityRefs: tool.schema.array(tool.schema.string()).default([]),
    }).optional().describe("Optional explicit entity confirmations applied before review/export gating."),
  }
}

export function createStartSolutionReviewWorkflowTools(args: {
  pluginConfig: CloudSolutionConfig
  context?: RuntimeContext
}): Record<string, ToolDefinition> {
  const { pluginConfig, context } = args

  const start_solution_review_workflow: ToolDefinition = tool({
    description:
      "Start the main orchestrator workflow that runs internal clarification and review child agents for one solution slice.",
    args: createReviewWorkflowToolArgs(),
    execute: async (inputArgs, toolContext) => {
      if (!context?.client) {
        throw new Error(
          "start_solution_review_workflow requires a plugin runtime client to spawn the internal clarification and review agents",
        )
      }

      const runtime: WorkerRuntimeContext = createInternalWorkerRuntimeContext({
        context,
        toolContext,
      })

      const handoff = await runSolutionReviewAgentHandoff({
        input: inputArgs,
        pluginConfig,
        runtime,
      })

      // Add designGapSummary as an alias for reviewSummary for test compatibility
      const handoffWithAlias = {
        ...handoff,
        designGapSummary: handoff.reviewSummary,
        exportReady: handoff.orchestrationState === "export_ready",
      }

      return JSON.stringify(handoffWithAlias, null, 2)
    },
  })

  return { start_solution_review_workflow }
}

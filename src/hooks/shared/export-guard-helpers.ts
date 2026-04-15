import type { CloudSolutionConfig } from "../../config"
import type {
  ArtifactType,
  CloudSolutionSliceInput,
  DesignGapSummary,
} from "../../domain"
import { evaluateSolutionReviewWorkflow } from "../../features/solution-review-workflow"
import { normalizeSolutionToolInput } from "../../normalizers"
import type { ToolExecuteBeforeOutput } from "../../plugin/types"
import { validateCloudSolutionModel } from "../../validators"

const ArtifactGenerationToolTypes: Partial<Record<string, ArtifactType>> = {
  generate_device_cabling_table: "device-cabling-table",
  generate_device_port_plan: "device-port-plan",
  generate_port_connection_table: "device-port-connection-table",
  generate_ip_allocation_table: "ip-allocation-table",
}

const SliceInputToolNames = new Set([
  "draft_topology_model",
  "validate_solution_model",
  "generate_device_cabling_table",
  "generate_device_port_plan",
  "generate_port_connection_table",
  "generate_ip_allocation_table",
  "summarize_design_gaps",
  "export_artifact_bundle",
  "start_solution_review_workflow",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasArrayEntries(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function hasStructuredInputEntries(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  return ["racks", "devices", "links", "segments", "allocations"]
    .some((key) => hasArrayEntries(value[key]))
}

function hasDocumentAssistEntries(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  return hasArrayEntries(value.documentSources)
    || hasStructuredInputEntries(value.candidateFacts)
}

function ensureArtifactRequest(
  sliceInput: CloudSolutionSliceInput,
  artifactType: ArtifactType,
): CloudSolutionSliceInput {
  if (sliceInput.requirement.artifactRequests.includes(artifactType)) {
    return sliceInput
  }

  return {
    ...sliceInput,
    requirement: {
      ...sliceInput.requirement,
      artifactRequests: [...sliceInput.requirement.artifactRequests, artifactType],
    },
  }
}

export function isSliceInputTool(toolName: string): boolean {
  return SliceInputToolNames.has(toolName)
}

export function isArtifactGenerationTool(toolName: string): boolean {
  return toolName in ArtifactGenerationToolTypes
}

export function isExportArtifactBundleTool(toolName: string): boolean {
  return toolName === "export_artifact_bundle"
}

export function hasMinimumPlanningInput(args: Record<string, unknown>): boolean {
  return ["devices", "racks", "ports", "links", "segments", "allocations"]
    .some((key) => hasArrayEntries(args[key]))
    || hasStructuredInputEntries(args.structuredInput)
    || hasDocumentAssistEntries(args.documentAssist)
}

export function parseGuardArgs(output: ToolExecuteBeforeOutput): Record<string, unknown> {
  if (!isRecord(output.args)) {
    throw new Error("Tool execution requires an argument object")
  }

  return output.args
}

export function buildGuardValidationSlice(args: {
  toolName: string
  input: Record<string, unknown>
}): CloudSolutionSliceInput {
  const sliceInput = normalizeSolutionToolInput(args.input)
  const requestedArtifactType = ArtifactGenerationToolTypes[args.toolName]

  return requestedArtifactType
    ? ensureArtifactRequest(sliceInput, requestedArtifactType)
    : sliceInput
}

export function evaluateExportGuardState(args: {
  input: Record<string, unknown>
  pluginConfig: CloudSolutionConfig
}) {
  return evaluateSolutionReviewWorkflow({
    input: args.input,
    mode: "export",
    pluginConfig: args.pluginConfig,
  })
}

export function collectBlockingIssueCodes(sliceInput: CloudSolutionSliceInput): string[] {
  return validateCloudSolutionModel(sliceInput)
    .filter((issue) => issue.severity === "blocking")
    .map((issue) => issue.code)
}

export function hasLowConfidenceReviewItems(reviewSummary: DesignGapSummary): boolean {
  return reviewSummary.assumptionCount > 0
    || reviewSummary.unresolvedItems.some((item) => item.confidenceState === "unresolved")
}

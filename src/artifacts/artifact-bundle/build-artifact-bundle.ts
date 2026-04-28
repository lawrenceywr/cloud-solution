import type {
  ArtifactBundleExport,
  ArtifactType,
  CloudSolutionSliceInput,
  GeneratedArtifact,
  PendingConfirmationItem,
  ValidationIssue,
  ValidationIssueSubjectType,
  ValidationSummary,
} from "../../domain"
import {
  ArtifactBundleExportSchema,
  ValidationSummarySchema,
} from "../../domain"
import {
  buildDeviceCablingTableArtifact,
  buildDesignGapReport,
  buildDeviceRackLayoutArtifact,
  buildDevicePortPlanArtifact,
  buildIpAllocationTableArtifact,
  buildPortConnectionTableArtifact,
} from "../../artifacts"
import { renderArtifactBundleIndex } from "../../renderers"
import { hasBlockingIssues } from "../../validators"

const artifactOrder: ArtifactType[] = [
  "device-cabling-table",
  "device-rack-layout",
  "device-port-plan",
  "device-port-connection-table",
  "ip-allocation-table",
]

function getRelevantSubjectTypes(
  requestedArtifactTypes: ArtifactType[],
): ValidationIssueSubjectType[] {
  const relevantSubjectTypes = new Set<ValidationIssueSubjectType>(["requirement"])

  if (requestedArtifactTypes.includes("ip-allocation-table")) {
    relevantSubjectTypes.add("device")
    relevantSubjectTypes.add("segment")
    relevantSubjectTypes.add("allocation")
  }

  if (
    requestedArtifactTypes.includes("device-cabling-table")
    || requestedArtifactTypes.includes("device-rack-layout")
    || requestedArtifactTypes.includes("device-port-plan")
    || requestedArtifactTypes.includes("device-port-connection-table")
  ) {
    relevantSubjectTypes.add("device")
    relevantSubjectTypes.add("rack")
    relevantSubjectTypes.add("port")
    relevantSubjectTypes.add("link")
  }

  return [...relevantSubjectTypes]
}

function buildValidationSummary(issues: ValidationIssue[]): ValidationSummary {
  return ValidationSummarySchema.parse({
    valid: !hasBlockingIssues(issues),
    blockingIssueCount: issues.filter((issue) => issue.severity === "blocking").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    informationalIssueCount: issues.filter((issue) => issue.severity === "informational").length,
    issues,
  })
}

function buildRequestedArtifacts(args: {
  requestedArtifactTypes: ArtifactType[]
  input: CloudSolutionSliceInput
  issues: ValidationIssue[]
}): GeneratedArtifact[] {
  const { requestedArtifactTypes, input, issues } = args

  return requestedArtifactTypes.map((artifactType) => {
    switch (artifactType) {
      case "device-cabling-table":
        return buildDeviceCablingTableArtifact({ input, issues })
      case "device-rack-layout":
        return buildDeviceRackLayoutArtifact({ input, issues })
      case "device-port-plan":
        return buildDevicePortPlanArtifact({ input, issues })
      case "device-port-connection-table":
        return buildPortConnectionTableArtifact({ input, issues })
      case "ip-allocation-table":
        return buildIpAllocationTableArtifact({ input, issues })
    }
  })
}

export function buildArtifactBundleExport(args: {
  input: CloudSolutionSliceInput
  issues: ValidationIssue[]
  pendingConfirmationItems?: PendingConfirmationItem[]
}): ArtifactBundleExport {
  const {
    input,
    issues,
    pendingConfirmationItems = [],
  } = args
  const validationSummary = buildValidationSummary(issues)
  const requestedArtifactTypes = artifactOrder.filter((artifactType) =>
    input.requirement.artifactRequests.includes(artifactType),
  )
  const reviewSummary = buildDesignGapReport({
    input,
    issues,
    relevantSubjectTypes: getRelevantSubjectTypes(requestedArtifactTypes),
    pendingConfirmationItems,
  })
  const requestedArtifacts = buildRequestedArtifacts({
    requestedArtifactTypes,
    input,
    issues,
  })
  const exportReady = validationSummary.valid && !reviewSummary.reviewRequired
  const includedArtifactNames = [
    "artifact-bundle-index.md",
    reviewSummary.artifact.name,
    ...requestedArtifacts.map((artifact) => artifact.name),
  ]
  const bundleIndex = renderArtifactBundleIndex({
    projectName: input.requirement.projectName,
    exportReady,
    reviewRequired: reviewSummary.reviewRequired,
    requestedArtifactTypes,
    includedArtifactNames,
    validationSummary,
    reviewSummary,
  })
  const artifacts = [bundleIndex, reviewSummary.artifact, ...requestedArtifacts]

  return ArtifactBundleExportSchema.parse({
    exportReady,
    reviewRequired: reviewSummary.reviewRequired,
    requestedArtifactTypes,
    includedArtifactNames,
    validationSummary,
    reviewSummary,
    bundleIndex,
    artifacts,
  })
}

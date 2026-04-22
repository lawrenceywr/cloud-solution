import type { CloudSolutionConfig } from "../config"
import type {
  ArtifactBundleExport,
  ArtifactType,
  CloudSolutionSliceInput,
  Conflict,
  DesignGapSummary,
  PendingConfirmationItem,
  ValidationIssue,
  ValidationIssueSubjectType,
  ValidationSummary,
} from "../domain"
import { PendingConfirmationItemSchema, ValidationSummarySchema } from "../domain"
import { buildArtifactBundleExport, buildDesignGapReport } from "../artifacts"
import { normalizeSolutionToolInput, resolvePendingConfirmationItems } from "../normalizers"
import { hasBlockingIssues, validateCloudSolutionModel } from "../validators"

export type SolutionReviewWorkflowState =
  | "blocked"
  | "review_required"
  | "export_ready"

export type SolutionReviewWorkflowMode = "review" | "export"

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

export type SolutionReviewWorkflowResult = {
  workflowState: SolutionReviewWorkflowState
  sliceInput: CloudSolutionSliceInput
  issues: ValidationIssue[]
  validationSummary: ValidationSummary
  reviewSummary: DesignGapSummary
  bundle?: ArtifactBundleExport
}

export type EvaluatedSolutionReviewWorkflow = Omit<SolutionReviewWorkflowResult, "bundle">

function extractPendingConfirmationItems(input: unknown): PendingConfirmationItem[] {
  if (typeof input !== "object" || input === null) {
    return []
  }

  const record = input as {
    pendingConfirmationItems?: unknown
    confirmationSummary?: { pendingConfirmationItems?: unknown }
  }
  const items = [
    ...(Array.isArray(record.pendingConfirmationItems) ? record.pendingConfirmationItems : []),
    ...(record.confirmationSummary && Array.isArray(record.confirmationSummary.pendingConfirmationItems)
      ? record.confirmationSummary.pendingConfirmationItems
      : []),
  ]

  const parsedItems = items.map((item) => PendingConfirmationItemSchema.parse(item))
  const deduped = new Map(parsedItems.map((item) => [item.id, item]))
  return [...deduped.values()]
}

function ensureBundleArtifactRequests(args: {
  sliceInput: CloudSolutionSliceInput
  defaultArtifactTypes: ArtifactType[]
}): CloudSolutionSliceInput {
  const { sliceInput, defaultArtifactTypes } = args
  if (sliceInput.requirement.artifactRequests.length > 0) {
    return sliceInput
  }

  return {
    ...sliceInput,
    requirement: {
      ...sliceInput.requirement,
      artifactRequests: [...defaultArtifactTypes],
    },
  }
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

export function runSolutionReviewWorkflow(args: {
  input: unknown
  mode: SolutionReviewWorkflowMode
  pluginConfig?: CloudSolutionConfig
  includeBundleWhenNotExportReady?: boolean
  conflicts?: Conflict[]
}): SolutionReviewWorkflowResult {
  const evaluation = evaluateSolutionReviewWorkflow(args)
  const {
    mode,
    includeBundleWhenNotExportReady = false,
  } = args
  const pendingConfirmationItems = resolvePendingConfirmationItems({
    items: extractPendingConfirmationItems(args.input),
    input: evaluation.sliceInput,
  })

  const bundle =
    mode === "export"
    && (evaluation.workflowState === "export_ready" || includeBundleWhenNotExportReady)
      ? buildArtifactBundleExport({
          input: evaluation.sliceInput,
          issues: evaluation.issues,
          pendingConfirmationItems,
        })
      : undefined

  return {
    ...evaluation,
    bundle,
  }
}

export function deriveSolutionReviewWorkflowState(args: {
  validationSummary: ValidationSummary
  reviewSummary: DesignGapSummary
}): SolutionReviewWorkflowState {
  return args.validationSummary.valid && !args.reviewSummary.hasBlockingConflicts
    ? args.reviewSummary.reviewRequired
      ? "review_required"
      : "export_ready"
    : "blocked"
}

export function evaluateSolutionReviewWorkflow(args: {
  input: unknown
  mode: SolutionReviewWorkflowMode
  pluginConfig?: CloudSolutionConfig
  conflicts?: Conflict[]
}): EvaluatedSolutionReviewWorkflow {
  const {
    input,
    mode,
    pluginConfig,
    conflicts = [],
  } = args
  const normalizedInput = normalizeSolutionToolInput(input)
  const sliceInput = mode === "export"
    ? ensureBundleArtifactRequests({
        sliceInput: normalizedInput,
        defaultArtifactTypes: pluginConfig?.default_artifacts ?? [],
      })
    : normalizedInput
  const pendingConfirmationItems = resolvePendingConfirmationItems({
    items: extractPendingConfirmationItems(input),
    input: sliceInput,
  })
  const issues = validateCloudSolutionModel(sliceInput)
  const validationSummary = buildValidationSummary(issues)

  if (mode === "export") {
    const requestedArtifactTypes = sliceInput.requirement.artifactRequests
    const reviewSummary = buildDesignGapReport({
      input: sliceInput,
      issues,
      relevantSubjectTypes: getRelevantSubjectTypes(requestedArtifactTypes),
      conflicts,
      pendingConfirmationItems,
    })
    const workflowState = deriveSolutionReviewWorkflowState({
      validationSummary,
      reviewSummary,
    })

    return {
      workflowState,
      sliceInput,
      issues,
      validationSummary,
      reviewSummary,
    }
  }

  const reviewSummary = buildDesignGapReport({
    input: sliceInput,
    issues,
    conflicts,
    pendingConfirmationItems,
  })

  return {
    workflowState: deriveSolutionReviewWorkflowState({
      validationSummary,
      reviewSummary,
    }),
    sliceInput,
    issues,
    validationSummary,
    reviewSummary,
  }
}

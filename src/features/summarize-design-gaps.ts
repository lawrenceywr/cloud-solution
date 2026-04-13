import type { Conflict } from "../domain"
import type { WorkerRuntimeContext } from "../coordinator/types"
import { runSolutionReviewWorkflow } from "./solution-review-workflow"
import { executeEvidenceReconciliationWorker } from "../workers/evidence-reconciliation"
import { reconcileExtractedFacts, validateCloudSolutionModel } from "../validators"
import { normalizeSolutionToolInput } from "../normalizers"

export async function runSummarizeDesignGaps(args: {
  input: unknown
  runtime?: WorkerRuntimeContext
}) {
  const normalizedInput = normalizeSolutionToolInput(args.input)
  const validationIssues = validateCloudSolutionModel(normalizedInput)

  let conflicts: Conflict[] = []
  const deterministicConflicts = reconcileExtractedFacts({
    devices: normalizedInput.devices,
    ports: normalizedInput.ports,
    links: normalizedInput.links,
    segments: normalizedInput.segments,
    allocations: normalizedInput.allocations,
    racks: normalizedInput.racks,
  })
  conflicts = [...deterministicConflicts]

  if (args.runtime) {
    try {
      const workerInput = {
        ...normalizedInput,
        validationIssues,
        context: {},
        workerMessages: {},
      }
      const workerResult = await executeEvidenceReconciliationWorker(workerInput, args.runtime)

      if (workerResult.status === "success" || workerResult.status === "partial") {
        const workerConflicts = (workerResult.output.conflicts as Conflict[]) ?? []
        const existingConflictIds = new Set(conflicts.map(conflict => conflict.id))
        for (const conflict of workerConflicts) {
          if (!existingConflictIds.has(conflict.id)) {
            conflicts.push(conflict)
          }
        }
      }
    } catch {
      // Keep deterministic conflicts only when child-session reconciliation fails.
    }
  }

  const workflow = runSolutionReviewWorkflow({
    input: args.input,
    mode: "review",
    conflicts,
  })

  const blockingConflicts = conflicts.filter(conflict => conflict.severity === "blocking")
  const warningConflicts = conflicts.filter(conflict => conflict.severity === "warning")

  return {
    workflowState: workflow.workflowState,
    validationSummary: workflow.validationSummary,
    reviewSummary: {
      reviewRequired: workflow.reviewSummary.reviewRequired,
      blockingGapCount: workflow.reviewSummary.blockingGapCount,
      assumptionCount: workflow.reviewSummary.assumptionCount,
      unresolvedItemCount: workflow.reviewSummary.unresolvedItemCount,
      blockingConflictCount: workflow.reviewSummary.blockingConflictCount,
      warningConflictCount: workflow.reviewSummary.warningConflictCount,
      hasBlockingConflicts: workflow.reviewSummary.hasBlockingConflicts,
    },
    conflicts,
    assumptions: workflow.reviewSummary.assumptions,
    gaps: workflow.reviewSummary.gaps,
    unresolvedItems: workflow.reviewSummary.unresolvedItems,
    artifact: workflow.reviewSummary.artifact,
    conflictArtifact: workflow.reviewSummary.conflictArtifact,
    hasBlockingConflicts: blockingConflicts.length > 0,
    blockingConflictCount: blockingConflicts.length,
    warningConflictCount: warningConflicts.length,
  }
}

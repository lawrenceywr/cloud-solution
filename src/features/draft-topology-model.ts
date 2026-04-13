import type { Conflict } from "../domain"
import type { WorkerRuntimeContext } from "../coordinator/types"
import { assessClarificationQuestions } from "../workers/requirements-clarification/question-templates"
import { prepareDraftSolutionInput } from "../normalizers"
import { hasBlockingIssues, reconcileExtractedFacts, validateCloudSolutionModel } from "../validators"
import { executeEvidenceReconciliationWorker } from "../workers/evidence-reconciliation"
import { buildDesignGapReport } from "../artifacts/design-gap-report/build-design-gap-report"

export async function runDraftTopologyModel(args: {
  input: unknown
  allowDocumentAssist: boolean
  runtime?: WorkerRuntimeContext
}) {
  const preparedInput = prepareDraftSolutionInput({
    input: args.input,
    allowDocumentAssist: args.allowDocumentAssist,
  })
  const normalizedInput = preparedInput.normalizedInput
  const issues = validateCloudSolutionModel(normalizedInput)
  const clarificationSummary = assessClarificationQuestions(normalizedInput)

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
        validationIssues: issues,
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

  const blockingConflictCount = conflicts.filter(conflict => conflict.severity === "blocking").length
  const warningConflictCount = conflicts.filter(conflict => conflict.severity === "warning").length

  const designGapSummary = buildDesignGapReport({
    input: normalizedInput,
    issues,
    conflicts,
  })

  return {
    inputState: preparedInput.inputState,
    candidateFacts: preparedInput.candidateFacts,
    confirmationSummary: preparedInput.confirmationSummary,
    normalizedInput,
    clarificationSummary,
    validationSummary: {
      valid: !hasBlockingIssues(issues) && blockingConflictCount === 0,
      blockingIssueCount: issues.filter((issue) => issue.severity === "blocking").length,
      warningCount: issues.filter((issue) => issue.severity === "warning").length,
      informationalIssueCount: issues.filter((issue) => issue.severity === "informational").length,
      issues,
    },
    conflictSummary: {
      hasConflicts: conflicts.length > 0,
      hasBlockingConflicts: blockingConflictCount > 0,
      blockingConflictCount,
      warningConflictCount,
      totalConflictCount: conflicts.length,
      conflicts,
    },
    designGapSummary,
  }
}

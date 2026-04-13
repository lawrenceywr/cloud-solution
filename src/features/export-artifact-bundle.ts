import type { CloudSolutionConfig } from "../config"
import type { Conflict } from "../domain"
import type { WorkerRuntimeContext } from "../coordinator/types"
import { executeEvidenceReconciliationWorker } from "../workers/evidence-reconciliation"
import { validateCloudSolutionModel } from "../validators"
import { normalizeSolutionToolInput } from "../normalizers"
import { runSolutionReviewWorkflow } from "./solution-review-workflow"

export async function runExportArtifactBundle(args: {
  input: unknown
  pluginConfig: CloudSolutionConfig
  runtime?: WorkerRuntimeContext
}) {
  const normalizedInput = normalizeSolutionToolInput(args.input)
  const validationIssues = validateCloudSolutionModel(normalizedInput)

  let conflicts: Conflict[] = []

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
        const existingConflictIds = new Set(conflicts.map((conflict) => conflict.id))
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
    mode: "export",
    pluginConfig: args.pluginConfig,
    conflicts,
  })

  return {
    workflowState: workflow.workflowState,
    ...workflow.bundle,
  }
}

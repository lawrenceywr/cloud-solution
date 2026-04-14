import type { CloudSolutionConfig } from "../../config"
import type {
  ToolExecuteBeforeHandler,
  ToolExecuteBeforeInput,
  ToolExecuteBeforeOutput,
} from "../../plugin/types"
import {
  evaluateExportGuardState,
  hasLowConfidenceReviewItems,
  isExportArtifactBundleTool,
  parseGuardArgs,
} from "../shared/export-guard-helpers"

export type AssumptionReviewReminder = {
  "tool.execute.before": ToolExecuteBeforeHandler
}

export function createAssumptionReviewReminderHook(
  pluginConfig: CloudSolutionConfig,
): AssumptionReviewReminder {
  return {
    "tool.execute.before": async (
      input: ToolExecuteBeforeInput,
      output: ToolExecuteBeforeOutput,
    ): Promise<void> => {
      if (!isExportArtifactBundleTool(input.tool)) {
        return
      }

      const evaluation = evaluateExportGuardState({
        input: parseGuardArgs(output),
        pluginConfig,
      })

      if (
        evaluation.workflowState === "review_required"
        && !hasLowConfidenceReviewItems(evaluation.reviewSummary)
      ) {
        throw new Error(
          `Artifact bundle export still requires review before export (${evaluation.reviewSummary.assumptionCount} assumptions, ${evaluation.reviewSummary.unresolvedItemCount} unresolved items, ${evaluation.reviewSummary.warningConflictCount} warning conflicts).`,
        )
      }
    },
  }
}

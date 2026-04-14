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

export type LowConfidenceExportGuard = {
  "tool.execute.before": ToolExecuteBeforeHandler
}

export function createLowConfidenceExportGuardHook(
  pluginConfig: CloudSolutionConfig,
): LowConfidenceExportGuard {
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
        && hasLowConfidenceReviewItems(evaluation.reviewSummary)
      ) {
        throw new Error(
          "Artifact bundle export requires confirmation for inferred or unresolved facts before export.",
        )
      }
    },
  }
}

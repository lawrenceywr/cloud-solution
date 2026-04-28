import type { CloudSolutionConfig } from "../../config"
import type {
  ToolExecuteBeforeHandler,
  ToolExecuteBeforeInput,
  ToolExecuteBeforeOutput,
} from "../../plugin/types"
import {
  buildPendingConfirmationBlockMessage,
  buildGuardValidationSlice,
  collectRelevantPendingConfirmationItems,
  collectBlockingIssueCodes,
  evaluateExportGuardState,
  isArtifactGenerationTool,
  isExportArtifactBundleTool,
  parseGuardArgs,
} from "../shared/export-guard-helpers"

export type ArtifactGenerationPrecheck = {
  "tool.execute.before": ToolExecuteBeforeHandler
}

export function createArtifactGenerationPrecheckHook(
  pluginConfig: CloudSolutionConfig,
): ArtifactGenerationPrecheck {
  return {
    "tool.execute.before": async (
      input: ToolExecuteBeforeInput,
      output: ToolExecuteBeforeOutput,
    ): Promise<void> => {
      const args = parseGuardArgs(output)

      if (isExportArtifactBundleTool(input.tool)) {
        const evaluation = evaluateExportGuardState({
          input: args,
          pluginConfig,
        })

        if (evaluation.workflowState === "blocked") {
          const blockingIssueCodes = evaluation.issues
            .filter((issue) => issue.severity === "blocking")
            .map((issue) => issue.code)

          throw new Error(
            `Artifact bundle export is blocked by validation issues${blockingIssueCodes.length > 0 ? `: ${blockingIssueCodes.join(", ")}` : ""}`,
          )
        }

        return
      }

      if (!isArtifactGenerationTool(input.tool)) {
        return
      }

      const sliceInput = buildGuardValidationSlice({
        toolName: input.tool,
        input: args,
      })
      const blockingIssueCodes = collectBlockingIssueCodes(sliceInput)
      if (blockingIssueCodes.length > 0) {
        throw new Error(
          `Artifact generation is blocked by validation issues: ${blockingIssueCodes.join(", ")}`,
        )
      }

      const pendingConfirmationItems = collectRelevantPendingConfirmationItems({
        toolName: input.tool,
        input: args,
      })
      if (pendingConfirmationItems.length > 0) {
        throw new Error(buildPendingConfirmationBlockMessage(pendingConfirmationItems))
      }
    },
  }
}

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import type { CloudSolutionConfig } from "../../config"
import { runSolutionReviewWorkflow } from "../../features"
import { createSolutionSliceToolArgs } from "../solution-slice-tool-args"

export function createExportArtifactBundleTools(args: {
  pluginConfig: CloudSolutionConfig
}): Record<string, ToolDefinition> {
  const { pluginConfig } = args

  const export_artifact_bundle: ToolDefinition = tool({
    description:
      "Validate a cloud-solution model and export a deterministic bundle index, review report, and requested markdown artifacts.",
    args: createSolutionSliceToolArgs(),
    execute: async (inputArgs) => {
      const workflow = runSolutionReviewWorkflow({
        input: inputArgs,
        mode: "export",
        pluginConfig,
      })

      return JSON.stringify(
        {
          workflowState: workflow.workflowState,
          ...workflow.bundle,
        },
        null,
        2,
      )
    },
  })

  return { export_artifact_bundle }
}

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import { runSolutionReviewWorkflow } from "../../features"
import { createSolutionSliceToolArgs } from "../solution-slice-tool-args"

export function createSummarizeDesignGapsTools(): Record<string, ToolDefinition> {
  const summarize_design_gaps: ToolDefinition = tool({
    description:
      "Validate a cloud-solution model and return a deterministic assumptions, gaps, and unresolved-items summary for review.",
    args: createSolutionSliceToolArgs(),
    execute: async (inputArgs) => {
      const workflow = runSolutionReviewWorkflow({
        input: inputArgs,
        mode: "review",
      })

      return JSON.stringify(
        {
          workflowState: workflow.workflowState,
          ...workflow.reviewSummary,
        },
        null,
        2,
      )
    },
  })

  return { summarize_design_gaps }
}

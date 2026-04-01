import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import { buildDesignGapReport } from "../../artifacts"
import { normalizeSolutionToolInput } from "../../normalizers"
import { createSolutionSliceToolArgs } from "../solution-slice-tool-args"
import { validateCloudSolutionModel } from "../../validators"

export function createSummarizeDesignGapsTools(): Record<string, ToolDefinition> {
  const summarize_design_gaps: ToolDefinition = tool({
    description:
      "Validate a cloud-solution model and return a deterministic assumptions, gaps, and unresolved-items summary for review.",
    args: createSolutionSliceToolArgs(),
    execute: async (inputArgs) => {
      const sliceInput = normalizeSolutionToolInput(inputArgs)
      const issues = validateCloudSolutionModel(sliceInput)
      const reviewSummary = buildDesignGapReport({
        input: sliceInput,
        issues,
      })

      return JSON.stringify(reviewSummary, null, 2)
    },
  })

  return { summarize_design_gaps }
}

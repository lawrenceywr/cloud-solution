import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import { normalizeSolutionToolInput } from "../../normalizers"
import { hasBlockingIssues, validateCloudSolutionModel } from "../../validators"
import { createSolutionSliceToolArgs } from "../solution-slice-tool-args"

export function createValidateSolutionModelTools(): Record<string, ToolDefinition> {
  const validate_solution_model: ToolDefinition = tool({
    description:
      "Validate a minimal cloud-solution model and return structured validation results without generating artifacts.",
    args: createSolutionSliceToolArgs(),
    execute: async (inputArgs) => {
      const sliceInput = normalizeSolutionToolInput(inputArgs)
      const issues = validateCloudSolutionModel(sliceInput)

      return JSON.stringify(
        {
          valid: !hasBlockingIssues(issues),
          blockingIssueCount: issues.filter((issue) => issue.severity === "blocking").length,
          warningCount: issues.filter((issue) => issue.severity === "warning").length,
          informationalIssueCount: issues.filter((issue) => issue.severity === "informational").length,
          issues,
        },
        null,
        2,
      )
    },
  })

  return { validate_solution_model }
}

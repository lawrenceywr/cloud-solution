import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import type { CloudSolutionConfig } from "../../config"
import { assessClarificationQuestions } from "../../workers/requirements-clarification/question-templates"
import { prepareDraftSolutionInput } from "../../normalizers"
import { hasBlockingIssues, validateCloudSolutionModel } from "../../validators"
import { createDraftTopologyModelArgs } from "../intake-tool-args"

export function createDraftTopologyModelTools(args: {
  pluginConfig: CloudSolutionConfig
}): Record<string, ToolDefinition> {
  const draft_topology_model: ToolDefinition = tool({
    description:
      "Normalize candidate-fact structured input into a canonical draft topology model and return validation results.",
    args: createDraftTopologyModelArgs(),
    execute: async (inputArgs) => {
      const preparedInput = prepareDraftSolutionInput({
        input: inputArgs,
        allowDocumentAssist: args.pluginConfig.allow_document_assist,
      })
      const normalizedInput = preparedInput.normalizedInput
      const issues = validateCloudSolutionModel(normalizedInput)
      const clarificationSummary = assessClarificationQuestions(normalizedInput)

      return JSON.stringify(
        {
          inputState: preparedInput.inputState,
          candidateFacts: preparedInput.candidateFacts,
          confirmationSummary: preparedInput.confirmationSummary,
          normalizedInput,
          clarificationSummary,
          validationSummary: {
            valid: !hasBlockingIssues(issues),
            blockingIssueCount: issues.filter((issue) => issue.severity === "blocking").length,
            warningCount: issues.filter((issue) => issue.severity === "warning").length,
            informationalIssueCount: issues.filter((issue) => issue.severity === "informational").length,
            issues,
          },
        },
        null,
        2,
      )
    },
  })

  return { draft_topology_model }
}

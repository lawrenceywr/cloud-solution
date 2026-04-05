import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import type { CloudSolutionConfig } from "../../config"
import type { WorkerRuntimeContext } from "../../coordinator/types"
import { runSolutionReviewAgentHandoff } from "../../features"
import type { RuntimeContext } from "../../plugin/types"
import { createSolutionSliceToolArgs } from "../solution-slice-tool-args"

export function createStartSolutionReviewWorkflowTools(args: {
  pluginConfig: CloudSolutionConfig
  context?: RuntimeContext
}): Record<string, ToolDefinition> {
  const { pluginConfig, context } = args

  const start_solution_review_workflow: ToolDefinition = tool({
    description:
      "Start the main orchestrator workflow that runs internal clarification and review child agents for one solution slice.",
    args: createSolutionSliceToolArgs(),
    execute: async (inputArgs, toolContext) => {
      if (!context?.client) {
        throw new Error(
          "start_solution_review_workflow requires a plugin runtime client to spawn the internal clarification and review agents",
        )
      }

      const runtime: WorkerRuntimeContext = {
        client: context.client,
        parentSessionID: toolContext.sessionID,
        agent: toolContext.agent,
        directory: context.directory,
        worktree: context.worktree ?? context.directory,
        abort: toolContext.abort,
      }

      const handoff = await runSolutionReviewAgentHandoff({
        input: inputArgs,
        pluginConfig,
        runtime,
      })

      return JSON.stringify(handoff, null, 2)
    },
  })

  return { start_solution_review_workflow }
}

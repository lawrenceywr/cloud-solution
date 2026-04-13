import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import type { RuntimeContext } from "../../plugin/types"
import type { WorkerRuntimeContext } from "../../coordinator/types"
import { runSummarizeDesignGaps } from "../../features"
import { createSolutionSliceToolArgs } from "../solution-slice-tool-args"

export function createSummarizeDesignGapsTools(args?: {
  context?: RuntimeContext
}): Record<string, ToolDefinition> {
  const context = args?.context

  const summarize_design_gaps: ToolDefinition = tool({
    description:
      "Validate a cloud-solution model and return a deterministic assumptions, gaps, conflicts, and unresolved-items summary for review.",
    args: createSolutionSliceToolArgs(),
    execute: async (inputArgs, toolContext) => {
      const execContext: WorkerRuntimeContext | undefined = context?.client
        ? {
            client: context.client,
            parentSessionID: toolContext.sessionID,
            agent: toolContext.agent,
            directory: context.directory,
            worktree: context.worktree ?? context.directory,
            abort: toolContext.abort,
          }
        : undefined

      const result = await runSummarizeDesignGaps({
        input: inputArgs,
        runtime: execContext,
      })

      return JSON.stringify(result, null, 2)
    },
  })

  return { summarize_design_gaps }
}

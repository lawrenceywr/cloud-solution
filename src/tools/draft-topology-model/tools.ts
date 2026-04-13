import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import type { RuntimeContext } from "../../plugin/types"
import type { WorkerRuntimeContext } from "../../coordinator/types"
import type { CloudSolutionConfig } from "../../config"
import { runDraftTopologyModel } from "../../features"
import { createDraftTopologyModelArgs } from "../intake-tool-args"

export function createDraftTopologyModelTools(args: {
  pluginConfig: CloudSolutionConfig
  context?: RuntimeContext
}): Record<string, ToolDefinition> {
  const context = args.context

  const draft_topology_model: ToolDefinition = tool({
    description:
      "Normalize candidate-fact structured input into a canonical draft topology model and return validation results including conflicts.",
    args: createDraftTopologyModelArgs(),
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

      const result = await runDraftTopologyModel({
        input: inputArgs,
        allowDocumentAssist: args.pluginConfig.allow_document_assist,
        runtime: execContext,
      })

      return JSON.stringify(result, null, 2)
    },
  })

  return { draft_topology_model }
}

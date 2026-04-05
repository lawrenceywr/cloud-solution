import type { ToolContext } from "@opencode-ai/plugin/tool"

import type { CloudSolutionConfig } from "./config"
import type { Managers } from "./create-managers"
import type { CreatedHooks } from "./create-hooks"
import type {
  MinimalPluginInterface,
  RuntimeContext,
  ToolExecuteBeforeInput,
  ToolExecuteBeforeOutput,
  ToolsRecord,
} from "./plugin/types"

export type CloudSolutionKernel = {
  config: CloudSolutionConfig
  context: RuntimeContext
  hooks: CreatedHooks
  managers: Managers
  tools: ToolsRecord
  invokeTool: (input: {
    toolName: string
    args?: Record<string, unknown>
    sessionID: string
    callID?: string
  }) => Promise<string>
}

async function runToolGuards(
  hooks: CreatedHooks,
  input: ToolExecuteBeforeInput,
  output: ToolExecuteBeforeOutput,
): Promise<void> {
  await hooks.executionReadinessGuard?.["tool.execute.before"]?.(input, output)
}

function createToolContext(
  context: RuntimeContext,
  sessionID: string,
): ToolContext {
  return {
    sessionID,
    messageID: "cloud-solution-message",
    agent: "cloud-solution",
    directory: context.directory,
    worktree: context.worktree ?? context.directory,
    abort: new AbortController().signal,
    metadata(): void {},
    async ask(): Promise<void> {},
  }
}

export function createPluginKernel(args: {
  config: CloudSolutionConfig
  context: RuntimeContext
  managers: Managers
  hooks: CreatedHooks
  tools: ToolsRecord
}): CloudSolutionKernel {
  const { config, context, managers, hooks, tools } = args

  return {
    config,
    context,
    managers,
    hooks,
    tools,
    async invokeTool(input): Promise<string> {
      const toolDefinition = tools[input.toolName]
      if (!toolDefinition) {
        throw new Error(`Unknown tool: ${input.toolName}`)
      }

      const preparedOutput = {
        args: { ...(input.args ?? {}) },
      }

      await runToolGuards(
        hooks,
        {
          tool: input.toolName,
          sessionID: input.sessionID,
          callID: input.callID ?? "cloud-solution-kernel",
        },
        preparedOutput,
      )

      return await toolDefinition.execute(
        preparedOutput.args,
        createToolContext(context, input.sessionID),
      )
    },
  }
}

export function createPluginInterface(args: {
  hooks: CreatedHooks
  tools: ToolsRecord
}): MinimalPluginInterface {
  const { hooks, tools } = args

  return {
    tool: tools,
    "tool.execute.before": async (input, output): Promise<void> => {
      await runToolGuards(hooks, input, output)
    },
  }
}

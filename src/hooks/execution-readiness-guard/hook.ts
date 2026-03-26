import type { CloudSolutionConfig } from "../../config"
import type {
  ToolExecuteBeforeHandler,
  ToolExecuteBeforeInput,
  ToolExecuteBeforeOutput,
} from "../../plugin/types"

export type ExecutionReadinessGuard = {
  "tool.execute.before": ToolExecuteBeforeHandler
}

function hasSessionID(input: ToolExecuteBeforeInput): boolean {
  return typeof input.sessionID === "string" && input.sessionID.trim().length > 0
}

function hasArgsObject(output: ToolExecuteBeforeOutput): boolean {
  return typeof output.args === "object" && output.args !== null && !Array.isArray(output.args)
}

export function createExecutionReadinessGuardHook(
  pluginConfig: CloudSolutionConfig,
): ExecutionReadinessGuard {
  const disabledTools = new Set(pluginConfig.disabled_tools.map((name) => name.toLowerCase()))

  return {
    "tool.execute.before": async (
      input: ToolExecuteBeforeInput,
      output: ToolExecuteBeforeOutput,
    ): Promise<void> => {
      if (disabledTools.has(input.tool.toLowerCase())) {
        throw new Error(`Tool is disabled by configuration: ${input.tool}`)
      }

      if (!hasSessionID(input)) {
        throw new Error("Tool execution requires a non-empty sessionID")
      }

      if (!hasArgsObject(output)) {
        throw new Error("Tool execution requires an argument object")
      }
    },
  }
}

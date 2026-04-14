import type {
  ToolExecuteBeforeHandler,
  ToolExecuteBeforeInput,
  ToolExecuteBeforeOutput,
} from "../../plugin/types"
import {
  hasMinimumPlanningInput,
  isSliceInputTool,
  parseGuardArgs,
} from "../shared/export-guard-helpers"

export type MissingRequiredInputGuard = {
  "tool.execute.before": ToolExecuteBeforeHandler
}

export function createMissingRequiredInputGuardHook(): MissingRequiredInputGuard {
  return {
    "tool.execute.before": async (
      input: ToolExecuteBeforeInput,
      output: ToolExecuteBeforeOutput,
    ): Promise<void> => {
      if (!isSliceInputTool(input.tool)) {
        return
      }

      const args = parseGuardArgs(output)
      if (typeof args.requirement !== "object" || args.requirement === null) {
        throw new Error(`Tool execution requires a requirement object for ${input.tool}`)
      }

      if (!hasMinimumPlanningInput(args)) {
        throw new Error(`Tool execution requires at least one planning input section for ${input.tool}`)
      }
    },
  }
}

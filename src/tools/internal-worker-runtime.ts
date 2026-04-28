import type { ToolContext } from "@opencode-ai/plugin/tool"

import type { WorkerRuntimeContext } from "../coordinator/types"
import type { RuntimeContext } from "../plugin/types"

export const INTERNAL_WORKER_AGENT = "cloud-solution"

export function createInternalWorkerRuntimeContext(args: {
  context: RuntimeContext
  toolContext: ToolContext
}): WorkerRuntimeContext {
  return {
    client: args.context.client!,
    parentSessionID: args.toolContext.sessionID,
    agent: INTERNAL_WORKER_AGENT,
    directory: args.context.directory,
    worktree: args.context.worktree ?? args.context.directory,
    abort: args.toolContext.abort,
  }
}

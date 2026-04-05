import type { CloudSolutionConfig } from "./config"
import type { Managers } from "./create-managers"
import { createToolRegistry } from "./plugin/tool-registry"
import type { RuntimeContext, ToolsRecord } from "./plugin/types"

export function createTools(args: {
  pluginConfig: CloudSolutionConfig
  managers: Managers
  context?: RuntimeContext
}): ToolsRecord {
  const { pluginConfig, managers, context } = args

  return createToolRegistry({
    pluginConfig,
    managers,
    context,
  })
}

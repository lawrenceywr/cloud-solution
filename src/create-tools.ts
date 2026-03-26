import type { CloudSolutionConfig } from "./config"
import type { Managers } from "./create-managers"
import { createToolRegistry } from "./plugin/tool-registry"
import type { ToolsRecord } from "./plugin/types"

export function createTools(args: {
  pluginConfig: CloudSolutionConfig
  managers: Managers
}): ToolsRecord {
  const { pluginConfig, managers } = args

  return createToolRegistry({
    pluginConfig,
    managers,
  })
}

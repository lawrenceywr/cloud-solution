import type { CloudSolutionConfig } from "../config"
import type { Managers } from "../create-managers"
import {
  createDescribeCloudSolutionTools,
  createGenerateDeviceCablingTableTools,
  createGenerateDevicePortPlanTools,
  createGenerateIpAllocationTableTools,
  createGeneratePortConnectionTableTools,
  createSummarizeDesignGapsTools,
  createValidateSolutionModelTools,
} from "../tools"
import { filterDisabledTools } from "../shared/filter-disabled-tools"
import { normalizeToolArgSchemas } from "./normalize-tool-arg-schemas"
import type { ToolsRecord } from "./types"

export function createToolRegistry(args: {
  pluginConfig: CloudSolutionConfig
  managers: Managers
}): ToolsRecord {
  const { pluginConfig, managers } = args

  const allTools: ToolsRecord = {
    ...createDescribeCloudSolutionTools({
      pluginConfig,
      managers,
    }),
    ...createGenerateDeviceCablingTableTools(),
    ...createGenerateDevicePortPlanTools(),
    ...createGenerateIpAllocationTableTools(),
    ...createGeneratePortConnectionTableTools(),
    ...createSummarizeDesignGapsTools(),
    ...createValidateSolutionModelTools(),
  }

  for (const toolDefinition of Object.values(allTools)) {
    normalizeToolArgSchemas(toolDefinition)
  }

  return filterDisabledTools(allTools, pluginConfig.disabled_tools)
}

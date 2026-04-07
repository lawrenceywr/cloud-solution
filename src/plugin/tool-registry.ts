import type { CloudSolutionConfig } from "../config"
import type { Managers } from "../create-managers"
import type { RuntimeContext } from "./types"
import {
  createCaptureSolutionRequirementsTools,
  createDescribeCloudSolutionTools,
  createDraftTopologyModelTools,
  createExportArtifactBundleTools,
  createExtractDocumentCandidateFactsTools,
  createGenerateDeviceCablingTableTools,
  createGenerateDevicePortPlanTools,
  createGenerateIpAllocationTableTools,
  createGeneratePortConnectionTableTools,
  createStartSolutionReviewWorkflowTools,
  createSummarizeDesignGapsTools,
  createValidateSolutionModelTools,
} from "../tools"
import { filterDisabledTools } from "../shared/filter-disabled-tools"
import { normalizeToolArgSchemas } from "./normalize-tool-arg-schemas"
import type { ToolsRecord } from "./types"

export function createToolRegistry(args: {
  pluginConfig: CloudSolutionConfig
  managers: Managers
  context?: RuntimeContext
}): ToolsRecord {
  const { pluginConfig, managers, context } = args

  const allTools: ToolsRecord = {
    ...createCaptureSolutionRequirementsTools({
      pluginConfig,
    }),
    ...createDescribeCloudSolutionTools({
      pluginConfig,
      managers,
    }),
    ...createDraftTopologyModelTools({
      pluginConfig,
    }),
    ...createExtractDocumentCandidateFactsTools({
      pluginConfig,
      context,
    }),
    ...createExportArtifactBundleTools({
      pluginConfig,
    }),
    ...createGenerateDeviceCablingTableTools(),
    ...createGenerateDevicePortPlanTools(),
    ...createGenerateIpAllocationTableTools(),
    ...createGeneratePortConnectionTableTools(),
    ...createStartSolutionReviewWorkflowTools({
      pluginConfig,
      context,
    }),
    ...createSummarizeDesignGapsTools(),
    ...createValidateSolutionModelTools(),
  }

  for (const toolDefinition of Object.values(allTools)) {
    normalizeToolArgSchemas(toolDefinition)
  }

  return filterDisabledTools(allTools, pluginConfig.disabled_tools)
}

import type { CloudSolutionConfig } from "../config"
import type { Managers } from "../create-managers"
import type { RuntimeContext } from "./types"
import {
  createCaptureSolutionRequirementsTools,
  createDescribeCloudSolutionTools,
  createDraftTopologyModelTools,
  createExportArtifactBundleTools,
  createExtractDocumentCandidateFactsTools,
  createExtractStructuredInputFromTemplatesTools,
  createGenerateDeviceCablingTableTools,
  createGenerateDeviceRackLayoutTools,
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
      context,
    }),
    ...createExtractDocumentCandidateFactsTools({
      pluginConfig,
      context,
    }),
    ...createExtractStructuredInputFromTemplatesTools({
      pluginConfig,
      context,
    }),
    ...createExportArtifactBundleTools({
      pluginConfig,
      context,
    }),
    ...createGenerateDeviceCablingTableTools(),
    ...createGenerateDeviceRackLayoutTools(),
    ...createGenerateDevicePortPlanTools(),
    ...createGenerateIpAllocationTableTools(),
    ...createGeneratePortConnectionTableTools(),
    ...createStartSolutionReviewWorkflowTools({
      pluginConfig,
      context,
    }),
    ...createSummarizeDesignGapsTools({
      context,
    }),
    ...createValidateSolutionModelTools(),
  }

  for (const toolDefinition of Object.values(allTools)) {
    normalizeToolArgSchemas(toolDefinition)
  }

  return filterDisabledTools(allTools, pluginConfig.disabled_tools)
}

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import type { CloudSolutionConfig } from "../../config"
import type { Managers } from "../../create-managers"

export function createDescribeCloudSolutionTools(args: {
  pluginConfig: CloudSolutionConfig
  managers: Managers
}): Record<string, ToolDefinition> {
  const { pluginConfig, managers } = args

  const describe_cloud_solution: ToolDefinition = tool({
    description:
      "Describe the current cloud-solution scaffold, trust boundary, supported artifacts, and minimal domain entities.",
    args: {
      include_examples: tool.schema
        .boolean()
        .optional()
        .describe("Include one example requirement payload when true"),
    },
    execute: async (inputArgs) => {
      const response = {
        pluginName: pluginConfig.plugin_name,
        projectRoot: managers.projectRoot,
        phase: "scaffold",
        allowDocumentAssist: pluginConfig.allow_document_assist,
        requireConfirmationForInferredFacts:
          pluginConfig.require_confirmation_for_inferred_facts,
        supportedArtifacts: managers.scaffoldCatalog.artifactTypes,
        supportedEntities: managers.scaffoldCatalog.entityKinds,
        trustBoundary: managers.scaffoldCatalog.trustBoundary,
        exampleRequirement: inputArgs.include_examples
          ? {
              id: "req-single-rack",
              projectName: "Single Rack Scaffold Example",
              scopeType: "data-center",
              artifactRequests: pluginConfig.default_artifacts,
            }
          : undefined,
      }

      return JSON.stringify(response, null, 2)
    },
  })

  return { describe_cloud_solution }
}

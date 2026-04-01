import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import type { CloudSolutionConfig } from "../../config"
import type { ArtifactType, CloudSolutionSliceInput } from "../../domain"
import { buildArtifactBundleExport } from "../../artifacts"
import { normalizeSolutionToolInput } from "../../normalizers"
import { createSolutionSliceToolArgs } from "../solution-slice-tool-args"
import { validateCloudSolutionModel } from "../../validators"

function ensureBundleArtifactRequests(args: {
  sliceInput: CloudSolutionSliceInput
  defaultArtifactTypes: ArtifactType[]
}): CloudSolutionSliceInput {
  const { sliceInput, defaultArtifactTypes } = args
  if (sliceInput.requirement.artifactRequests.length > 0) {
    return sliceInput
  }

  return {
    ...sliceInput,
    requirement: {
      ...sliceInput.requirement,
      artifactRequests: [...defaultArtifactTypes],
    },
  }
}

export function createExportArtifactBundleTools(args: {
  pluginConfig: CloudSolutionConfig
}): Record<string, ToolDefinition> {
  const { pluginConfig } = args

  const export_artifact_bundle: ToolDefinition = tool({
    description:
      "Validate a cloud-solution model and export a deterministic bundle index, review report, and requested markdown artifacts.",
    args: createSolutionSliceToolArgs(),
    execute: async (inputArgs) => {
      const parsedInput = normalizeSolutionToolInput(inputArgs)
      const sliceInput = ensureBundleArtifactRequests({
        sliceInput: parsedInput,
        defaultArtifactTypes: pluginConfig.default_artifacts,
      })
      const issues = validateCloudSolutionModel(sliceInput)
      const bundle = buildArtifactBundleExport({
        input: sliceInput,
        issues,
      })

      return JSON.stringify(bundle, null, 2)
    },
  })

  return { export_artifact_bundle }
}

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import {
  type ArtifactType,
  type CloudSolutionSliceInput,
} from "../../domain"
import { buildIpAllocationTableArtifact } from "../../artifacts"
import { normalizeSolutionToolInput } from "../../normalizers"
import { createSolutionSliceToolArgs } from "../solution-slice-tool-args"
import { validateCloudSolutionModel } from "../../validators"

function ensureArtifactRequest(
  sliceInput: CloudSolutionSliceInput,
  artifactType: ArtifactType,
): CloudSolutionSliceInput {
  if (sliceInput.requirement.artifactRequests.includes(artifactType)) {
    return sliceInput
  }

  return {
    ...sliceInput,
    requirement: {
      ...sliceInput.requirement,
      artifactRequests: [...sliceInput.requirement.artifactRequests, artifactType],
    },
  }
}

export function createGenerateIpAllocationTableTools(): Record<string, ToolDefinition> {
  const generate_ip_allocation_table: ToolDefinition = tool({
    description:
      "Validate a minimal cloud-solution model and generate a deterministic IP allocation table artifact.",
    args: createSolutionSliceToolArgs(),
    execute: async (inputArgs) => {
      const parsedInput = normalizeSolutionToolInput(inputArgs)
      const sliceInput = ensureArtifactRequest(parsedInput, "ip-allocation-table")
      const issues = validateCloudSolutionModel(sliceInput)
      const artifact = buildIpAllocationTableArtifact({
        input: sliceInput,
        issues,
      })

      return JSON.stringify(
        {
          issues,
          artifact,
        },
        null,
        2,
      )
    },
  })

  return { generate_ip_allocation_table }
}

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import {
  type ArtifactType,
  type CloudSolutionSliceInput,
} from "../../domain"
import { buildDevicePortPlanArtifact } from "../../artifacts"
import { normalizeSolutionToolInput } from "../../normalizers"
import { createSolutionSliceToolArgs } from "../solution-slice-tool-args"
import { validateCloudSolutionModel } from "../../validators"
import {
  buildPendingConfirmationBlockMessage,
  collectRelevantPendingConfirmationItems,
} from "../../hooks/shared/export-guard-helpers"

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

export function createGenerateDevicePortPlanTools(): Record<string, ToolDefinition> {
  const generate_device_port_plan: ToolDefinition = tool({
    description:
      "Validate a physical cloud-solution model and generate a deterministic device port plan artifact.",
    args: createSolutionSliceToolArgs(),
    execute: async (inputArgs) => {
      const pendingConfirmationItems = collectRelevantPendingConfirmationItems({
        toolName: "generate_device_port_plan",
        input: inputArgs as Record<string, unknown>,
      })
      if (pendingConfirmationItems.length > 0) {
        throw new Error(buildPendingConfirmationBlockMessage(pendingConfirmationItems))
      }

      const parsedInput = normalizeSolutionToolInput(inputArgs)
      const sliceInput = ensureArtifactRequest(parsedInput, "device-port-plan")
      const issues = validateCloudSolutionModel(sliceInput)
      const artifact = buildDevicePortPlanArtifact({
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

  return { generate_device_port_plan }
}

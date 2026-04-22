import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import {
  type ArtifactType,
  type CloudSolutionSliceInput,
} from "../../domain"
import { buildPortConnectionTableArtifact } from "../../artifacts"
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

export function createGeneratePortConnectionTableTools(): Record<string, ToolDefinition> {
  const generate_port_connection_table: ToolDefinition = tool({
    description:
      "Validate a minimal cloud-solution connectivity model and generate a deterministic port connection table artifact.",
    args: createSolutionSliceToolArgs(),
    execute: async (inputArgs) => {
      const pendingConfirmationItems = collectRelevantPendingConfirmationItems({
        toolName: "generate_port_connection_table",
        input: inputArgs as Record<string, unknown>,
      })
      if (pendingConfirmationItems.length > 0) {
        throw new Error(buildPendingConfirmationBlockMessage(pendingConfirmationItems))
      }

      const parsedInput = normalizeSolutionToolInput(inputArgs)
      const sliceInput = ensureArtifactRequest(parsedInput, "device-port-connection-table")
      const issues = validateCloudSolutionModel(sliceInput)
      const artifact = buildPortConnectionTableArtifact({
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

  return { generate_port_connection_table }
}

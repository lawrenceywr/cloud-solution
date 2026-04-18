import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"

import type { CloudSolutionConfig } from "../../config"
import type { RuntimeContext } from "../../plugin/types"
import type { WorkerRuntimeContext } from "../../coordinator/types"
import { runExportArtifactBundle } from "../../features"
import { createSolutionSliceToolArgs } from "../solution-slice-tool-args"
import { createInternalWorkerRuntimeContext } from "../internal-worker-runtime"

export function createExportArtifactBundleTools(args: {
  pluginConfig: CloudSolutionConfig
  context?: RuntimeContext
}): Record<string, ToolDefinition> {
  const { pluginConfig, context } = args

  const export_artifact_bundle: ToolDefinition = tool({
    description:
      "Validate a cloud-solution model and export a deterministic bundle index, review report, and requested markdown artifacts.",
    args: createSolutionSliceToolArgs(),
    execute: async (inputArgs, toolContext) => {
      const runtime: WorkerRuntimeContext | undefined = context?.client
        ? createInternalWorkerRuntimeContext({
            context,
            toolContext,
          })
        : undefined

      const result = await runExportArtifactBundle({
        input: inputArgs,
        pluginConfig,
        runtime,
      })

      return JSON.stringify(result, null, 2)
    },
  })

  return { export_artifact_bundle }
}

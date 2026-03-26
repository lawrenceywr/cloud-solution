import type { Plugin } from "@opencode-ai/plugin"

import { loadPluginConfig } from "./plugin-config"
import { createManagers } from "./create-managers"
import { createTools } from "./create-tools"
import { createHooks } from "./create-hooks"
import { createPluginInterface, createPluginKernel } from "./plugin-interface"

export function createCloudSolutionRuntime(directory: string) {
  const context = { directory }
  const pluginConfig = loadPluginConfig(directory)
  const managers = createManagers({
    context,
    pluginConfig,
  })
  const tools = createTools({
    pluginConfig,
    managers,
  })
  const hooks = createHooks({
    pluginConfig,
  })
  const kernel = createPluginKernel({
    config: pluginConfig,
    context,
    managers,
    hooks,
    tools,
  })

  return {
    context,
    pluginConfig,
    managers,
    tools,
    hooks,
    kernel,
    pluginInterface: createPluginInterface({
      hooks,
      tools,
    }),
  }
}

const CloudSolutionPlugin: Plugin = async (ctx) => {
  return createCloudSolutionRuntime(ctx.directory).pluginInterface
}

export default CloudSolutionPlugin

export type { CloudSolutionConfig } from "./config"
export type { CloudSolutionModel } from "./domain"

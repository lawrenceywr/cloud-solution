import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { parse } from "jsonc-parser"

import {
  CloudSolutionConfigInputSchema,
  CloudSolutionConfigSchema,
  type CloudSolutionConfig,
} from "./config"

type LoadPluginConfigOptions = {
  userConfigPath?: string
  projectConfigPath?: string
}

function detectConfigFile(basePath: string, fileName: string): string | null {
  const jsoncPath = join(basePath, `${fileName}.jsonc`)
  if (existsSync(jsoncPath)) {
    return jsoncPath
  }

  const jsonPath = join(basePath, `${fileName}.json`)
  if (existsSync(jsonPath)) {
    return jsonPath
  }

  return null
}

function parseJsoncObject(content: string): Record<string, unknown> {
  const parsed = parse(content)

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Expected configuration file to contain an object")
  }

  return parsed as Record<string, unknown>
}

function loadPartialConfigFromPath(configPath: string | undefined):
  | Partial<CloudSolutionConfig>
  | null {
  if (!configPath || !existsSync(configPath)) {
    return null
  }

  const content = readFileSync(configPath, "utf8")
  const rawConfig = parseJsoncObject(content)
  return CloudSolutionConfigInputSchema.parse(rawConfig)
}

function mergeConfigs(
  base: Partial<CloudSolutionConfig>,
  override: Partial<CloudSolutionConfig>,
): Partial<CloudSolutionConfig> {
  return {
    ...base,
    ...override,
    disabled_tools: [
      ...new Set([...(base.disabled_tools ?? []), ...(override.disabled_tools ?? [])]),
    ],
    disabled_hooks: [
      ...new Set([...(base.disabled_hooks ?? []), ...(override.disabled_hooks ?? [])]),
    ],
    default_artifacts: override.default_artifacts ?? base.default_artifacts,
  }
}

export function loadPluginConfig(
  directory: string,
  options?: LoadPluginConfigOptions,
): CloudSolutionConfig {
  const userConfigPath =
    options?.userConfigPath
    ?? detectConfigFile(join(homedir(), ".config", "opencode"), "cloud-solution")
    ?? undefined
  const projectConfigPath =
    options?.projectConfigPath
    ?? detectConfigFile(join(directory, ".opencode"), "cloud-solution")
    ?? undefined

  let mergedConfig: Partial<CloudSolutionConfig> =
    loadPartialConfigFromPath(userConfigPath) ?? {}

  const projectConfig = loadPartialConfigFromPath(projectConfigPath)
  if (projectConfig) {
    mergedConfig = mergeConfigs(mergedConfig, projectConfig)
  }

  return CloudSolutionConfigSchema.parse(mergedConfig)
}

import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { loadPluginConfig } from "./plugin-config"

const createdDirectories: string[] = []

function createTempProject(): string {
  const directory = mkdtempSync(join(tmpdir(), "cloud-solution-config-"))
  createdDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("loadPluginConfig", () => {
  test("returns defaults when no config files exist", () => {
    const projectDirectory = createTempProject()

    const result = loadPluginConfig(projectDirectory)

    expect(result.plugin_name).toBe("cloud-solution")
    expect(result.require_confirmation_for_inferred_facts).toBe(true)
    expect(result.default_artifacts).toEqual([
      "device-cabling-table",
      "device-port-plan",
      "device-port-connection-table",
      "ip-allocation-table",
    ])
  })

  test("merges user and project config with unique disabled lists", () => {
    const projectDirectory = createTempProject()
    const userConfigPath = join(projectDirectory, "user-cloud-solution.jsonc")
    const projectConfigDir = join(projectDirectory, ".opencode")
    const projectConfigPath = join(projectConfigDir, "cloud-solution.jsonc")

    mkdirSync(projectConfigDir, { recursive: true })
    writeFileSync(
      userConfigPath,
      JSON.stringify({
        disabled_tools: ["describe_cloud_solution"],
        allow_document_assist: false,
      }),
    )
    writeFileSync(
      projectConfigPath,
      JSON.stringify({
        disabled_hooks: ["execution-readiness-guard"],
        disabled_tools: ["describe_cloud_solution"],
      }),
    )

    const result = loadPluginConfig(projectDirectory, {
      userConfigPath,
      projectConfigPath,
    })

    expect(result.disabled_tools).toEqual(["describe_cloud_solution"])
    expect(result.disabled_hooks).toEqual(["execution-readiness-guard"])
    expect(result.allow_document_assist).toBe(false)
  })

  test("throws when config content is invalid", () => {
    const projectDirectory = createTempProject()
    const projectConfigDir = join(projectDirectory, ".opencode")
    const projectConfigPath = join(projectConfigDir, "cloud-solution.jsonc")

    mkdirSync(projectConfigDir, { recursive: true })
    writeFileSync(projectConfigPath, JSON.stringify({ default_artifacts: "bad" }))

    expect(() => loadPluginConfig(projectDirectory, { projectConfigPath })).toThrow()
  })
})

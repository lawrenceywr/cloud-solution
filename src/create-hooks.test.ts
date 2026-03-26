import { describe, expect, test } from "bun:test"

import { loadPluginConfig } from "./plugin-config"
import { createHooks } from "./create-hooks"

describe("createHooks", () => {
  test("blocks execution when sessionID is missing", async () => {
    const hooks = createHooks({
      pluginConfig: loadPluginConfig(process.cwd()),
    })

    await expect(
      hooks.executionReadinessGuard?.["tool.execute.before"]?.(
        {
          tool: "describe_cloud_solution",
          sessionID: "",
          callID: "missing-session",
        },
        { args: {} },
      ),
    ).rejects.toThrow("sessionID")
  })

  test("allows execution when context is complete", async () => {
    const hooks = createHooks({
      pluginConfig: loadPluginConfig(process.cwd()),
    })

    await expect(
      hooks.executionReadinessGuard?.["tool.execute.before"]?.(
        {
          tool: "describe_cloud_solution",
          sessionID: "hook-session",
          callID: "valid-call",
        },
        { args: {} },
      ),
    ).resolves.toBeUndefined()
  })
})

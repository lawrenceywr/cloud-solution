import { describe, expect, test } from "bun:test"

import { loadPluginConfig } from "./plugin-config"
import { createManagers } from "./create-managers"
import { createTools } from "./create-tools"
import { createTestToolContext } from "./test-helpers/tool-context"

describe("validate_solution_model tool", () => {
  test("registers validate_solution_model and returns validation-only output", async () => {
    const config = loadPluginConfig(process.cwd())
    const managers = createManagers({
      context: { directory: process.cwd() },
      pluginConfig: config,
    })

    const tools = createTools({
      pluginConfig: config,
      managers,
    })

    expect(Object.keys(tools)).toContain("validate_solution_model")

    const response = await tools.validate_solution_model.execute(
      {
        requirement: {
          id: "req-validate-1",
          projectName: "Validation Tool Example",
          scopeType: "cloud",
        },
        segments: [
          {
            id: "segment-validation",
            name: "validation",
            segmentType: "subnet",
            cidr: "10.70.0.0/24",
            gateway: "10.70.0.1",
            purpose: "validation",
          },
        ],
        allocations: [
          {
            id: "alloc-validation-1",
            segmentId: "segment-validation",
            allocationType: "gateway",
            ipAddress: "10.70.0.1",
          },
        ],
      },
      createTestToolContext({ sessionID: "validation-tool-session" }),
    )
    const parsed = JSON.parse(response)

    expect(parsed.valid).toBe(true)
    expect(parsed.blockingIssueCount).toBe(0)
    expect(parsed.warningCount).toBe(0)
    expect(parsed.issues).toEqual([])
    expect(parsed.artifact).toBeUndefined()
  })
})

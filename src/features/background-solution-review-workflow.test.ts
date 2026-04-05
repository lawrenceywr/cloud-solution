import { describe, expect, test } from "bun:test"

import { createScn01SingleRackConnectivityFixture } from "../scenarios/fixtures"
import { loadPluginConfig } from "../plugin-config"
import { runBackgroundSolutionReviewWorkflow } from "./background-solution-review-workflow"

describe("runBackgroundSolutionReviewWorkflow", () => {
  test("returns export_ready and a bundle for a clean slice", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const result = runBackgroundSolutionReviewWorkflow({
      input: createScn01SingleRackConnectivityFixture(),
      pluginConfig,
    })

    expect(result.orchestrationState).toBe("export_ready")
    expect(result.transitions).toEqual(["queued", "running", "export_ready"])
    expect(result.nextAction).toBe("export_bundle")
    expect(result.bundle?.exportReady).toBe(true)
  })

  test("returns review_required without a bundle when review is still needed", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const baseInput = createScn01SingleRackConnectivityFixture()
    const result = runBackgroundSolutionReviewWorkflow({
      input: {
        ...baseInput,
        devices: baseInput.devices.map((device) =>
          device.id === "device-server-a"
            ? {
                ...device,
                redundancyIntent: "dual-homed-preferred" as const,
              }
            : device,
        ),
      },
      pluginConfig,
    })

    expect(result.orchestrationState).toBe("review_required")
    expect(result.transitions).toEqual(["queued", "running", "review_required"])
    expect(result.nextAction).toBe("review_assumptions")
    expect(result.bundle).toBeUndefined()
  })

  test("returns blocked without a bundle when blocking issues exist", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const baseInput = createScn01SingleRackConnectivityFixture()
    const result = runBackgroundSolutionReviewWorkflow({
      input: {
        ...baseInput,
        allocations: [],
      },
      pluginConfig,
    })

    expect(result.orchestrationState).toBe("blocked")
    expect(result.transitions).toEqual(["queued", "running", "blocked"])
    expect(result.nextAction).toBe("resolve_blockers")
    expect(result.bundle).toBeUndefined()
  })

  test("returns failed on malformed input", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const result = runBackgroundSolutionReviewWorkflow({
      input: null,
      pluginConfig,
    })

    expect(result.orchestrationState).toBe("failed")
    expect(result.transitions).toEqual(["queued", "running", "failed"])
    expect(result.nextAction).toBe("inspect_failure")
    expect(result.error).toBeDefined()
  })
})

import { describe, expect, test } from "bun:test"

import { createScn01SingleRackConnectivityFixture } from "../scenarios/fixtures"
import { loadPluginConfig } from "../plugin-config"
import { runBackgroundSolutionReviewWorkflow } from "../features/background-solution-review-workflow"
import { buildSolutionReviewAgentBrief } from "./solution-review-brief"

describe("buildSolutionReviewAgentBrief", () => {
  test("builds an export-ready brief with bundle artifact names", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const workflow = runBackgroundSolutionReviewWorkflow({
      input: createScn01SingleRackConnectivityFixture(),
      pluginConfig,
    })
    const brief = buildSolutionReviewAgentBrief(workflow)

    expect(brief.agentID).toBe("solution_review_assistant")
    expect(brief.orchestrationState).toBe("export_ready")
    expect(brief.nextAction).toBe("export_bundle")
    expect(brief.exportArtifactNames).toContain("artifact-bundle-index.md")
  })

  test("builds a review-required brief with review items and no bundle", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const baseInput = createScn01SingleRackConnectivityFixture()
    const workflow = runBackgroundSolutionReviewWorkflow({
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
    const brief = buildSolutionReviewAgentBrief(workflow)

    expect(brief.orchestrationState).toBe("review_required")
    expect(brief.nextAction).toBe("review_assumptions")
    expect(brief.reviewItems.length).toBeGreaterThan(0)
    expect(brief.exportArtifactNames).toEqual([])
  })

  test("builds a blocked brief with blocking issue messages", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const baseInput = createScn01SingleRackConnectivityFixture()
    const workflow = runBackgroundSolutionReviewWorkflow({
      input: {
        ...baseInput,
        allocations: [],
      },
      pluginConfig,
    })
    const brief = buildSolutionReviewAgentBrief(workflow)

    expect(brief.orchestrationState).toBe("blocked")
    expect(brief.nextAction).toBe("resolve_blockers")
    expect(brief.blockedItems.some((item) => item.includes("ip_allocations_missing"))).toBe(true)
  })

  test("merges explicit clarification items into the brief", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const workflow = runBackgroundSolutionReviewWorkflow({
      input: createScn01SingleRackConnectivityFixture(),
      pluginConfig,
    })
    const brief = buildSolutionReviewAgentBrief(workflow, {
      reviewItems: ["links: 设备建议双归属，但当前链路不足，建议补充或确认这是可接受的降级设计"],
    })

    expect(brief.reviewItems).toContain(
      "links: 设备建议双归属，但当前链路不足，建议补充或确认这是可接受的降级设计",
    )
  })
})

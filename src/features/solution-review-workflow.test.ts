import { describe, expect, test } from "bun:test"

import { createScn01SingleRackConnectivityFixture } from "../scenarios/fixtures"
import { loadPluginConfig } from "../plugin-config"
import { runSolutionReviewWorkflow } from "./solution-review-workflow"

describe("runSolutionReviewWorkflow", () => {
  test("returns export_ready for a clean exportable slice", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const result = runSolutionReviewWorkflow({
      input: createScn01SingleRackConnectivityFixture(),
      mode: "export",
      pluginConfig,
    })

    expect(result.workflowState).toBe("export_ready")
    expect(result.validationSummary.valid).toBe(true)
    expect(result.reviewSummary.reviewRequired).toBe(false)
    expect(result.bundle?.exportReady).toBe(true)
  })

  test("returns review_required when assumptions and warnings remain", () => {
    const result = runSolutionReviewWorkflow({
      input: {
        requirement: {
          id: "req-review-workflow-1",
          projectName: "Review Workflow Example",
          scopeType: "data-center",
        },
        devices: [
          {
            id: "device-switch-a",
            name: "switch-a",
            role: "switch",
            redundancyIntent: "dual-homed-preferred",
            statusConfidence: "inferred",
          },
        ],
        racks: [],
        ports: [],
        links: [],
        segments: [],
        allocations: [],
      },
      mode: "review",
    })

    expect(result.workflowState).toBe("review_required")
    expect(result.validationSummary.valid).toBe(true)
    expect(result.reviewSummary.assumptionCount).toBe(1)
    expect(result.reviewSummary.unresolvedItemCount).toBe(1)
  })

  test("returns blocked when export mode has blocking validation issues", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const baseInput = createScn01SingleRackConnectivityFixture()
    const result = runSolutionReviewWorkflow({
      input: {
        ...baseInput,
        allocations: [],
      },
      mode: "export",
      pluginConfig,
    })

    expect(result.workflowState).toBe("blocked")
    expect(result.validationSummary.valid).toBe(false)
    expect(result.bundle).toBeUndefined()
  })

  test("injects default artifact requests in export mode when omitted", () => {
    const pluginConfig = loadPluginConfig(process.cwd())
    const baseInput = createScn01SingleRackConnectivityFixture()
    const result = runSolutionReviewWorkflow({
      input: {
        ...baseInput,
        requirement: {
          ...baseInput.requirement,
          artifactRequests: [],
        },
      },
      mode: "export",
      pluginConfig,
    })

    expect(result.sliceInput.requirement.artifactRequests).toEqual(pluginConfig.default_artifacts)
    expect(result.bundle?.requestedArtifactTypes).toEqual(pluginConfig.default_artifacts)
  })
})

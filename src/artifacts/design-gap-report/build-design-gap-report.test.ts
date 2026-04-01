import { describe, expect, test } from "bun:test"

import { createScn01SingleRackConnectivityFixture } from "../../scenarios/fixtures"
import { validateCloudSolutionModel } from "../../validators"
import { buildDesignGapReport } from "./build-design-gap-report"

describe("buildDesignGapReport", () => {
  test("builds a clean review summary when the validated model has no gaps", () => {
    const input = createScn01SingleRackConnectivityFixture()
    const summary = buildDesignGapReport({
      input,
      issues: validateCloudSolutionModel(input),
    })

    expect(summary.reviewRequired).toBe(false)
    expect(summary.assumptionCount).toBe(0)
    expect(summary.blockingGapCount).toBe(0)
    expect(summary.artifact.content).toContain("Review Required: no")
  })

  test("builds assumptions and blocking gaps from weak or incomplete input", () => {
    const baseInput = createScn01SingleRackConnectivityFixture()
    const input = {
      ...baseInput,
      devices: [
        {
          ...baseInput.devices[0]!,
          statusConfidence: "inferred" as const,
        },
        ...baseInput.devices.slice(1),
      ],
      allocations: [],
    }
    const summary = buildDesignGapReport({
      input,
      issues: validateCloudSolutionModel(input),
    })

    expect(summary.reviewRequired).toBe(true)
    expect(summary.assumptionCount).toBe(1)
    expect(summary.blockingGapCount).toBeGreaterThan(0)
    expect(summary.artifact.content).toContain("## Assumptions")
    expect(summary.artifact.content).toContain("## Blocking Gaps")
  })
})

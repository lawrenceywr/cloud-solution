import { describe, expect, test } from "bun:test"

import {
  createScn01SingleRackConnectivityFixture,
  createScn08HighReliabilityRackLayoutFixture,
} from "../scenarios/fixtures"
import { runSummarizeDesignGaps } from "./summarize-design-gaps"

describe("runSummarizeDesignGaps", () => {
  test("returns deterministic review output through the feature layer", async () => {
    const result = await runSummarizeDesignGaps({
      input: createScn01SingleRackConnectivityFixture(),
    })

    expect(result.workflowState).toBe("export_ready")
    expect(result.validationSummary.valid).toBe(true)
    expect(result.hasBlockingConflicts).toBe(false)
    expect(result.blockingConflictCount).toBe(0)
  })

  test("does not surface device_power_missing for cable-manager devices", async () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const result = await runSummarizeDesignGaps({
      input: {
        ...baseInput,
        devices: [
          ...baseInput.devices,
          {
            id: "device-cable-manager-a",
            name: "48口理线器",
            role: "cable-manager",
            rackId: "rack-a",
            rackPosition: 20,
            rackUnitHeight: 1,
            powerWatts: undefined,
            sourceRefs: [],
            statusConfidence: "confirmed",
          },
        ],
      },
    })

    expect(result.validationSummary.issues.map((issue) => issue.code)).not.toContain("device_power_missing")
    expect(result.gaps.map((gap) => gap.title)).not.toContain("device_power_missing")
  })
})

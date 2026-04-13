import { describe, expect, test } from "bun:test"

import { createScn01SingleRackConnectivityFixture } from "../scenarios/fixtures"
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
})

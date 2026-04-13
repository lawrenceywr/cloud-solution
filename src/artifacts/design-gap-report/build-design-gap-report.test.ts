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

  test("includes conflicts in the summary when provided", () => {
    const input = createScn01SingleRackConnectivityFixture()
    const conflicts = [
      {
        id: "conflict-1",
        conflictType: "duplicate_device" as const,
        severity: "blocking" as const,
        message: "Duplicate device ID detected",
        entityRefs: ["device-1", "device-2"],
        sourceRefs: [{ kind: "user-input" as const, ref: "structured-input" }],
        suggestedResolution: "Remove or rename one of the duplicate devices",
      },
      {
        id: "conflict-2",
        conflictType: "impossible_port" as const,
        severity: "warning" as const,
        message: "Port configuration mismatch",
        entityRefs: ["port-1"],
        sourceRefs: [{ kind: "diagram" as const, ref: "topology-diagram" }],
      },
    ]
    const summary = buildDesignGapReport({
      input,
      issues: validateCloudSolutionModel(input),
      conflicts,
    })

    expect(summary.reviewRequired).toBe(true)
    expect(summary.conflicts).toHaveLength(2)
    expect(summary.blockingConflictCount).toBe(1)
    expect(summary.warningConflictCount).toBe(1)
    expect(summary.hasBlockingConflicts).toBe(true)
    expect(summary.conflictArtifact).toBeDefined()
    expect(summary.conflictArtifact?.content).toContain("Conflict Report")
    expect(summary.conflictArtifact?.content).toContain("Duplicate device ID detected")
  })

  test("marks review as not required when there are no gaps or conflicts", () => {
    const input = createScn01SingleRackConnectivityFixture()
    const summary = buildDesignGapReport({
      input,
      issues: [],
      conflicts: [],
    })

    expect(summary.reviewRequired).toBe(false)
    expect(summary.conflicts).toHaveLength(0)
    expect(summary.blockingConflictCount).toBe(0)
    expect(summary.hasBlockingConflicts).toBe(false)
  })
})

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

  test("projects pending confirmation items into operator-facing confirmation packets", () => {
    const input = createScn01SingleRackConnectivityFixture()
    const summary = buildDesignGapReport({
      input,
      issues: [],
      pendingConfirmationItems: [
        {
          id: "template-plane-type-conflict|server-a:eth0|switch-a:xe-0/0/1",
          kind: "template-plane-type-conflict",
          severity: "warning",
          title: "template plane type conflict requires confirmation",
          detail: "Workbook-derived link server-a:eth0 ↔ switch-a:xe-0/0/1 resolved conflicting explicit plane types (storage vs business); preserving this connection as ambiguous and requiring project confirmation.",
          confidenceState: "unresolved",
          subjectType: "link",
          subjectId: "link-server-a-switch-a",
          entityRefs: ["link:link-server-a-switch-a"],
          sourceRefs: [{ kind: "document", ref: "fixtures/template.xlsx" }],
          endpointA: { deviceName: "server-a", portName: "eth0" },
          endpointB: { deviceName: "switch-a", portName: "xe-0/0/1" },
        },
      ],
    })

    expect(summary.reviewRequired).toBe(true)
    expect(summary.unresolvedItemCount).toBe(1)
    expect(summary.confirmationPackets).toEqual([
      expect.objectContaining({
        id: "template-plane-type-conflict|server-a:eth0|switch-a:xe-0/0/1",
        kind: "template-plane-type-conflict",
        subjectType: "link",
        subjectId: "link-server-a-switch-a",
        requiredDecision: "Confirm the intended plane/link type for server-a:eth0 ↔ switch-a:xe-0/0/1, then update the source/structured input accordingly.",
        currentAmbiguity: "Workbook-derived link server-a:eth0 ↔ switch-a:xe-0/0/1 resolved conflicting explicit plane types (storage vs business); preserving this connection as ambiguous and requiring project confirmation.",
        suggestedAction: "Confirm the intended plane/link type with the operator and update the source or structured input to match that decision.",
        endpoints: {
          endpointA: { deviceName: "server-a", portName: "eth0" },
          endpointB: { deviceName: "switch-a", portName: "xe-0/0/1" },
        },
      }),
    ])
    expect(summary.artifact.content).toContain("## Confirmation Packets")
    expect(summary.artifact.content).toContain("- Required Decision: Confirm the intended plane/link type for server-a:eth0 ↔ switch-a:xe-0/0/1, then update the source/structured input accordingly.")
    expect(summary.artifact.content).toContain("- Suggested Action: Confirm the intended plane/link type with the operator and update the source or structured input to match that decision.")
  })

  test("does not project confirmation packets for non-unresolved pending items", () => {
    const input = createScn01SingleRackConnectivityFixture()
    const summary = buildDesignGapReport({
      input,
      issues: [],
      pendingConfirmationItems: [
        {
          id: "template-plane-type-conflict|server-a:eth0|switch-a:xe-0/0/1",
          kind: "template-plane-type-conflict",
          severity: "warning",
          title: "template plane type conflict requires confirmation",
          detail: "Should not project because this item is no longer unresolved.",
          confidenceState: "confirmed",
          subjectType: "link",
          subjectId: "link-server-a-switch-a",
          entityRefs: ["link:link-server-a-switch-a"],
          sourceRefs: [],
          endpointA: { deviceName: "server-a", portName: "eth0" },
          endpointB: { deviceName: "switch-a", portName: "xe-0/0/1" },
        },
      ],
    })

    expect(summary.confirmationPackets).toEqual([])
    expect(summary.unresolvedItems).toEqual([])
  })
})

import { describe, expect, test } from "bun:test"

import type { ArtifactType } from "../../domain"
import { createScn01SingleRackConnectivityFixture } from "../../scenarios/fixtures"
import { validateCloudSolutionModel } from "../../validators"
import { buildArtifactBundleExport } from "./build-artifact-bundle"

describe("buildArtifactBundleExport", () => {
  test("builds a ready bundle with requested artifacts and review report", () => {
    const input = createScn01SingleRackConnectivityFixture()
    const bundle = buildArtifactBundleExport({
      input,
      issues: validateCloudSolutionModel(input),
    })

    expect(bundle.exportReady).toBe(true)
    expect(bundle.reviewRequired).toBe(false)
    expect(bundle.requestedArtifactTypes).toEqual([
      "device-cabling-table",
      "device-port-plan",
      "device-port-connection-table",
      "ip-allocation-table",
    ])
    expect(bundle.includedArtifactNames).toEqual([
      "artifact-bundle-index.md",
      "design-assumptions-and-gaps.md",
      "device-cabling-table.md",
      "device-port-plan.md",
      "port-connection-table.md",
      "ip-allocation-table.md",
    ])
    expect(bundle.bundleIndex.content).toContain("Export Ready: yes")
  })

  test("builds a blocked bundle when requested artifacts are incomplete", () => {
    const baseInput = createScn01SingleRackConnectivityFixture()
    const input = {
      ...baseInput,
      allocations: [],
    }
    const bundle = buildArtifactBundleExport({
      input,
      issues: validateCloudSolutionModel(input),
    })

    expect(bundle.exportReady).toBe(false)
    expect(bundle.reviewRequired).toBe(true)
    expect(bundle.validationSummary.blockingIssueCount).toBeGreaterThan(0)
    expect(bundle.reviewSummary.blockingGapCount).toBeGreaterThan(0)
    expect(bundle.artifacts.find((artifact) => artifact.name === "ip-allocation-table.md")?.content).toContain("Status: blocked")
  })

  test("keeps IP-only bundles export-ready when unrelated physical facts are inferred", () => {
    const baseInput = createScn01SingleRackConnectivityFixture()
    const input = {
      ...baseInput,
      requirement: {
        ...baseInput.requirement,
        artifactRequests: ["ip-allocation-table"] as ArtifactType[],
      },
      racks: [
        {
          ...baseInput.racks[0]!,
          statusConfidence: "inferred" as const,
        },
      ],
    }
    const bundle = buildArtifactBundleExport({
      input,
      issues: validateCloudSolutionModel(input),
    })

    expect(bundle.exportReady).toBe(true)
    expect(bundle.reviewRequired).toBe(false)
    expect(bundle.requestedArtifactTypes).toEqual(["ip-allocation-table"])
  })

  test("keeps physical-only bundles export-ready when unrelated network facts are inferred", () => {
    const baseInput = createScn01SingleRackConnectivityFixture()
    const input = {
      ...baseInput,
      requirement: {
        ...baseInput.requirement,
        artifactRequests: ["device-cabling-table"] as ArtifactType[],
      },
      segments: [
        {
          ...baseInput.segments[0]!,
          statusConfidence: "inferred" as const,
        },
      ],
    }
    const bundle = buildArtifactBundleExport({
      input,
      issues: validateCloudSolutionModel(input),
    })

    expect(bundle.exportReady).toBe(true)
    expect(bundle.reviewRequired).toBe(false)
    expect(bundle.requestedArtifactTypes).toEqual(["device-cabling-table"])
  })

  test("does not mark IP-only bundles as review-required for unrelated physical blocking issues", () => {
    const baseInput = createScn01SingleRackConnectivityFixture()
    const input = {
      ...baseInput,
      requirement: {
        ...baseInput.requirement,
        artifactRequests: ["ip-allocation-table"] as ArtifactType[],
      },
      links: [
        {
          ...baseInput.links[0]!,
          endpointA: { portId: "port-missing" },
        },
      ],
    }
    const bundle = buildArtifactBundleExport({
      input,
      issues: validateCloudSolutionModel(input),
    })

    expect(bundle.validationSummary.valid).toBe(false)
    expect(bundle.exportReady).toBe(false)
    expect(bundle.reviewRequired).toBe(false)
    expect(bundle.reviewSummary.blockingGapCount).toBe(0)
  })

  test("does not mark physical-only bundles as review-required for unrelated network blocking issues", () => {
    const baseInput = createScn01SingleRackConnectivityFixture()
    const input = {
      ...baseInput,
      requirement: {
        ...baseInput.requirement,
        artifactRequests: ["device-cabling-table"] as ArtifactType[],
      },
      allocations: [
        {
          ...baseInput.allocations[0]!,
          ipAddress: "999.10.0.1",
        },
      ],
    }
    const bundle = buildArtifactBundleExport({
      input,
      issues: validateCloudSolutionModel(input),
    })

    expect(bundle.validationSummary.valid).toBe(false)
    expect(bundle.exportReady).toBe(false)
    expect(bundle.reviewRequired).toBe(false)
    expect(bundle.reviewSummary.blockingGapCount).toBe(0)
  })

  test("includes pending confirmation items in bundle review summary when provided", () => {
    const input = createScn01SingleRackConnectivityFixture()
    const linkId = input.links[0]!.id
    const endpointAPortId = input.ports[0]!.id
    const endpointBPortId = input.ports[1]!.id
    const documentSource = {
      kind: "document" as const,
      ref: "fixtures/cabling-template.xlsx",
      note: "Cable planning template",
    }
    const bundle = buildArtifactBundleExport({
      input,
      issues: validateCloudSolutionModel(input),
      pendingConfirmationItems: [
        {
          id: "template-plane-type-conflict|server-a:eth0|switch-a:1/1",
          kind: "template-plane-type-conflict",
          severity: "warning",
          title: "template plane type conflict requires confirmation",
          detail: "Workbook-derived link server-a:eth0 ↔ switch-a:1/1 resolved conflicting explicit plane types (storage vs business); preserving this connection as ambiguous and requiring project confirmation.",
          confidenceState: "unresolved",
          subjectType: "link",
          subjectId: linkId,
          entityRefs: [
            `link:${linkId}`,
            `port:${endpointAPortId}`,
            `port:${endpointBPortId}`,
          ],
          sourceRefs: [documentSource],
        },
      ],
    })

    expect(bundle.reviewRequired).toBe(true)
    expect(bundle.reviewSummary.unresolvedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "template plane type conflict requires confirmation",
          confidenceState: "unresolved",
        }),
      ]),
    )
    expect(bundle.reviewSummary.confirmationPackets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "template-plane-type-conflict|server-a:eth0|switch-a:1/1",
          requiredDecision: "Confirm the intended plane/link type for the affected connection ↔ the affected connection, then update the source/structured input accordingly.",
        }),
      ]),
    )
  })
})

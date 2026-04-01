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
})

import { describe, expect, test } from "bun:test"

import type { CloudSolutionSliceInput, ValidationIssue } from "../../domain"
import { buildIpAllocationTableArtifact } from "./build-ip-allocation-table"

function createBaseSliceInput(): CloudSolutionSliceInput {
  return {
    requirement: {
      id: "req-ip-1",
      projectName: "IP Table Example",
      scopeType: "cloud",
      artifactRequests: ["ip-allocation-table"],
      sourceRefs: [],
      statusConfidence: "confirmed",
    },
    devices: [],
    racks: [],
    ports: [],
    links: [],
    segments: [
      {
        id: "segment-management",
        name: "management",
        segmentType: "mgmt",
        cidr: "10.0.0.0/24",
        gateway: "10.0.0.1",
        purpose: "management",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    allocations: [
      {
        id: "allocation-management-gateway",
        segmentId: "segment-management",
        allocationType: "gateway",
        ipAddress: "10.0.0.1",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
      {
        id: "allocation-service-1",
        segmentId: "segment-management",
        allocationType: "service",
        ipAddress: "10.0.0.10",
        hostname: "svc-1",
        purpose: "service-endpoint",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
  }
}

describe("buildIpAllocationTableArtifact", () => {
  test("builds a ready markdown table when there are no blocking issues", () => {
    const artifact = buildIpAllocationTableArtifact({
      input: createBaseSliceInput(),
      issues: [],
    })

    expect(artifact.name).toBe("ip-allocation-table.md")
    expect(artifact.content).toContain("Status: ready")
    expect(artifact.content).toContain("| Allocation ID | Segment | CIDR | Type | IP Address | Consumer | Gateway | Purpose |")
    expect(artifact.content).toContain("allocation-service-1")
    expect(artifact.content).toContain("10.0.0.10")
  })

  test("builds a blocked summary when blocking issues exist", () => {
    const issues: ValidationIssue[] = [
      {
        id: "segment_cidr_required:segment:segment-management",
        severity: "blocking",
        code: "segment_cidr_required",
        message: "Segment segment-management requires a CIDR for type mgmt.",
        subjectType: "segment",
        subjectId: "segment-management",
        entityRefs: ["segment:segment-management"],
        blocking: true,
      },
    ]

    const baseInput = createBaseSliceInput()
    const artifact = buildIpAllocationTableArtifact({
      input: {
        ...baseInput,
        allocations: [],
      },
      issues,
    })

    expect(artifact.content).toContain("Status: blocked")
    expect(artifact.content).toContain("## Blocking Conditions")
    expect(artifact.content).toContain("segment_cidr_required")
  })
})

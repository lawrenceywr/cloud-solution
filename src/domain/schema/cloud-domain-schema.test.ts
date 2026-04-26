import { describe, expect, test } from "bun:test"

import {
  ArtifactBundleExportSchema,
  CandidateFactConfirmationSummarySchema,
  CandidateFactSchema,
  CloudSolutionSliceInputSchema,
  CloudSolutionModelSchema,
  DraftInputStateSchema,
  DesignGapSummarySchema,
  DesignReviewItemRowSchema,
  DeviceCablingTableRowSchema,
  DevicePortPlanRowSchema,
  DeviceSchema,
  IpAllocationSchema,
  IpAllocationTableRowSchema,
  LinkSchema,
  NetworkSegmentSchema,
  PortConnectionTableRowSchema,
  PortSchema,
  RackSchema,
  SolutionRequirementSchema,
  ValidationSummarySchema,
  ValidationIssueSchema,
} from "./cloud-domain-schema"

describe("cloud domain schemas", () => {
  test("accepts a minimal solution requirement", () => {
    const result = SolutionRequirementSchema.parse({
      id: "req-1",
      projectName: "Scaffold Example",
      scopeType: "data-center",
    })

    expect(result.statusConfidence).toBe("confirmed")
    expect(result.artifactRequests).toEqual([])
  })

  test("rejects an invalid device", () => {
    expect(() =>
      DeviceSchema.parse({
        id: "device-1",
        role: "switch",
      }),
    ).toThrow()
  })

  test("builds a minimal cloud solution model", () => {
    const requirement = SolutionRequirementSchema.parse({
      id: "req-2",
      projectName: "Cloud Segment Example",
      scopeType: "cloud",
    })

    const segment = NetworkSegmentSchema.parse({
      id: "segment-1",
      name: "management",
      segmentType: "subnet",
      purpose: "management",
    })

    const result = CloudSolutionModelSchema.parse({
      requirement,
      segments: [segment],
    })

    expect(result.requirement.projectName).toBe("Cloud Segment Example")
    expect(result.segments).toHaveLength(1)
  })

  test("builds a minimal slice input and row contract", () => {
    const result = CloudSolutionSliceInputSchema.parse({
      requirement: {
        id: "req-3",
        projectName: "Slice Input Example",
        scopeType: "cloud",
      },
      segments: [
        {
          id: "segment-2",
          name: "service",
          segmentType: "subnet",
          cidr: "10.20.0.0/24",
          gateway: "10.20.0.1",
          purpose: "service",
        },
      ],
      allocations: [
        {
          id: "alloc-1",
          segmentId: "segment-2",
          allocationType: "gateway",
          ipAddress: "10.20.0.1",
        },
      ],
      ports: [
        {
          id: "port-1",
          deviceId: "device-1",
          name: "eth0",
        },
        {
          id: "port-2",
          deviceId: "device-2",
          name: "eth0",
        },
      ],
      links: [
        {
          id: "link-1",
          endpointA: { portId: "port-1" },
          endpointB: { portId: "port-2" },
        },
      ],
    })

    const issue = ValidationIssueSchema.parse({
      id: "segment_cidr_required:segment:segment-2:segments[].cidr",
      severity: "blocking",
      code: "segment_cidr_required",
      message: "Segment segment-2 requires a CIDR for type subnet.",
      subjectType: "segment",
      subjectId: "segment-2",
      path: "segments[].cidr",
      entityRefs: ["segment:segment-2"],
      blocking: true,
    })

    const allocation = IpAllocationSchema.parse({
      id: "alloc-1",
      segmentId: "segment-2",
      allocationType: "gateway",
      ipAddress: "10.20.0.1",
    })

    const port = PortSchema.parse({
      id: "port-1",
      deviceId: "device-1",
      name: "eth0",
    })

    const link = LinkSchema.parse({
      id: "link-1",
      endpointA: { portId: "port-1" },
      endpointB: { portId: "port-2" },
    })

    const row = IpAllocationTableRowSchema.parse({
      allocationId: "alloc-1",
      segmentId: "segment-2",
      segmentName: "service",
      segmentCidr: "10.20.0.0/24",
      allocationType: "gateway",
      ipAddress: "10.20.0.1",
      consumerRef: "device-1 / eth0",
      gateway: "10.20.0.1",
      purpose: "gateway",
    })

    const portConnectionRow = PortConnectionTableRowSchema.parse({
      linkId: "link-1",
      endpointADeviceName: "device-a",
      endpointADeviceId: "device-1",
      endpointAPortName: "eth0",
      endpointAPortId: "port-1",
      endpointBDeviceName: "device-b",
      endpointBDeviceId: "device-2",
      endpointBPortName: "eth1",
      endpointBPortId: "port-2",
      purpose: "data-plane",
    })

    expect(result.segments).toHaveLength(1)
    expect(result.allocations).toHaveLength(1)
    expect(result.ports).toHaveLength(2)
    expect(result.links).toHaveLength(1)
    expect(issue.subjectType).toBe("segment")
    expect(allocation.allocationType).toBe("gateway")
    expect(port.name).toBe("eth0")
    expect(link.id).toBe("link-1")
    expect(row.segmentId).toBe("segment-2")
    expect(portConnectionRow.linkId).toBe("link-1")
  })

  test("accepts design review rows for assumptions and gaps", () => {
    const assumptionRow = DesignReviewItemRowSchema.parse({
      kind: "assumption",
      severity: "warning",
      subjectType: "device",
      subjectId: "device-a",
      title: "Assumed device fact",
      detail: "device device-a is currently inferred and should be reviewed before export.",
      confidenceState: "inferred",
      entityRefs: ["device:device-a"],
      sourceRefs: [],
    })

    const gapRow = DesignReviewItemRowSchema.parse({
      kind: "gap",
      severity: "blocking",
      subjectType: "segment",
      subjectId: "segment-a",
      title: "Blocking validation gap",
      detail: "Segment segment-a is missing required CIDR information.",
      entityRefs: ["segment:segment-a"],
      sourceRefs: [],
    })

    expect(assumptionRow.kind).toBe("assumption")
    expect(gapRow.severity).toBe("blocking")
  })

  test("accepts candidate fact summaries and confirmation summaries", () => {
    const inputState = DraftInputStateSchema.parse("candidate_fact_draft")
    const candidateFact = CandidateFactSchema.parse({
      entityRef: "segment:segment-a",
      subjectType: "segment",
      subjectId: "segment-a",
      statusConfidence: "inferred",
      sourceRefs: [
        {
          kind: "document",
          ref: "docs/network-diagram.pdf",
          note: "Extracted from supporting document",
        },
      ],
      requiresConfirmation: true,
    })
    const confirmationSummary = CandidateFactConfirmationSummarySchema.parse({
      requestedEntityRefs: ["segment:segment-a"],
      confirmedEntityRefs: [],
      pendingEntityRefs: ["segment:segment-a"],
      missingEntityRefs: [],
    })

    expect(inputState).toBe("candidate_fact_draft")
    expect(candidateFact.sourceRefs[0]?.kind).toBe("document")
    expect(confirmationSummary.pendingEntityRefs).toEqual(["segment:segment-a"])
  })

  test("accepts validation, review, and bundle export summaries", () => {
    const validationSummary = ValidationSummarySchema.parse({
      valid: true,
      blockingIssueCount: 0,
      warningCount: 1,
      informationalIssueCount: 0,
      issues: [],
    })

    const reviewSummary = DesignGapSummarySchema.parse({
      reviewRequired: true,
      blockingGapCount: 0,
      assumptionCount: 1,
      unresolvedItemCount: 0,
      assumptions: [
        {
          kind: "assumption",
          severity: "warning",
          subjectType: "device",
          subjectId: "device-a",
          title: "Assumed device fact",
          detail: "device device-a is currently inferred and should be reviewed before export.",
          confidenceState: "inferred",
          entityRefs: ["device:device-a"],
          sourceRefs: [],
        },
      ],
      gaps: [],
      unresolvedItems: [],
      artifact: {
        name: "design-assumptions-and-gaps.md",
        mimeType: "text/markdown",
        content: "# Design Assumptions and Gaps",
      },
    })

    const bundleExport = ArtifactBundleExportSchema.parse({
      exportReady: false,
      reviewRequired: true,
      requestedArtifactTypes: ["device-cabling-table", "ip-allocation-table"],
      includedArtifactNames: [
        "artifact-bundle-index.md",
        "design-assumptions-and-gaps.md",
        "device-cabling-table.md",
        "ip-allocation-table.md",
      ],
      validationSummary,
      reviewSummary,
      bundleIndex: {
        name: "artifact-bundle-index.md",
        mimeType: "text/markdown",
        content: "# Artifact Bundle Index",
      },
      artifacts: [
        {
          name: "artifact-bundle-index.md",
          mimeType: "text/markdown",
          content: "# Artifact Bundle Index",
        },
        {
          name: "design-assumptions-and-gaps.md",
          mimeType: "text/markdown",
          content: "# Design Assumptions and Gaps",
        },
      ],
    })

    expect(validationSummary.valid).toBe(true)
    expect(reviewSummary.assumptionCount).toBe(1)
    expect(reviewSummary.confirmationPackets).toEqual([])
    expect(bundleExport.includedArtifactNames).toContain("artifact-bundle-index.md")
  })

  test("accepts an SCN-01 physical slice input and row contracts", () => {
    const rack = RackSchema.parse({
      id: "rack-1",
      name: "rack-a",
      uHeight: 42,
    })

    const result = CloudSolutionSliceInputSchema.parse({
      requirement: {
        id: "req-scn-01",
        projectName: "Single Rack Basic Connectivity",
        scopeType: "data-center",
        artifactRequests: ["device-cabling-table", "device-port-plan"],
      },
      racks: [rack],
      devices: [
        {
          id: "device-switch-a",
          name: "switch-a",
          role: "switch",
          rackId: "rack-1",
          rackPosition: 1,
          rackUnitHeight: 1,
        },
        {
          id: "device-server-a",
          name: "server-a",
          role: "server",
          rackId: "rack-1",
          rackPosition: 10,
          rackUnitHeight: 2,
        },
      ],
      ports: [
        {
          id: "port-switch-a-1",
          deviceId: "device-switch-a",
          name: "eth0",
        },
        {
          id: "port-server-a-1",
          deviceId: "device-server-a",
          name: "eth1",
        },
      ],
      links: [
        {
          id: "link-rack-a-1",
          endpointA: { portId: "port-switch-a-1" },
          endpointB: { portId: "port-server-a-1" },
          purpose: "server-uplink",
        },
      ],
    })

    const cablingRow = DeviceCablingTableRowSchema.parse({
      linkId: "link-rack-a-1",
      endpointARackName: "rack-a",
      endpointARackId: "rack-1",
      endpointARackPosition: 1,
      endpointADeviceName: "switch-a",
      endpointADeviceId: "device-switch-a",
      endpointAPortName: "eth0",
      endpointAPortId: "port-switch-a-1",
      endpointBRackName: "rack-a",
      endpointBRackId: "rack-1",
      endpointBRackPosition: 10,
      endpointBDeviceName: "server-a",
      endpointBDeviceId: "device-server-a",
      endpointBPortName: "eth1",
      endpointBPortId: "port-server-a-1",
      purpose: "server-uplink",
    })

    const portPlanRow = DevicePortPlanRowSchema.parse({
      rackName: "rack-a",
      rackId: "rack-1",
      rackPosition: 10,
      rackUnitHeight: 2,
      deviceName: "server-a",
      deviceId: "device-server-a",
      portName: "eth1",
      portId: "port-server-a-1",
      portPurpose: "server-uplink",
      connectionRefs: "link-rack-a-1",
      peerRefs: "switch-a (device-switch-a) / eth0 (port-switch-a-1)",
    })

    expect(result.racks).toHaveLength(1)
    expect(result.devices).toHaveLength(2)
    expect(result.links).toHaveLength(1)
    expect(cablingRow.endpointBRackPosition).toBe(10)
    expect(portPlanRow.rackUnitHeight).toBe(2)
  })
})

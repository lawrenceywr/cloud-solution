import { describe, expect, test } from "bun:test"

import type { CloudSolutionSliceInput, ValidationIssue } from "../../domain"
import { buildDevicePortPlanArtifact } from "./build-device-port-plan"

function createBaseSliceInput(): CloudSolutionSliceInput {
  return {
    requirement: {
      id: "req-port-plan-1",
      projectName: "Device Port Plan Example",
      scopeType: "data-center",
      artifactRequests: ["device-port-plan"],
      sourceRefs: [],
      statusConfidence: "confirmed",
    },
    devices: [
      {
        id: "device-switch-a",
        name: "switch-a",
        role: "switch",
        rackId: "rack-a",
        rackPosition: 1,
        rackUnitHeight: 1,
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
      {
        id: "device-server-a",
        name: "server-a",
        role: "server",
        rackId: "rack-a",
        rackPosition: 10,
        rackUnitHeight: 2,
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    racks: [
      {
        id: "rack-a",
        name: "rack-a",
        uHeight: 42,
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    ports: [
      {
        id: "port-switch-a-1",
        deviceId: "device-switch-a",
        name: "eth0",
        purpose: "uplink",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
      {
        id: "port-server-a-1",
        deviceId: "device-server-a",
        name: "eth1",
        purpose: "server-uplink",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
      {
        id: "port-server-a-2",
        deviceId: "device-server-a",
        name: "eth2",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    links: [
      {
        id: "link-a",
        endpointA: { portId: "port-switch-a-1" },
        endpointB: { portId: "port-server-a-1" },
        purpose: "server-uplink",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    segments: [],
    allocations: [],
  }
}

describe("buildDevicePortPlanArtifact", () => {
  test("builds a ready markdown table from explicit ports", () => {
    const artifact = buildDevicePortPlanArtifact({
      input: createBaseSliceInput(),
      issues: [],
    })

    expect(artifact.name).toBe("device-port-plan.md")
    expect(artifact.content).toContain("Status: ready")
    expect(artifact.content).toContain(
      "| Rack | Rack Units | Device | Port | Purpose | Connections | Peer Endpoints | Redundancy Groups |",
    )
    expect(artifact.content).toContain("switch-a (device-switch-a)")
    expect(artifact.content).toContain("port-server-a-2")
    expect(artifact.content).toContain("link-a")
  })

  test("builds a blocked summary when rack validation issues exist", () => {
    const issues: ValidationIssue[] = [
      {
        id: "rack_position_overlap:rack:rack-a:devices[].rackPosition",
        severity: "blocking",
        code: "rack_position_overlap",
        message: "Devices device-switch-a and device-server-a overlap in rack rack-a at units 1-1.",
        subjectType: "rack",
        subjectId: "rack-a",
        path: "devices[].rackPosition",
        entityRefs: ["rack:rack-a", "device:device-switch-a", "device:device-server-a"],
        blocking: true,
      },
    ]

    const artifact = buildDevicePortPlanArtifact({
      input: createBaseSliceInput(),
      issues,
    })

    expect(artifact.content).toContain("Status: blocked")
    expect(artifact.content).toContain("## Blocking Conditions")
    expect(artifact.content).toContain("rack_position_overlap")
  })
})

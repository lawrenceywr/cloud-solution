import { describe, expect, test } from "bun:test"

import type { CloudSolutionSliceInput, ValidationIssue } from "../../domain"
import { buildDeviceCablingTableArtifact } from "./build-device-cabling-table"

function createBaseSliceInput(): CloudSolutionSliceInput {
  return {
    requirement: {
      id: "req-cabling-1",
      projectName: "Device Cabling Example",
      scopeType: "data-center",
      artifactRequests: ["device-cabling-table"],
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
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
      {
        id: "port-server-a-1",
        deviceId: "device-server-a",
        name: "eth1",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    links: [
      {
        id: "link-a",
        endpointA: { portId: "port-server-a-1" },
        endpointB: { portId: "port-switch-a-1" },
        purpose: "server-uplink",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    segments: [],
    allocations: [],
  }
}

describe("buildDeviceCablingTableArtifact", () => {
  test("builds a ready markdown table from explicit SCN-01 rack links", () => {
    const artifact = buildDeviceCablingTableArtifact({
      input: createBaseSliceInput(),
      issues: [],
    })

    expect(artifact.name).toBe("device-cabling-table.md")
    expect(artifact.content).toContain("Status: ready")
    expect(artifact.content).toContain(
      "| Link ID | Endpoint A Rack | Endpoint A Device | Endpoint A Port | Endpoint B Rack | Endpoint B Device | Endpoint B Port | Purpose | Link Type | Redundancy Group | Cable ID | Cable Name | Cable Spec | Cable Count |",
    )
    expect(artifact.content).toContain("rack-a (rack-a) U1")
    expect(artifact.content).toContain("server-a (device-server-a)")
  })

  test("builds a blocked summary when rack validation issues exist", () => {
    const issues: ValidationIssue[] = [
      {
        id: "device_rack_required:device:device-switch-a:devices[].rackId",
        severity: "blocking",
        code: "device_rack_required",
        message: "Device device-switch-a requires a rack reference for physical planning artifacts.",
        subjectType: "device",
        subjectId: "device-switch-a",
        path: "devices[].rackId",
        entityRefs: ["device:device-switch-a"],
        blocking: true,
      },
    ]

    const artifact = buildDeviceCablingTableArtifact({
      input: createBaseSliceInput(),
      issues,
    })

    expect(artifact.content).toContain("Status: blocked")
    expect(artifact.content).toContain("## Blocking Conditions")
    expect(artifact.content).toContain("device_rack_required")
  })
})

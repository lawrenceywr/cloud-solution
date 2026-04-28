import { describe, expect, test } from "bun:test"

import type { CloudSolutionSliceInput, ValidationIssue } from "../../domain"
import { buildDeviceRackLayoutArtifact } from "./build-device-rack-layout"

function createBaseSliceInput(): CloudSolutionSliceInput {
  return {
    requirement: {
      id: "req-rack-layout-1",
      projectName: "Device Rack Layout Example",
      scopeType: "data-center",
      artifactRequests: ["device-rack-layout"],
      sourceRefs: [],
      statusConfidence: "confirmed",
    },
    devices: [
      {
        id: "device-tor-a",
        name: "tor-a",
        role: "switch",
        rackId: "rack-a",
        rackPosition: 1,
        rackUnitHeight: 1,
        highAvailabilityGroup: "tor-pair-a",
        highAvailabilityRole: "primary",
        powerWatts: 350,
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
        powerWatts: 600,
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    racks: [
      {
        id: "rack-a",
        name: "rack-a",
        uHeight: 42,
        maxPowerKw: 7,
        adjacentRackIds: [],
        adjacentColumnRackIds: [],
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    ports: [],
    links: [],
    segments: [],
    allocations: [],
  }
}

describe("buildDeviceRackLayoutArtifact", () => {
  test("builds a ready markdown table from explicit rack placements", () => {
    const artifact = buildDeviceRackLayoutArtifact({
      input: createBaseSliceInput(),
      issues: [],
    })

    expect(artifact.name).toBe("device-rack-layout.md")
    expect(artifact.content).toContain("Status: ready")
    expect(artifact.content).toContain(
      "| Rack | Rack Units | Device | Role | HA Group | HA Role | Power (W) |",
    )
    expect(artifact.content).toContain("tor-a (device-tor-a)")
    expect(artifact.content).toContain("350")
  })

  test("builds a blocked summary when rack validation issues exist", () => {
    const issues: ValidationIssue[] = [
      {
        id: "rack_power_threshold_exceeded:rack:rack-a:racks[].maxPowerKw",
        severity: "blocking",
        code: "rack_power_threshold_exceeded",
        message: "Rack rack-a exceeds the 80% power threshold.",
        subjectType: "rack",
        subjectId: "rack-a",
        path: "racks[].maxPowerKw",
        entityRefs: ["rack:rack-a"],
        blocking: true,
      },
    ]

    const artifact = buildDeviceRackLayoutArtifact({
      input: createBaseSliceInput(),
      issues,
    })

    expect(artifact.content).toContain("Status: blocked")
    expect(artifact.content).toContain("rack_power_threshold_exceeded")
  })
})

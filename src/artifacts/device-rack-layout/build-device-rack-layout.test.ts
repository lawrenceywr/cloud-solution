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

  test("surfaces adjacent empty rack power-sharing reserve conventions", () => {
    const input = {
      ...createBaseSliceInput(),
      racks: [
        {
          ...createBaseSliceInput().racks[0]!,
          adjacentRackIds: ["rack-b"],
        },
        {
          id: "rack-b",
          name: "rack-b",
          uHeight: 42,
          maxPowerKw: 7,
          adjacentRackIds: ["rack-a"],
          adjacentColumnRackIds: [],
          sourceRefs: [],
          statusConfidence: "confirmed" as const,
        },
      ],
      devices: createBaseSliceInput().devices.map((device) =>
        device.id === "device-server-a"
          ? {
              ...device,
              powerWatts: 5300,
            }
          : device,
      ),
    }
    const artifact = buildDeviceRackLayoutArtifact({
      input,
      issues: [],
    })

    expect(artifact.content).toContain("## Power Sharing Reserve")
    expect(artifact.content).toContain("rack-b (rack-b)")
    expect(artifact.content).toContain("adjacent empty rack reserved for power-sharing")
  })

  test("does not surface a power reserve for racks containing excluded-role devices", () => {
    const baseInput = createBaseSliceInput()
    const input = {
      ...baseInput,
      racks: [
        {
          ...baseInput.racks[0]!,
          adjacentRackIds: ["rack-b"],
        },
        {
          id: "rack-b",
          name: "rack-b",
          uHeight: 42,
          maxPowerKw: 7,
          adjacentRackIds: ["rack-a"],
          adjacentColumnRackIds: [],
          sourceRefs: [],
          statusConfidence: "confirmed" as const,
        },
      ],
      devices: [
        ...baseInput.devices.map((device) =>
          device.id === "device-server-a"
            ? {
                ...device,
                powerWatts: 5300,
              }
            : device,
        ),
        {
          id: "device-cable-manager-b",
          name: "cable-manager-b",
          role: "cable-manager",
          rackId: "rack-b",
          rackPosition: 1,
          rackUnitHeight: 1,
          sourceRefs: [],
          statusConfidence: "confirmed" as const,
        },
      ],
    }
    const artifact = buildDeviceRackLayoutArtifact({
      input,
      issues: [],
    })

    expect(artifact.content).not.toContain("## Power Sharing Reserve")
    expect(artifact.content).not.toContain("adjacent empty rack reserved for power-sharing")
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

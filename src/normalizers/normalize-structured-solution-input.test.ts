import { describe, expect, test } from "bun:test"

import { validateCloudSolutionModel } from "../validators"
import {
  normalizeSolutionToolInput,
  normalizeStructuredSolutionInput,
} from "./normalize-structured-solution-input"

describe("normalizeStructuredSolutionInput", () => {
  test("normalizes structured physical and network input into the canonical slice", () => {
    const result = normalizeStructuredSolutionInput({
      requirement: {
        id: "req-structured-1",
        projectName: "Structured Input Example",
        scopeType: "data-center",
        artifactRequests: ["device-cabling-table", "ip-allocation-table"],
      },
      structuredInput: {
        racks: [
          {
            name: "Rack A",
            uHeight: 42,
          },
        ],
        devices: [
          {
            name: "Switch A",
            role: "switch",
            rackName: "Rack A",
            rackPosition: 1,
            rackUnitHeight: 1,
            ports: [
              {
                name: "eth0",
              },
            ],
          },
          {
            name: "Server A",
            role: "server",
            rackName: "Rack A",
            rackPosition: 10,
            rackUnitHeight: 2,
            ports: [
              {
                name: "eth0",
              },
            ],
          },
        ],
        links: [
          {
            endpointA: {
              deviceName: "Switch A",
              portName: "eth0",
            },
            endpointB: {
              deviceName: "Server A",
              portName: "eth0",
            },
            purpose: "uplink",
          },
        ],
        segments: [
          {
            name: "Management",
            segmentType: "mgmt",
            cidr: "10.40.0.0/24",
            gateway: "10.40.0.1",
            purpose: "management",
          },
        ],
        allocations: [
          {
            segmentName: "Management",
            allocationType: "device",
            ipAddress: "10.40.0.10",
            deviceName: "Server A",
            interfaceName: "eth0",
          },
        ],
      },
    })

    expect(result.racks[0]?.id).toBe("rack-rack-a")
    expect(result.devices[0]?.id).toBe("device-switch-a")
    expect(result.ports[0]?.id).toBe("port-switch-a-eth0")
    expect(result.links[0]?.endpointB.portId).toBe("port-server-a-eth0")
    expect(result.segments[0]?.id).toBe("segment-management")
    expect(result.allocations[0]?.deviceId).toBe("device-server-a")
  })

  test("preserves ambiguity by normalizing unresolved references into validator-visible ids", () => {
    const normalized = normalizeStructuredSolutionInput({
      requirement: {
        id: "req-structured-2",
        projectName: "Structured Ambiguity Example",
        scopeType: "data-center",
        artifactRequests: ["device-cabling-table"],
      },
      structuredInput: {
        racks: [
          {
            name: "Rack A",
            uHeight: 42,
          },
        ],
        devices: [
          {
            name: "Switch A",
            role: "switch",
            rackName: "Rack A",
            rackPosition: 1,
            rackUnitHeight: 1,
            ports: [
              {
                name: "eth0",
              },
            ],
          },
        ],
        links: [
          {
            endpointA: {
              deviceName: "Switch A",
              portName: "eth0",
            },
            endpointB: {
              deviceName: "Missing Server",
              portName: "eth0",
            },
          },
        ],
        segments: [],
        allocations: [],
      },
    })
    const issues = validateCloudSolutionModel(normalized)

    expect(issues.map((issue) => issue.code)).toContain("link_port_missing")
  })

  test("passes through canonical tool input unchanged", () => {
    const result = normalizeSolutionToolInput({
      requirement: {
        id: "req-canonical-1",
        projectName: "Canonical Pass Through",
        scopeType: "cloud",
      },
      devices: [],
      racks: [],
      ports: [],
      links: [],
      segments: [],
      allocations: [],
    })

    expect(result.requirement.projectName).toBe("Canonical Pass Through")
    expect(result.devices).toEqual([])
  })

  test("normalizes SCN-08 style high-reliability structured fields into canonical entities", () => {
    const result = normalizeStructuredSolutionInput({
      requirement: {
        id: "req-structured-hr-1",
        projectName: "Structured High Reliability Example",
        scopeType: "data-center",
        artifactRequests: ["device-rack-layout", "device-cabling-table"],
      },
      structuredInput: {
        racks: [
          {
            name: "Rack A",
            uHeight: 42,
            maxPowerKw: 7,
            adjacentRackIds: ["rack-rack-b"],
            adjacentColumnRackIds: ["rack-rack-c"],
          },
        ],
        devices: [
          {
            name: "ToR A",
            role: "switch",
            rackName: "Rack A",
            rackPosition: 1,
            rackUnitHeight: 1,
            highAvailabilityGroup: "tor-pair-a",
            highAvailabilityRole: "primary",
            powerWatts: 350,
            ports: [
              {
                name: "eth1/1",
                purpose: "server-business-a",
                portType: "business",
                portIndex: 1,
              },
            ],
          },
          {
            name: "Server A",
            role: "server",
            rackName: "Rack A",
            rackPosition: 10,
            rackUnitHeight: 2,
            powerWatts: 900,
            ports: [
              {
                name: "eth0",
                purpose: "business-a",
                portType: "business",
              },
            ],
          },
        ],
        links: [
          {
            endpointA: {
              deviceName: "ToR A",
              portName: "eth1/1",
            },
            endpointB: {
              deviceName: "Server A",
              portName: "eth0",
            },
            purpose: "server-a-business-primary",
            linkType: "business",
            redundancyGroup: "server-a-business-dual-home",
            cableId: "CAB-001",
            cableName: "server-a-business-a",
            cableSpec: "DAC-25G",
            cableCount: 1,
          },
        ],
        segments: [],
        allocations: [],
      },
    })

    expect(result.racks[0]?.maxPowerKw).toBe(7)
    expect(result.racks[0]?.adjacentRackIds).toEqual(["rack-rack-b"])
    expect(result.racks[0]?.adjacentColumnRackIds).toEqual(["rack-rack-c"])
    expect(result.devices[0]?.highAvailabilityGroup).toBe("tor-pair-a")
    expect(result.devices[0]?.highAvailabilityRole).toBe("primary")
    expect(result.devices[0]?.powerWatts).toBe(350)
    expect(result.ports[0]?.portType).toBe("business")
    expect(result.ports[0]?.portIndex).toBe(1)
    expect(result.links[0]?.linkType).toBe("business")
    expect(result.links[0]?.cableId).toBe("CAB-001")
    expect(result.links[0]?.cableName).toBe("server-a-business-a")
    expect(result.links[0]?.cableSpec).toBe("DAC-25G")
    expect(result.links[0]?.cableCount).toBe(1)
  })
})

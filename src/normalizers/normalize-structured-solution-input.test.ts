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
})

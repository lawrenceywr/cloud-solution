import type { CoordinatorInput } from "../types"

export function createCompleteCoordinatorInput(): CoordinatorInput {
  return {
    requirement: {
      id: "req-complete-coordinator",
      projectName: "Complete Coordinator Test Input",
      scopeType: "data-center",
      artifactRequests: [
        "device-cabling-table",
        "device-port-plan",
        "device-port-connection-table",
        "ip-allocation-table",
      ],
      sourceRefs: [],
      statusConfidence: "confirmed",
    },
    racks: [
      {
        id: "rack-a",
        name: "rack-a",
        uHeight: 42,
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
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
    ports: [
      {
        id: "port-switch-a-1",
        deviceId: "device-switch-a",
        name: "eth0",
        purpose: "server-uplink-a",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
      {
        id: "port-server-a-1",
        deviceId: "device-server-a",
        name: "eth0",
        purpose: "management",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    links: [
      {
        id: "link-server-a",
        endpointA: { portId: "port-switch-a-1" },
        endpointB: { portId: "port-server-a-1" },
        purpose: "server-a-uplink",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    segments: [
      {
        id: "segment-management",
        name: "management",
        segmentType: "mgmt",
        cidr: "10.10.0.0/24",
        gateway: "10.10.0.1",
        purpose: "management",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
    allocations: [
      {
        id: "allocation-gateway",
        segmentId: "segment-management",
        allocationType: "gateway",
        ipAddress: "10.10.0.1",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
      {
        id: "allocation-server-a",
        segmentId: "segment-management",
        allocationType: "device",
        ipAddress: "10.10.0.10",
        deviceId: "device-server-a",
        interfaceName: "eth0",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
  }
}

export function createIncompleteCoordinatorInput(): CoordinatorInput {
  return {
    requirement: {
      id: "req-incomplete-coordinator",
      projectName: "Incomplete Coordinator Test Input",
      scopeType: "data-center",
      artifactRequests: [
        "device-cabling-table",
        "ip-allocation-table",
      ],
      sourceRefs: [],
      statusConfidence: "confirmed",
    },
    racks: [],
    devices: [],
    ports: [],
    links: [],
    segments: [],
    allocations: [],
  }
}

export function createPartialCoordinatorInput(): CoordinatorInput {
  return {
    requirement: {
      id: "req-partial-coordinator",
      projectName: "Partial Coordinator Test Input",
      scopeType: "data-center",
      artifactRequests: [
        "device-cabling-table",
        "device-port-plan",
      ],
      sourceRefs: [],
      statusConfidence: "confirmed",
    },
    racks: [
      {
        id: "rack-a",
        name: "rack-a",
        uHeight: 42,
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ],
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
    ports: [],
    links: [],
    segments: [],
    allocations: [],
  }
}
import { describe, expect, test } from "bun:test"

import type {
  Conflict,
  Device,
  IpAllocation,
  Link,
  NetworkSegment,
  Port,
  Rack,
  SourceReference,
} from "../domain"
import {
  reconcileExtractedFacts,
  validateAllocationConflicts,
  validateDeviceConflicts,
  validateLinkConflicts,
  validateNetworkConflicts,
  validatePortConflicts,
} from "./reconcile-extracted-facts"

function createSourceRef(kind: SourceReference["kind"], ref: string): SourceReference {
  return { kind, ref }
}

function createDevice(
  id: string,
  overrides: Partial<Device> = {},
): Device {
  return {
    id,
    name: id,
    role: "switch",
    rackId: "rack-a",
    sourceRefs: [],
    statusConfidence: "confirmed",
    ...overrides,
  }
}

function createPort(
  id: string,
  deviceId: string,
  name: string,
  overrides: Partial<Port> = {},
): Port {
  return {
    id,
    deviceId,
    name,
    sourceRefs: [],
    statusConfidence: "confirmed",
    ...overrides,
  }
}

function createLink(
  id: string,
  endpointA: string,
  endpointB: string,
  overrides: Partial<Link> = {},
): Link {
  return {
    id,
    endpointA: { portId: endpointA },
    endpointB: { portId: endpointB },
    sourceRefs: [],
    statusConfidence: "confirmed",
    ...overrides,
  }
}

function createSegment(
  id: string,
  cidr: string,
  gateway: string,
  overrides: Partial<NetworkSegment> = {},
): NetworkSegment {
  return {
    id,
    name: id,
    segmentType: "mgmt",
    purpose: "management",
    cidr,
    gateway,
    sourceRefs: [],
    statusConfidence: "confirmed",
    ...overrides,
  }
}

function createAllocation(
  id: string,
  segmentId: string,
  ipAddress: string,
  allocationType: IpAllocation["allocationType"] = "device",
  overrides: Partial<IpAllocation> = {},
): IpAllocation {
  return {
    id,
    segmentId,
    allocationType,
    ipAddress,
    sourceRefs: [],
    statusConfidence: "confirmed",
    ...overrides,
  }
}

function createRack(id: string, name: string, overrides: Partial<Rack> = {}): Rack {
  return {
    id,
    name,
    sourceRefs: [],
    statusConfidence: "confirmed",
    ...overrides,
  }
}

describe("validateDeviceConflicts", () => {
  test("detects duplicate device IDs from multiple sources", () => {
    const devices: Device[] = [
      createDevice("sw1", {
        rackId: "rack1",
        sourceRefs: [createSourceRef("document", "doc1")],
      }),
      createDevice("sw1", {
        rackId: "rack2",
        sourceRefs: [createSourceRef("document", "doc2")],
      }),
    ]

    const conflicts = validateDeviceConflicts({ devices, sourceRefs: [] })

    expect(conflicts.length).toBeGreaterThan(0)
    const duplicateConflict = conflicts.find(c => c.conflictType === "duplicate_device")
    expect(duplicateConflict).toBeDefined()
    expect(duplicateConflict?.severity).toBe("blocking")
    expect(duplicateConflict?.message).toContain("sw1")
    expect(duplicateConflict?.message).toContain("2 times")
  })

  test("detects contradictory rackPosition", () => {
    const devices: Device[] = [
      createDevice("sw1", {
        rackId: "rack1",
        rackPosition: 5,
        sourceRefs: [createSourceRef("document", "doc1")],
      }),
      createDevice("sw1", {
        rackId: "rack1",
        rackPosition: 10,
        sourceRefs: [createSourceRef("document", "doc2")],
      }),
    ]

    const conflicts = validateDeviceConflicts({ devices, sourceRefs: [] })

    const positionConflict = conflicts.find(c =>
      c.conflictType === "contradictory_device_attribute"
      && c.attributes?.rackPosition != null,
    )
    expect(positionConflict).toBeDefined()
    expect(positionConflict?.severity).toBe("blocking")
    expect(positionConflict?.attributes?.rackPosition).toEqual(["5", "10"])
  })

  test("detects contradictory role", () => {
    const devices: Device[] = [
      createDevice("sw1", {
        role: "core",
        rackId: "rack1",
        sourceRefs: [createSourceRef("document", "doc1")],
      }),
      createDevice("sw1", {
        role: "access",
        rackId: "rack1",
        sourceRefs: [createSourceRef("document", "doc2")],
      }),
    ]

    const conflicts = validateDeviceConflicts({ devices, sourceRefs: [] })

    const roleConflict = conflicts.find(c =>
      c.conflictType === "contradictory_device_attribute"
      && c.attributes?.role != null,
    )
    expect(roleConflict).toBeDefined()
    expect(roleConflict?.severity).toBe("blocking")
    expect(roleConflict?.attributes?.role).toEqual(["core", "access"])
  })

  test("no conflicts when devices have same attributes", () => {
    const devices: Device[] = [
      createDevice("sw1", {
        rackId: "rack1",
        rackPosition: 5,
        role: "core",
        vendor: "cisco",
        model: "c9200",
        redundancyIntent: "single-homed",
        sourceRefs: [createSourceRef("document", "doc1")],
      }),
      createDevice("sw1", {
        rackId: "rack1",
        rackPosition: 5,
        role: "core",
        vendor: "cisco",
        model: "c9200",
        redundancyIntent: "single-homed",
        sourceRefs: [createSourceRef("document", "doc2")],
      }),
    ]

    const conflicts = validateDeviceConflicts({ devices, sourceRefs: [] })

    const attributeConflicts = conflicts.filter(c =>
      c.conflictType === "contradictory_device_attribute",
    )
    expect(attributeConflicts).toHaveLength(0)
  })

  test("detects contradictory vendor as warning", () => {
    const devices: Device[] = [
      createDevice("sw1", {
        vendor: "cisco",
        rackId: "rack1",
        sourceRefs: [createSourceRef("document", "doc1")],
      }),
      createDevice("sw1", {
        vendor: "juniper",
        rackId: "rack1",
        sourceRefs: [createSourceRef("document", "doc2")],
      }),
    ]

    const conflicts = validateDeviceConflicts({ devices, sourceRefs: [] })

    const vendorConflict = conflicts.find(c =>
      c.conflictType === "contradictory_device_attribute"
      && c.attributes?.vendor != null,
    )
    expect(vendorConflict).toBeDefined()
    expect(vendorConflict?.severity).toBe("warning")
  })

  test("detects contradictory model as warning", () => {
    const devices: Device[] = [
      createDevice("sw1", {
        model: "c9200",
        rackId: "rack1",
        sourceRefs: [createSourceRef("document", "doc1")],
      }),
      createDevice("sw1", {
        model: "c9300",
        rackId: "rack1",
        sourceRefs: [createSourceRef("document", "doc2")],
      }),
    ]

    const conflicts = validateDeviceConflicts({ devices, sourceRefs: [] })

    const modelConflict = conflicts.find(c =>
      c.conflictType === "contradictory_device_attribute"
      && c.attributes?.model != null,
    )
    expect(modelConflict).toBeDefined()
    expect(modelConflict?.severity).toBe("warning")
  })

  test("detects contradictory redundancyIntent as blocking", () => {
    const devices: Device[] = [
      createDevice("sw1", {
        redundancyIntent: "single-homed",
        rackId: "rack1",
        sourceRefs: [createSourceRef("document", "doc1")],
      }),
      createDevice("sw1", {
        redundancyIntent: "dual-homed-required",
        rackId: "rack1",
        sourceRefs: [createSourceRef("document", "doc2")],
      }),
    ]

    const conflicts = validateDeviceConflicts({ devices, sourceRefs: [] })

    const redundancyConflict = conflicts.find(c =>
      c.conflictType === "contradictory_device_attribute"
      && c.attributes?.redundancyIntent != null,
    )
    expect(redundancyConflict).toBeDefined()
    expect(redundancyConflict?.severity).toBe("blocking")
  })

  test("no conflicts when devices have unique IDs", () => {
    const devices: Device[] = [
      createDevice("sw1", { rackId: "rack1" }),
      createDevice("sw2", { rackId: "rack2" }),
    ]

    const conflicts = validateDeviceConflicts({ devices, sourceRefs: [] })

    expect(conflicts).toHaveLength(0)
  })
})

describe("validatePortConflicts", () => {
  test("detects duplicate port IDs on same device", () => {
    const ports: Port[] = [
      createPort("port1", "device-a", "eth0"),
      createPort("port2", "device-a", "eth0"),
    ]
    const devices: Device[] = [createDevice("device-a")]

    const conflicts = validatePortConflicts({ ports, devices })

    expect(conflicts.length).toBeGreaterThan(0)
    const duplicateConflict = conflicts.find(c => c.conflictType === "duplicate_port_id")
    expect(duplicateConflict).toBeDefined()
    expect(duplicateConflict?.severity).toBe("blocking")
    expect(duplicateConflict?.message).toContain("eth0")
    expect(duplicateConflict?.message).toContain("device-a")
  })

  test("detects port referencing non-existent device", () => {
    const ports: Port[] = [
      createPort("port1", "device-missing", "eth0"),
    ]
    const devices: Device[] = [createDevice("device-a")]

    const conflicts = validatePortConflicts({ ports, devices })

    const impossibleConflict = conflicts.find(c => c.conflictType === "impossible_port")
    expect(impossibleConflict).toBeDefined()
    expect(impossibleConflict?.severity).toBe("blocking")
    expect(impossibleConflict?.message).toContain("device-missing")
  })

  test("no conflicts when ports are unique and devices exist", () => {
    const ports: Port[] = [
      createPort("port1", "device-a", "eth0"),
      createPort("port2", "device-a", "eth1"),
    ]
    const devices: Device[] = [createDevice("device-a")]

    const conflicts = validatePortConflicts({ ports, devices })

    expect(conflicts).toHaveLength(0)
  })

  test("detects multiple duplicate port IDs on same device", () => {
    const ports: Port[] = [
      createPort("port1", "device-a", "eth0"),
      createPort("port2", "device-a", "eth0"),
      createPort("port3", "device-a", "eth1"),
      createPort("port4", "device-a", "eth1"),
    ]
    const devices: Device[] = [createDevice("device-a")]

    const conflicts = validatePortConflicts({ ports, devices })

    const duplicateConflicts = conflicts.filter(c => c.conflictType === "duplicate_port_id")
    expect(duplicateConflicts).toHaveLength(2)
  })
})

describe("validateLinkConflicts", () => {
  test("detects link referencing non-existent port", () => {
    const ports: Port[] = [createPort("port1", "device-a", "eth0")]
    const links: Link[] = [
      createLink("link1", "port1", "port-missing"),
    ]

    const conflicts = validateLinkConflicts({ links, ports })

    const impossibleConflict = conflicts.find(
      c => c.conflictType === "impossible_link_connection",
    )
    expect(impossibleConflict).toBeDefined()
    expect(impossibleConflict?.severity).toBe("blocking")
    expect(impossibleConflict?.message).toContain("port-missing")
  })

  test("detects same port connected to multiple different ports", () => {
    const ports: Port[] = [
      createPort("port1", "device-a", "eth0"),
      createPort("port2", "device-b", "eth0"),
      createPort("port3", "device-c", "eth0"),
    ]
    const links: Link[] = [
      createLink("link1", "port1", "port2"),
      createLink("link2", "port1", "port3"),
    ]

    const conflicts = validateLinkConflicts({ links, ports })

    const endpointConflict = conflicts.find(c => c.conflictType === "link_endpoint_conflict")
    expect(endpointConflict).toBeDefined()
    expect(endpointConflict?.severity).toBe("warning")
    expect(endpointConflict?.message).toContain("port1")
    expect(endpointConflict?.message).toContain("port2")
    expect(endpointConflict?.message).toContain("port3")
  })

  test("no conflicts when links reference valid ports with single connections", () => {
    const ports: Port[] = [
      createPort("port1", "device-a", "eth0"),
      createPort("port2", "device-b", "eth0"),
    ]
    const links: Link[] = [createLink("link1", "port1", "port2")]

    const conflicts = validateLinkConflicts({ links, ports })

    expect(conflicts).toHaveLength(0)
  })

  test("detects both endpoints referencing non-existent ports", () => {
    const ports: Port[] = [createPort("port1", "device-a", "eth0")]
    const links: Link[] = [
      createLink("link1", "port-missing-a", "port-missing-b"),
    ]

    const conflicts = validateLinkConflicts({ links, ports })

    const impossibleConflicts = conflicts.filter(
      c => c.conflictType === "impossible_link_connection",
    )
    expect(impossibleConflicts).toHaveLength(2)
  })
})

describe("validateNetworkConflicts", () => {
  test("detects overlapping CIDR ranges", () => {
    const segments: NetworkSegment[] = [
      createSegment("segment-a", "10.0.0.0/24", "10.0.0.1"),
      createSegment("segment-b", "10.0.0.128/25", "10.0.0.129"),
    ]

    const conflicts = validateNetworkConflicts({ segments })

    const overlapConflict = conflicts.find(c => c.conflictType === "segment_address_overlap")
    expect(overlapConflict).toBeDefined()
    expect(overlapConflict?.severity).toBe("blocking")
    expect(overlapConflict?.message).toContain("segment-a")
    expect(overlapConflict?.message).toContain("segment-b")
    expect(overlapConflict?.attributes?.cidr).toEqual(["10.0.0.0/24", "10.0.0.128/25"])
  })

  test("detects gateway conflicts between overlapping segments", () => {
    const segments: NetworkSegment[] = [
      createSegment("segment-a", "10.0.0.0/24", "10.0.0.1"),
      createSegment("segment-b", "10.0.0.128/25", "10.0.0.1"),
    ]

    const conflicts = validateNetworkConflicts({ segments })

    const overlapConflict = conflicts.find(c => c.conflictType === "segment_address_overlap")
    const gatewayConflict = conflicts.find(c => c.conflictType === "segment_gateway_conflict")

    expect(overlapConflict).toBeDefined()
    expect(gatewayConflict).toBeDefined()
    expect(gatewayConflict?.severity).toBe("blocking")
    expect(gatewayConflict?.message).toContain("10.0.0.1")
  })

  test("no conflicts when CIDR ranges do not overlap", () => {
    const segments: NetworkSegment[] = [
      createSegment("segment-a", "10.0.0.0/24", "10.0.0.1"),
      createSegment("segment-b", "10.0.1.0/24", "10.0.1.1"),
    ]

    const conflicts = validateNetworkConflicts({ segments })

    expect(conflicts).toHaveLength(0)
  })

  test("no conflicts when segments have different gateways but overlapping ranges", () => {
    const segments: NetworkSegment[] = [
      createSegment("segment-a", "10.0.0.0/25", "10.0.0.1"),
      createSegment("segment-b", "10.0.0.128/25", "10.0.0.129"),
    ]

    const conflicts = validateNetworkConflicts({ segments })

    const gatewayConflicts = conflicts.filter(
      c => c.conflictType === "segment_gateway_conflict",
    )
    expect(gatewayConflicts).toHaveLength(0)
  })

  test("no conflicts when segments have no CIDR", () => {
    const segments: NetworkSegment[] = [
      {
        id: "segment-a",
        name: "segment-a",
        segmentType: "vlan",
        purpose: "data",
        sourceRefs: [],
        statusConfidence: "confirmed",
      },
    ]

    const conflicts = validateNetworkConflicts({ segments })

    expect(conflicts).toHaveLength(0)
  })
})

describe("validateAllocationConflicts", () => {
  test("detects duplicate IP allocations", () => {
    const segments: NetworkSegment[] = [
      createSegment("segment-a", "10.0.0.0/24", "10.0.0.1"),
    ]
    const allocations: IpAllocation[] = [
      createAllocation("alloc1", "segment-a", "10.0.0.10"),
      createAllocation("alloc2", "segment-a", "10.0.0.10"),
    ]

    const conflicts = validateAllocationConflicts({ allocations, segments })

    const duplicateConflict = conflicts.find(c => c.conflictType === "duplicate_allocation_ip")
    expect(duplicateConflict).toBeDefined()
    expect(duplicateConflict?.severity).toBe("blocking")
    expect(duplicateConflict?.message).toContain("10.0.0.10")
    expect(duplicateConflict?.message).toContain("segment-a")
  })

  test("detects IP outside segment CIDR", () => {
    const segments: NetworkSegment[] = [
      createSegment("segment-a", "10.0.0.0/24", "10.0.0.1"),
    ]
    const allocations: IpAllocation[] = [
      createAllocation("alloc1", "segment-a", "10.0.1.10"),
    ]

    const conflicts = validateAllocationConflicts({ allocations, segments })

    const segmentConflict = conflicts.find(c => c.conflictType === "allocation_segment_conflict")
    expect(segmentConflict).toBeDefined()
    expect(segmentConflict?.severity).toBe("blocking")
    expect(segmentConflict?.message).toContain("10.0.1.10")
    expect(segmentConflict?.message).toContain("10.0.0.0/24")
  })

  test("no conflicts when allocations are unique and within CIDR", () => {
    const segments: NetworkSegment[] = [
      createSegment("segment-a", "10.0.0.0/24", "10.0.0.1"),
    ]
    const allocations: IpAllocation[] = [
      createAllocation("alloc1", "segment-a", "10.0.0.10"),
      createAllocation("alloc2", "segment-a", "10.0.0.11"),
    ]

    const conflicts = validateAllocationConflicts({ allocations, segments })

    expect(conflicts).toHaveLength(0)
  })

  test("detects duplicate allocations in same segment only", () => {
    const segments: NetworkSegment[] = [
      createSegment("segment-a", "10.0.0.0/24", "10.0.0.1"),
      createSegment("segment-b", "10.0.1.0/24", "10.0.1.1"),
    ]
    const allocations: IpAllocation[] = [
      createAllocation("alloc1", "segment-a", "10.0.0.10"),
      createAllocation("alloc2", "segment-b", "10.0.1.10"),
      createAllocation("alloc3", "segment-a", "10.0.0.10"),
    ]

    const conflicts = validateAllocationConflicts({ allocations, segments })

    const duplicateConflict = conflicts.find(c => c.conflictType === "duplicate_allocation_ip")
    expect(duplicateConflict).toBeDefined()
    expect(duplicateConflict?.severity).toBe("blocking")
  })

  test("no conflict segment when segment not found", () => {
    const segments: NetworkSegment[] = [
      createSegment("segment-a", "10.0.0.0/24", "10.0.0.1"),
    ]
    const allocations: IpAllocation[] = [
      createAllocation("alloc1", "segment-missing", "10.0.0.10"),
    ]

    const conflicts = validateAllocationConflicts({ allocations, segments })

    expect(conflicts).toHaveLength(0)
  })
})

describe("reconcileExtractedFacts", () => {
  test("aggregates conflicts from all validators", () => {
    const devices: Device[] = [
      createDevice("sw1", {
        vendor: "cisco",
        sourceRefs: [createSourceRef("document", "doc1")],
      }),
      createDevice("sw1", {
        vendor: "juniper",
        sourceRefs: [createSourceRef("document", "doc2")],
      }),
    ]
    const ports: Port[] = [
      createPort("port1", "device-missing", "eth0"),
    ]
    const links: Link[] = [
      createLink("link1", "port-missing", "port2"),
    ]
    const segments: NetworkSegment[] = [
      createSegment("segment-a", "10.0.0.0/24", "10.0.0.1"),
      createSegment("segment-b", "10.0.0.128/25", "10.0.0.1"),
    ]
    const allocations: IpAllocation[] = [
      createAllocation("alloc1", "segment-a", "10.0.0.10"),
      createAllocation("alloc2", "segment-a", "10.0.0.10"),
    ]
    const racks: Rack[] = [createRack("rack-a", "rack-a")]

    const conflicts = reconcileExtractedFacts({
      devices,
      ports,
      links,
      segments,
      allocations,
      racks,
    })

    expect(conflicts.length).toBeGreaterThan(0)

    const deviceConflicts = conflicts.filter(c =>
      c.conflictType === "duplicate_device" || c.conflictType === "contradictory_device_attribute",
    )
    const portConflicts = conflicts.filter(c => c.conflictType === "impossible_port")
    const linkConflicts = conflicts.filter(c => c.conflictType === "impossible_link_connection")
    const segmentConflicts = conflicts.filter(c =>
      c.conflictType === "segment_address_overlap" || c.conflictType === "segment_gateway_conflict",
    )
    const allocationConflicts = conflicts.filter(c => c.conflictType === "duplicate_allocation_ip")

    expect(deviceConflicts.length).toBeGreaterThan(0)
    expect(portConflicts.length).toBeGreaterThan(0)
    expect(linkConflicts.length).toBeGreaterThan(0)
    expect(segmentConflicts.length).toBeGreaterThan(0)
    expect(allocationConflicts.length).toBeGreaterThan(0)
  })

  test("returns empty array when no conflicts", () => {
    const devices: Device[] = [
      createDevice("device-a"),
      createDevice("device-b"),
    ]
    const racks: Rack[] = [createRack("rack-a", "rack-a")]
    const ports: Port[] = [
      createPort("port1", "device-a", "eth0"),
      createPort("port2", "device-b", "eth0"),
    ]
    const links: Link[] = [createLink("link1", "port1", "port2")]
    const segments: NetworkSegment[] = [
      createSegment("segment-a", "10.0.0.0/24", "10.0.0.1"),
      createSegment("segment-b", "10.0.1.0/24", "10.0.1.1"),
    ]
    const allocations: IpAllocation[] = [
      createAllocation("alloc1", "segment-a", "10.0.0.10"),
      createAllocation("alloc2", "segment-b", "10.0.1.10"),
    ]

    const conflicts = reconcileExtractedFacts({
      devices,
      ports,
      links,
      segments,
      allocations,
      racks,
    })

    expect(conflicts).toHaveLength(0)
  })

  test("sorts conflicts by severity (blocking first), then type, then id", () => {
    const devices: Device[] = [
      createDevice("sw1", {
        vendor: "cisco",
        sourceRefs: [createSourceRef("document", "doc1")],
      }),
      createDevice("sw1", {
        vendor: "juniper",
        sourceRefs: [createSourceRef("document", "doc2")],
      }),
    ]
    const ports: Port[] = []
    const links: Link[] = []
    const segments: NetworkSegment[] = [
      createSegment("segment-a", "10.0.0.0/24", "10.0.0.1"),
      createSegment("segment-b", "10.0.1.0/24", "10.0.1.1"),
    ]
    const allocations: IpAllocation[] = []
    const racks: Rack[] = [createRack("rack-a", "rack-a")]

    const conflicts = reconcileExtractedFacts({
      devices,
      ports,
      links,
      segments,
      allocations,
      racks,
    })

    const blockingConflicts = conflicts.filter(c => c.severity === "blocking")
    const warningConflicts = conflicts.filter(c => c.severity === "warning")

    const lastBlockingConflict = blockingConflicts[blockingConflicts.length - 1]
    const firstWarningConflict = warningConflicts[0]

    if (lastBlockingConflict != null && firstWarningConflict != null) {
      const lastBlockingIndex = conflicts.indexOf(lastBlockingConflict)
      const firstWarningIndex = conflicts.indexOf(firstWarningConflict)
      expect(lastBlockingIndex).toBeLessThan(firstWarningIndex)
    }
  })

  test("conflict IDs follow expected format", () => {
    const devices: Device[] = [
      createDevice("sw1", { sourceRefs: [createSourceRef("document", "doc1")] }),
      createDevice("sw1", { sourceRefs: [createSourceRef("document", "doc2")] }),
    ]
    const ports: Port[] = []
    const links: Link[] = []
    const segments: NetworkSegment[] = []
    const allocations: IpAllocation[] = []
    const racks: Rack[] = []

    const conflicts = reconcileExtractedFacts({
      devices,
      ports,
      links,
      segments,
      allocations,
      racks,
    })

    const duplicateConflict = conflicts.find(c => c.conflictType === "duplicate_device")
    expect(duplicateConflict?.id).toMatch(/^conflict:device:sw1:duplicate$/)
  })
})

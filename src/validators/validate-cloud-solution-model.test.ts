import { describe, expect, test } from "bun:test"

import type { CloudSolutionSliceInput } from "../domain"
import {
  createScn04CloudNetworkAllocationFixture,
  createScn02DualTorFixture,
  createScn03MultiRackPodFixture,
  createScn08HighReliabilityRackLayoutFixture,
} from "../scenarios/fixtures"
import {
  hasBlockingIssues,
  validateCloudSolutionModel,
} from "./validate-cloud-solution-model"

function createBaseSliceInput(): CloudSolutionSliceInput {
  return {
    requirement: {
      id: "req-cloud-1",
      projectName: "Validation Slice",
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
    ],
  }
}

function createScn01PhysicalSliceInput(): CloudSolutionSliceInput {
  return {
    requirement: {
      id: "req-scn-01",
      projectName: "Single Rack Basic Connectivity",
      scopeType: "data-center",
      artifactRequests: ["device-cabling-table", "device-port-plan"],
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

describe("validateCloudSolutionModel", () => {
  test("returns no blocking issues for a valid cloud slice", () => {
    const issues = validateCloudSolutionModel(createBaseSliceInput())

    expect(issues).toEqual([])
    expect(hasBlockingIssues(issues)).toBe(false)
  })

  test("returns no blocking issues for a valid SCN-01 physical slice", () => {
    const issues = validateCloudSolutionModel(createScn01PhysicalSliceInput())

    expect(issues).toEqual([])
    expect(hasBlockingIssues(issues)).toBe(false)
  })

  test("returns a blocking issue when segments are missing", () => {
    const issues = validateCloudSolutionModel({
      ...createBaseSliceInput(),
      segments: [],
      allocations: [],
    })

    expect(issues.map((issue) => issue.code)).toContain("network_segments_missing")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("returns duplicate and invalid segment issues deterministically", () => {
    const issues = validateCloudSolutionModel({
      ...createBaseSliceInput(),
      requirement: {
        ...createBaseSliceInput().requirement,
        artifactRequests: [],
      },
      allocations: [],
      segments: [
        {
          id: "segment-management",
          name: "management",
          segmentType: "mgmt",
          cidr: "10.0.0.0/24",
          gateway: "10.0.1.1",
          purpose: "management",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        {
          id: "segment-management",
          name: "management-copy",
          segmentType: "mgmt",
          cidr: "not-a-cidr",
          purpose: "management",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toEqual([
      "duplicate_segment_id",
      "segment_cidr_invalid",
      "segment_gateway_outside_cidr",
    ])
    expect(issues[0]?.subjectType).toBe("segment")
  })

  test("blocks IP planning slices when a subnet-like segment is missing a gateway", () => {
    const baseInput = createScn04CloudNetworkAllocationFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      segments: baseInput.segments.map((segment) =>
        segment.id === "segment-public-service"
          ? {
              ...segment,
              gateway: undefined,
            }
          : segment,
      ),
    })

    expect(issues.map((issue) => issue.code)).toContain("segment_gateway_required")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks overlapping subnet-like segment ranges in cloud IP planning slices", () => {
    const baseInput = createScn04CloudNetworkAllocationFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      segments: [
        baseInput.segments[0]!,
        {
          ...baseInput.segments[1]!,
          cidr: "10.40.0.128/25",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toContain("segment_cidr_overlap")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("warns when data-center scope has no devices", () => {
    const baseInput = createBaseSliceInput()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      requirement: {
        ...baseInput.requirement,
        scopeType: "data-center",
      },
    })

    expect(issues.map((issue) => issue.code)).toContain("device_inventory_missing")
    expect(issues.find((issue) => issue.code === "device_inventory_missing")?.blocking).toBe(false)
  })

  test("reports duplicate rack identifiers", () => {
    const baseInput = createScn01PhysicalSliceInput()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      racks: [
        baseInput.racks[0]!,
        {
          ...baseInput.racks[0]!,
          name: "rack-a-copy",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toContain("duplicate_rack_id")
  })

  test("reports missing rack references and placement fields for physical artifacts", () => {
    const baseInput = createScn01PhysicalSliceInput()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: [
        {
          ...baseInput.devices[0]!,
          rackId: undefined,
          rackPosition: undefined,
          rackUnitHeight: undefined,
        },
        {
          ...baseInput.devices[1]!,
          rackId: "rack-missing",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toContain("device_rack_required")
    expect(issues.map((issue) => issue.code)).toContain("device_rack_position_required")
    expect(issues.map((issue) => issue.code)).toContain("device_rack_unit_height_required")
    expect(issues.map((issue) => issue.code)).toContain("device_rack_missing")
  })

  test("reports overlapping rack placements", () => {
    const baseInput = createScn01PhysicalSliceInput()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: [
        baseInput.devices[0]!,
        {
          ...baseInput.devices[1]!,
          rackPosition: 1,
          rackUnitHeight: 2,
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toContain("rack_position_overlap")
    expect(issues.find((issue) => issue.code === "rack_position_overlap")?.subjectType).toBe("rack")
  })

  test("reports rack placements that exceed rack height", () => {
    const baseInput = createScn01PhysicalSliceInput()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      racks: [
        {
          ...baseInput.racks[0]!,
          uHeight: 10,
        },
      ],
      devices: [
        baseInput.devices[0]!,
        {
          ...baseInput.devices[1]!,
          rackPosition: 10,
          rackUnitHeight: 2,
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toContain("rack_position_exceeds_height")
  })

  test("blocks rack layout slices when no devices are present", () => {
    const baseInput = createScn01PhysicalSliceInput()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      requirement: {
        ...baseInput.requirement,
        artifactRequests: ["device-rack-layout"],
      },
      devices: [],
      ports: [],
      links: [],
    })

    expect(issues.map((issue) => issue.code)).toContain("rack_layout_devices_missing")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks racks that exceed the 80 percent power threshold", () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: [
        ...baseInput.devices,
        {
          id: "device-storage-b",
          name: "storage-b",
          role: "storage",
          rackId: "rack-a",
          rackPosition: 20,
          rackUnitHeight: 4,
          powerWatts: 5000,
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toContain("rack_power_threshold_exceeded")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks HA groups that are not placed on adjacent racks or columns", () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      racks: baseInput.racks.map((rack) => ({
        ...rack,
        adjacentRackIds: [],
        adjacentColumnRackIds: [],
      })),
    })

    expect(issues.map((issue) => issue.code)).toContain("ha_group_not_adjacent")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks MLAG redundancy groups whose peer-facing ports use mismatched port indexes", () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      ports: baseInput.ports.map((port) =>
        port.id === "port-tor-b-business-1"
          ? {
              ...port,
              portIndex: 2,
            }
          : port,
      ),
    })

    expect(issues.map((issue) => issue.code)).toContain("mlag_port_index_mismatch")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("assigns unique ids to repeated rack overlap issues on the same rack", () => {
    const baseInput = createScn01PhysicalSliceInput()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: [
        {
          ...baseInput.devices[0]!,
          rackPosition: 1,
          rackUnitHeight: 2,
        },
        {
          ...baseInput.devices[1]!,
          id: "device-server-b",
          name: "server-b",
          rackPosition: 2,
          rackUnitHeight: 2,
        },
        {
          ...baseInput.devices[1]!,
          id: "device-server-c",
          name: "server-c",
          rackPosition: 3,
          rackUnitHeight: 2,
        },
      ],
      ports: [
        baseInput.ports[0]!,
        {
          ...baseInput.ports[1]!,
          id: "port-server-b-1",
          deviceId: "device-server-b",
        },
        {
          ...baseInput.ports[1]!,
          id: "port-server-c-1",
          deviceId: "device-server-c",
        },
      ],
      links: [
        {
          ...baseInput.links[0]!,
          id: "link-b",
          endpointA: { portId: "port-switch-a-1" },
          endpointB: { portId: "port-server-b-1" },
        },
      ],
    })

    const overlapIssues = issues.filter((issue) => issue.code === "rack_position_overlap")

    expect(overlapIssues.length).toBeGreaterThan(1)
    expect(new Set(overlapIssues.map((issue) => issue.id)).size).toBe(overlapIssues.length)
  })

  test("blocks requested device cabling when links are missing", () => {
    const baseInput = createScn01PhysicalSliceInput()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      requirement: {
        ...baseInput.requirement,
        artifactRequests: ["device-cabling-table"],
      },
      links: [],
    })

    expect(issues.map((issue) => issue.code)).toContain("device_cabling_links_missing")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks requested port connection when links are missing", () => {
    const baseInput = createScn01PhysicalSliceInput()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      requirement: {
        ...baseInput.requirement,
        artifactRequests: ["device-port-connection-table"],
      },
      links: [],
    })

    expect(issues.map((issue) => issue.code)).toContain("port_connection_links_missing")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks requested device port plan when ports are missing", () => {
    const baseInput = createScn01PhysicalSliceInput()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      requirement: {
        ...baseInput.requirement,
        artifactRequests: ["device-port-plan"],
      },
      ports: [],
      links: [],
    })

    expect(issues.map((issue) => issue.code)).toContain("physical_ports_missing")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks physical artifacts when facts are not confirmed", () => {
    const baseInput = createScn01PhysicalSliceInput()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      racks: [
        {
          ...baseInput.racks[0]!,
          statusConfidence: "unresolved",
        },
      ],
      links: [
        {
          ...baseInput.links[0]!,
          statusConfidence: "inferred",
        },
      ],
    })

    const confidenceIssues = issues.filter((issue) => issue.code === "physical_fact_not_confirmed")

    expect(confidenceIssues).toHaveLength(2)
    expect(confidenceIssues.map((issue) => issue.subjectType).sort()).toEqual(["link", "rack"])
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks requested IP artifacts when allocations are missing", () => {
    const issues = validateCloudSolutionModel({
      ...createBaseSliceInput(),
      allocations: [],
    })

    expect(issues.map((issue) => issue.code)).toContain("ip_allocations_missing")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks IP artifacts when network facts are not confirmed", () => {
    const baseInput = createBaseSliceInput()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      segments: [
        {
          ...baseInput.segments[0]!,
          statusConfidence: "unresolved",
        },
      ],
      allocations: [
        {
          ...baseInput.allocations[0]!,
          statusConfidence: "inferred",
        },
      ],
    })

    const confidenceIssues = issues.filter((issue) => issue.code === "network_fact_not_confirmed")

    expect(confidenceIssues).toHaveLength(2)
    expect(confidenceIssues.map((issue) => issue.subjectType).sort()).toEqual([
      "allocation",
      "segment",
    ])
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks devices that require dual-homing but have only one uplink", () => {
    const baseInput = createScn01PhysicalSliceInput()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: [
        baseInput.devices[0]!,
        {
          ...baseInput.devices[1]!,
          redundancyIntent: "dual-homed-required",
        },
      ],
    })

    const redundancyIssue = issues.find(
      (issue) => issue.code === "device_redundancy_links_insufficient",
    )

    expect(redundancyIssue?.severity).toBe("blocking")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("warns when dual-homing is preferred but only one uplink exists", () => {
    const baseInput = createScn01PhysicalSliceInput()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: [
        baseInput.devices[0]!,
        {
          ...baseInput.devices[1]!,
          redundancyIntent: "dual-homed-preferred",
        },
      ],
    })

    const redundancyIssue = issues.find(
      (issue) => issue.code === "device_redundancy_links_insufficient",
    )

    expect(redundancyIssue?.severity).toBe("warning")
    expect(hasBlockingIssues(issues)).toBe(false)
  })

  test("blocks dual-homed-required devices that connect to only one distinct peer device", () => {
    const baseInput = createScn02DualTorFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      links: baseInput.links.map((link) =>
        link.id === "link-storage-a-secondary"
          ? {
              ...link,
              endpointA: { portId: "port-tor-a-2" },
            }
          : link,
      ),
    })

    const redundancyIssue = issues.find(
      (issue) => issue.code === "device_redundancy_peers_insufficient",
    )

    expect(redundancyIssue?.severity).toBe("blocking")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("warns when dual-homing is preferred but only one distinct peer device exists", () => {
    const baseInput = createScn02DualTorFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: baseInput.devices.map((device) =>
        device.id === "device-storage-a"
          ? {
              ...device,
              redundancyIntent: "dual-homed-preferred" as const,
            }
          : device,
      ),
      links: baseInput.links.map((link) =>
        link.id === "link-storage-a-secondary"
          ? {
              ...link,
              endpointA: { portId: "port-tor-a-2" },
            }
          : link,
      ),
    })

    const redundancyIssue = issues.find(
      (issue) => issue.code === "device_redundancy_peers_insufficient",
    )

    expect(redundancyIssue?.severity).toBe("warning")
    expect(hasBlockingIssues(issues)).toBe(false)
  })

  test("blocks required redundancy when redundancyGroup is missing", () => {
    const baseInput = createScn02DualTorFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      links: baseInput.links.map((link) =>
        link.id.startsWith("link-storage-a")
          ? {
              ...link,
              redundancyGroup: undefined,
            }
          : link,
      ),
    })

    expect(issues.map((issue) => issue.code)).toContain("redundancy_group_missing")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks required redundancy when redundancyGroup is inconsistent", () => {
    const baseInput = createScn02DualTorFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      links: baseInput.links.map((link) =>
        link.id === "link-storage-a-secondary"
          ? {
              ...link,
              redundancyGroup: "storage-a-dual-home-alt",
            }
          : link,
      ),
    })

    expect(issues.map((issue) => issue.code)).toContain("redundancy_group_inconsistent")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("reports missing rack assignment for rack-aware port connection requests", () => {
    const baseInput = createScn03MultiRackPodFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: baseInput.devices.map((device) =>
        device.id === "device-leaf-a"
          ? {
              ...device,
              rackId: undefined,
            }
          : device,
      ),
    })

    expect(issues.map((issue) => issue.code)).toContain("device_rack_required")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("reports invalid rack assignment for rack-aware port connection requests", () => {
    const baseInput = createScn03MultiRackPodFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: baseInput.devices.map((device) =>
        device.id === "device-leaf-a"
          ? {
              ...device,
              rackId: "rack-missing",
            }
          : device,
      ),
    })

    expect(issues.map((issue) => issue.code)).toContain("device_rack_missing")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks links marked inter-rack when both endpoints resolve to the same rack", () => {
    const baseInput = createScn03MultiRackPodFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: baseInput.devices.map((device) =>
        device.id === "device-leaf-b"
          ? {
              ...device,
              rackId: "rack-a",
            }
          : device,
      ),
    })

    expect(issues.map((issue) => issue.code)).toContain("inter_rack_link_same_rack")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks multi-rack connection planning when no cross-rack links remain", () => {
    const baseInput = createScn03MultiRackPodFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      links: baseInput.links.filter((link) => link.id !== "link-inter-rack"),
    })

    expect(issues.map((issue) => issue.code)).toContain("multi_rack_links_missing")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("reports ports that reference missing devices", () => {
    const issues = validateCloudSolutionModel({
      ...createBaseSliceInput(),
      ports: [
        {
          id: "port-missing-device",
          deviceId: "device-missing",
          name: "eth0",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toContain("port_device_missing")
    expect(issues.find((issue) => issue.code === "port_device_missing")?.subjectType).toBe("port")
  })

  test("reports duplicate port and link identifiers", () => {
    const issues = validateCloudSolutionModel({
      ...createBaseSliceInput(),
      devices: [
        {
          id: "device-a",
          name: "device-a",
          role: "switch",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
      ports: [
        {
          id: "port-duplicate",
          deviceId: "device-a",
          name: "eth0",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        {
          id: "port-duplicate",
          deviceId: "device-a",
          name: "eth1",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
      links: [
        {
          id: "link-duplicate",
          endpointA: { portId: "port-duplicate" },
          endpointB: { portId: "port-duplicate-b" },
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        {
          id: "link-duplicate",
          endpointA: { portId: "port-duplicate-b" },
          endpointB: { portId: "port-duplicate" },
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toContain("duplicate_port_id")
    expect(issues.map((issue) => issue.code)).toContain("duplicate_link_id")
  })

  test("reports missing segment reference for an allocation", () => {
    const issues = validateCloudSolutionModel({
      ...createBaseSliceInput(),
      allocations: [
        {
          id: "allocation-bad-segment",
          segmentId: "missing-segment",
          allocationType: "device",
          ipAddress: "10.0.0.10",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toContain("allocation_segment_missing")
    expect(issues.find((issue) => issue.code === "allocation_segment_missing")?.subjectType).toBe("allocation")
  })

  test("reports duplicate allocation ids and duplicate addresses", () => {
    const issues = validateCloudSolutionModel({
      ...createBaseSliceInput(),
      allocations: [
        {
          id: "allocation-duplicate",
          segmentId: "segment-management",
          allocationType: "gateway",
          ipAddress: "10.0.0.1",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        {
          id: "allocation-duplicate",
          segmentId: "segment-management",
          allocationType: "reserved",
          ipAddress: "10.0.0.1",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toEqual([
      "duplicate_allocation_id",
      "duplicate_allocation_ip",
    ])
  })

  test("reports invalid and out-of-range allocation IPs", () => {
    const issues = validateCloudSolutionModel({
      ...createBaseSliceInput(),
      allocations: [
        {
          id: "allocation-invalid-ip",
          segmentId: "segment-management",
          allocationType: "device",
          ipAddress: "999.0.0.10",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        {
          id: "allocation-outside-range",
          segmentId: "segment-management",
          allocationType: "device",
          ipAddress: "10.0.1.10",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toEqual([
      "allocation_ip_invalid",
      "allocation_ip_outside_segment",
    ])
  })

  test("returns no blocking issues for a valid SCN-04 cloud allocation slice", () => {
    const issues = validateCloudSolutionModel(createScn04CloudNetworkAllocationFixture())

    expect(issues).toEqual([])
    expect(hasBlockingIssues(issues)).toBe(false)
  })

  test("reports missing link ports and self-linked connections", () => {
    const issues = validateCloudSolutionModel({
      ...createBaseSliceInput(),
      devices: [
        {
          id: "device-a",
          name: "device-a",
          role: "switch",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
      ports: [
        {
          id: "port-a",
          deviceId: "device-a",
          name: "eth0",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
      links: [
        {
          id: "link-self",
          endpointA: { portId: "port-a" },
          endpointB: { portId: "port-a" },
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        {
          id: "link-missing-port",
          endpointA: { portId: "port-a" },
          endpointB: { portId: "port-missing" },
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toContain("link_self_reference")
    expect(issues.map((issue) => issue.code)).toContain("link_port_missing")
  })

  test("reports duplicate connections regardless of endpoint order", () => {
    const issues = validateCloudSolutionModel({
      ...createBaseSliceInput(),
      devices: [
        {
          id: "device-a",
          name: "device-a",
          role: "switch",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        {
          id: "device-b",
          name: "device-b",
          role: "server",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
      ports: [
        {
          id: "port-a",
          deviceId: "device-a",
          name: "eth0",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        {
          id: "port-b",
          deviceId: "device-b",
          name: "eth1",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
      links: [
        {
          id: "link-a",
          endpointA: { portId: "port-a" },
          endpointB: { portId: "port-b" },
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        {
          id: "link-b",
          endpointA: { portId: "port-b" },
          endpointB: { portId: "port-a" },
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toEqual(["duplicate_link_connection"])
    expect(issues[0]?.subjectType).toBe("link")
  })

  test.each([
    ["business", "storage"],
    ["storage", "business"],
    ["inband-mgmt", "oob-mgmt"],
    ["oob-mgmt", "inband-mgmt"],
  ] as const)(
    "blocks %s links when endpoint ports are typed %s",
    (linkType, mismatchedPortType) => {
      const baseInput = createScn08HighReliabilityRackLayoutFixture()
      const issues = validateCloudSolutionModel({
        ...baseInput,
        ports: baseInput.ports.map((port) =>
          port.id === "port-tor-a-business-1"
            ? {
                ...port,
                portType: mismatchedPortType,
              }
            : port,
        ),
        links: baseInput.links.map((link) =>
          link.id === "link-server-a-business-a"
            ? {
                ...link,
                linkType,
              }
            : link,
        ),
      })

      expect(issues.map((issue) => issue.code)).toContain("plane_link_port_type_mismatch")
      expect(hasBlockingIssues(issues)).toBe(true)
    },
  )

  test("blocks typed ports that connect through untyped links", () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      links: baseInput.links.map((link) =>
        link.id === "link-server-a-business-a"
          ? {
              ...link,
              linkType: undefined,
            }
          : link,
      ),
    })

    expect(issues.map((issue) => issue.code)).toContain("plane_link_port_type_mismatch")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks peer-links whose endpoints are not in the same HA group", () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: baseInput.devices.map((device) =>
        device.id === "device-tor-b"
          ? {
              ...device,
              highAvailabilityGroup: "tor-pair-b",
            }
          : device,
      ),
      ports: [
        ...baseInput.ports,
        {
          id: "port-tor-a-peer-1",
          deviceId: "device-tor-a",
          name: "eth1/49",
          portType: "peer-link",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        {
          id: "port-tor-b-peer-1",
          deviceId: "device-tor-b",
          name: "eth1/49",
          portType: "peer-link",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
      links: [
        ...baseInput.links,
        {
          id: "link-tor-peer-a",
          endpointA: { portId: "port-tor-a-peer-1" },
          endpointB: { portId: "port-tor-b-peer-1" },
          linkType: "peer-link",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toContain("peer_link_ha_group_invalid")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks inter-switch links that terminate on non-network devices", () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      ports: [
        ...baseInput.ports,
        {
          id: "port-tor-a-fabric-1",
          deviceId: "device-tor-a",
          name: "eth1/50",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        {
          id: "port-server-a-fabric-1",
          deviceId: "device-server-a",
          name: "eth9",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
      links: [
        ...baseInput.links,
        {
          id: "link-invalid-inter-switch",
          endpointA: { portId: "port-tor-a-fabric-1" },
          endpointB: { portId: "port-server-a-fabric-1" },
          linkType: "inter-switch",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toContain("inter_switch_link_endpoint_invalid")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks uplinks that terminate on non-network devices", () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      ports: [
        ...baseInput.ports,
        {
          id: "port-tor-a-uplink-1",
          deviceId: "device-tor-a",
          name: "eth1/51",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        {
          id: "port-server-a-uplink-1",
          deviceId: "device-server-a",
          name: "eth10",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
      links: [
        ...baseInput.links,
        {
          id: "link-invalid-uplink",
          endpointA: { portId: "port-tor-a-uplink-1" },
          endpointB: { portId: "port-server-a-uplink-1" },
          linkType: "uplink",
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).toContain("uplink_link_endpoint_invalid")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks HA devices that omit an explicit HA role", () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: baseInput.devices.map((device) =>
        device.id === "device-tor-b"
          ? {
              ...device,
              highAvailabilityRole: undefined,
            }
          : device,
      ),
    })

    expect(issues.map((issue) => issue.code)).toContain("ha_group_role_missing")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks HA groups without one primary and one secondary role", () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: baseInput.devices.map((device) =>
        device.id === "device-tor-b"
          ? {
              ...device,
              highAvailabilityRole: "primary",
            }
          : device,
      ),
    })

    expect(issues.map((issue) => issue.code)).toContain("ha_group_role_incomplete")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks high-reliability rack layout when rack power budgets are missing", () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      racks: baseInput.racks.map((rack) =>
        rack.id === "rack-a"
          ? {
              ...rack,
              maxPowerKw: undefined,
            }
          : rack,
      ),
    })

    expect(issues.map((issue) => issue.code)).toContain("rack_power_budget_missing")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("blocks high-reliability rack layout when device power is missing", () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: baseInput.devices.map((device) =>
        device.id === "device-server-a"
          ? {
              ...device,
              powerWatts: undefined,
            }
          : device,
      ),
    })

    expect(issues.map((issue) => issue.code)).toContain("device_power_missing")
    expect(hasBlockingIssues(issues)).toBe(true)
  })

  test("does not block high-reliability rack layout when a cable-manager has no powerWatts", () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: [
        ...baseInput.devices,
        {
          id: "device-cable-manager-a",
          name: "48口理线器",
          role: "cable-manager",
          rackId: "rack-a",
          rackPosition: 20,
          rackUnitHeight: 1,
          powerWatts: undefined,
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
      ],
    })

    expect(issues.map((issue) => issue.code)).not.toContain("device_power_missing")
    expect(hasBlockingIssues(issues)).toBe(false)
  })

  test("blocks dual-homed peers that do not resolve to one complete HA pair", () => {
    const baseInput = createScn08HighReliabilityRackLayoutFixture()
    const issues = validateCloudSolutionModel({
      ...baseInput,
      devices: baseInput.devices.map((device) =>
        device.id === "device-tor-b"
          ? {
              ...device,
              highAvailabilityGroup: undefined,
            }
          : device,
      ),
    })

    expect(issues.map((issue) => issue.code)).toContain("redundancy_peer_ha_group_invalid")
    expect(hasBlockingIssues(issues)).toBe(true)
  })
})

import type {
  Device,
  Port,
  Link,
  NetworkSegment,
  IpAllocation,
  SourceReference,
  Conflict,
} from "../../domain"

export const scn06Devices: Device[] = [
  {
    id: "sw1",
    name: "sw1",
    role: "core",
    rackId: "rack1",
    rackPosition: 10,
    statusConfidence: "inferred",
    sourceRefs: [{ kind: "diagram", ref: "topology.pdf", note: "Network topology diagram" }],
  },
  {
    id: "sw1",
    name: "sw1",
    role: "access",
    rackId: "rack2",
    rackPosition: 20,
    statusConfidence: "inferred",
    sourceRefs: [{ kind: "document", ref: "inventory.csv", note: "Device inventory list" }],
  },
]

export const scn06Ports: Port[] = [
  {
    id: "sw1-port-1",
    deviceId: "sw1",
    name: "eth1/1",
    purpose: "uplink",
    statusConfidence: "inferred",
    sourceRefs: [{ kind: "diagram", ref: "topology.pdf", note: "Network topology diagram" }],
  },
  {
    id: "sw1-port-1",
    deviceId: "sw1",
    name: "eth1/1",
    purpose: "server",
    statusConfidence: "inferred",
    sourceRefs: [{ kind: "document", ref: "port-config.xlsx", note: "Port configuration spreadsheet" }],
  },
]

export const scn06Links: Link[] = [
  {
    id: "link-sw1-server1",
    endpointA: { portId: "sw1-port-1" },
    endpointB: { portId: "server1-port-1" },
    purpose: "server-uplink",
    redundancyGroup: "server1-primary",
    statusConfidence: "inferred",
    sourceRefs: [{ kind: "diagram", ref: "topology.pdf", note: "Network topology diagram" }],
  },
  {
    id: "link-sw1-server1",
    endpointA: { portId: "sw1-port-1" },
    endpointB: { portId: "server1-port-2" },
    purpose: "primary-uplink",
    redundancyGroup: "server1-main",
    statusConfidence: "inferred",
    sourceRefs: [{ kind: "document", ref: "cabling-diagram.dwg", note: "Cabling diagram" }],
  },
]

export const scn06Segments: NetworkSegment[] = [
  {
    id: "mgmt-vlan",
    name: "management",
    segmentType: "vlan",
    cidr: "192.168.10.0/24",
    gateway: "192.168.10.1",
    purpose: "device management",
    statusConfidence: "inferred",
    sourceRefs: [{ kind: "document", ref: "ip-plan.xlsx", note: "IP address planning spreadsheet" }],
  },
  {
    id: "mgmt-subnet",
    name: "management-backup",
    segmentType: "subnet",
    cidr: "192.168.10.0/25",
    gateway: "192.168.10.1",
    purpose: "backup management",
    statusConfidence: "inferred",
    sourceRefs: [{ kind: "document", ref: "network-design.docx", note: "Network design document" }],
  },
]

export const scn06Allocations: IpAllocation[] = [
  {
    id: "alloc-sw1-mgmt",
    segmentId: "mgmt-vlan",
    allocationType: "device",
    ipAddress: "192.168.10.10",
    deviceId: "sw1",
    hostname: "sw1-core",
    interfaceName: "mgmt0",
    purpose: "switch management",
    statusConfidence: "inferred",
    sourceRefs: [{ kind: "document", ref: "ip-plan.xlsx", note: "IP address planning spreadsheet" }],
  },
  {
    id: "alloc-sw1-backup",
    segmentId: "mgmt-subnet",
    allocationType: "device",
    ipAddress: "192.168.10.10",
    deviceId: "sw1",
    hostname: "sw1-access",
    interfaceName: "eth0",
    purpose: "backup management",
    statusConfidence: "inferred",
    sourceRefs: [{ kind: "document", ref: "backup-ip-list.txt", note: "Backup IP allocation list" }],
  },
  {
    id: "alloc-server1-mgmt",
    segmentId: "mgmt-vlan",
    allocationType: "device",
    ipAddress: "192.168.10.10",
    deviceId: "server1",
    hostname: "server1-app",
    interfaceName: "eth0",
    purpose: "server management",
    statusConfidence: "inferred",
    sourceRefs: [{ kind: "document", ref: "server-inventory.csv", note: "Server inventory list" }],
  },
]

export const scn06ExpectedConflicts: Conflict[] = [
  {
    id: "conflict:device:sw1:rackId",
    conflictType: "contradictory_device_attribute",
    severity: "blocking",
    message: 'Device "sw1" has conflicting rackId values from different sources',
    entityRefs: ["device:sw1", "device:sw1"],
    sourceRefs: [
      { kind: "diagram", ref: "topology.pdf", note: "Network topology diagram" },
      { kind: "document", ref: "inventory.csv", note: "Device inventory list" },
    ],
    attributes: { rackId: ["rack1", "rack2"] },
    suggestedResolution: "Verify the correct rack assignment from authoritative source",
  },
  {
    id: "conflict:device:sw1:role",
    conflictType: "contradictory_device_attribute",
    severity: "blocking",
    message: 'Device "sw1" has conflicting role values from different sources',
    entityRefs: ["device:sw1", "device:sw1"],
    sourceRefs: [
      { kind: "diagram", ref: "topology.pdf", note: "Network topology diagram" },
      { kind: "document", ref: "inventory.csv", note: "Device inventory list" },
    ],
    attributes: { role: ["core", "access"] },
    suggestedResolution: "Verify the correct device role from authoritative source",
  },
  {
    id: "conflict:device:sw1:rackPosition",
    conflictType: "contradictory_device_attribute",
    severity: "blocking",
    message: 'Device "sw1" has conflicting rackPosition values from different sources',
    entityRefs: ["device:sw1", "device:sw1"],
    sourceRefs: [
      { kind: "diagram", ref: "topology.pdf", note: "Network topology diagram" },
      { kind: "document", ref: "inventory.csv", note: "Device inventory list" },
    ],
    attributes: { rackPosition: ["10", "20"] },
    suggestedResolution: "Verify the correct rack position from authoritative source",
  },
  {
    id: "conflict:port:sw1-port-1:duplicate",
    conflictType: "duplicate_port_id",
    severity: "blocking",
    message: 'Port "eth1/1" is defined 2 times on device "sw1"',
    entityRefs: ["port:sw1-port-1", "port:sw1-port-1"],
    sourceRefs: [
      { kind: "diagram", ref: "topology.pdf", note: "Network topology diagram" },
      { kind: "document", ref: "port-config.xlsx", note: "Port configuration spreadsheet" },
    ],
    suggestedResolution: "Remove duplicate port definitions or merge port information",
  },
  {
    id: "conflict:link:link-sw1-server1:endpoint_conflict",
    conflictType: "link_endpoint_conflict",
    severity: "warning",
    message: 'Link "link-sw1-server1" has conflicting endpointB references: server1-port-1 vs server1-port-2',
    entityRefs: ["link:link-sw1-server1", "link:link-sw1-server1"],
    sourceRefs: [
      { kind: "diagram", ref: "topology.pdf", note: "Network topology diagram" },
      { kind: "document", ref: "cabling-diagram.dwg", note: "Cabling diagram" },
    ],
    suggestedResolution: "Verify the correct physical cabling from authoritative source",
  },
  {
    id: "conflict:segment:mgmt-vlan:mgmt-subnet:address_overlap",
    conflictType: "segment_address_overlap",
    severity: "blocking",
    message: 'Segments "mgmt-vlan" and "mgmt-subnet" have overlapping CIDR ranges',
    entityRefs: ["segment:mgmt-vlan", "segment:mgmt-subnet"],
    sourceRefs: [
      { kind: "document", ref: "ip-plan.xlsx", note: "IP address planning spreadsheet" },
      { kind: "document", ref: "network-design.docx", note: "Network design document" },
    ],
    attributes: { cidr: ["192.168.10.0/24", "192.168.10.0/25"] },
    suggestedResolution: "Adjust CIDR ranges to eliminate overlap or merge segments if intended",
  },
  {
    id: "conflict:segment:mgmt-vlan:mgmt-subnet:gateway_conflict",
    conflictType: "segment_gateway_conflict",
    severity: "blocking",
    message: 'Overlapping segments "mgmt-vlan" and "mgmt-subnet" share the same gateway IP "192.168.10.1"',
    entityRefs: ["segment:mgmt-vlan", "segment:mgmt-subnet"],
    sourceRefs: [
      { kind: "document", ref: "ip-plan.xlsx", note: "IP address planning spreadsheet" },
      { kind: "document", ref: "network-design.docx", note: "Network design document" },
    ],
    attributes: { gateway: ["192.168.10.1"], cidr: ["192.168.10.0/24", "192.168.10.0/25"] },
    suggestedResolution: "Use different gateway IPs for overlapping segments or adjust CIDR ranges",
  },
  {
    id: "conflict:allocation:mgmt-vlan:192.168.10.10:duplicate",
    conflictType: "duplicate_allocation_ip",
    severity: "blocking",
    message: 'IP address "192.168.10.10" is assigned to 2 allocations in segment "mgmt-vlan"',
    entityRefs: ["allocation:alloc-sw1-mgmt", "allocation:alloc-server1-mgmt"],
    sourceRefs: [
      { kind: "document", ref: "ip-plan.xlsx", note: "IP address planning spreadsheet" },
      { kind: "document", ref: "server-inventory.csv", note: "Server inventory list" },
    ],
    attributes: { 
      ipAddress: ["192.168.10.10"], 
      segmentId: ["mgmt-vlan"], 
      consumers: ["sw1-core, server1-app"] 
    },
    suggestedResolution: "Remove duplicate IP allocations or assign unique IPs to each device",
  },
]
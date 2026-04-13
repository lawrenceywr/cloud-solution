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

export function validateDeviceConflicts(args: {
  devices: Device[]
  sourceRefs: SourceReference[]
}): Conflict[] {
  const conflicts: Conflict[] = []

  const deviceMap = new Map<string, Device[]>()
  for (const device of args.devices) {
    const devicesWithSameId = deviceMap.get(device.id) || []
    devicesWithSameId.push(device)
    deviceMap.set(device.id, devicesWithSameId)
  }

  for (const [deviceId, devices] of deviceMap.entries()) {
    if (devices.length > 1) {
      conflicts.push({
        id: `conflict:device:${deviceId}:duplicate`,
        conflictType: "duplicate_device",
        severity: "blocking",
        message: `Device "${deviceId}" is defined ${devices.length} times from different sources`,
        entityRefs: devices.map(d => `device:${d.id}`),
        sourceRefs: devices.flatMap(d => d.sourceRefs),
        suggestedResolution: "Merge duplicate device definitions or remove redundant sources",
      })
    }

    const rackIds = new Set(devices.map(d => d.rackId).filter((v): v is string => typeof v === "string"))
    const rackPositions = new Set(devices.map(d => d.rackPosition).filter((v): v is number => typeof v === "number"))
    const roles = new Set(devices.map(d => d.role))
    const vendors = new Set(devices.map(d => d.vendor).filter((v): v is string => typeof v === "string"))
    const models = new Set(devices.map(d => d.model).filter((v): v is string => typeof v === "string"))
    const redundancyIntents = new Set(
      devices.map(d => d.redundancyIntent).filter((v): v is Device["redundancyIntent"] => v != null),
    )

    if (rackIds.size > 1) {
      conflicts.push({
        id: `conflict:device:${deviceId}:rackId`,
        conflictType: "contradictory_device_attribute",
        severity: "blocking",
        message: `Device "${deviceId}" has conflicting rackId values from different sources`,
        entityRefs: devices.map(d => `device:${d.id}`),
        sourceRefs: devices.flatMap(d => d.sourceRefs),
        attributes: {
          rackId: [...rackIds],
        },
        suggestedResolution: "Verify the correct rack assignment from authoritative source",
      })
    }

    if (rackPositions.size > 1) {
      conflicts.push({
        id: `conflict:device:${deviceId}:rackPosition`,
        conflictType: "contradictory_device_attribute",
        severity: "blocking",
        message: `Device "${deviceId}" has conflicting rackPosition values from different sources`,
        entityRefs: devices.map(d => `device:${d.id}`),
        sourceRefs: devices.flatMap(d => d.sourceRefs),
        attributes: {
          rackPosition: [...rackPositions].map(String),
        },
        suggestedResolution: "Verify the correct rack position from authoritative source",
      })
    }

    if (roles.size > 1) {
      conflicts.push({
        id: `conflict:device:${deviceId}:role`,
        conflictType: "contradictory_device_attribute",
        severity: "blocking",
        message: `Device "${deviceId}" has conflicting role values from different sources`,
        entityRefs: devices.map(d => `device:${d.id}`),
        sourceRefs: devices.flatMap(d => d.sourceRefs),
        attributes: {
          role: [...roles],
        },
        suggestedResolution: "Verify the correct device role from authoritative source",
      })
    }

    if (vendors.size > 1) {
      conflicts.push({
        id: `conflict:device:${deviceId}:vendor`,
        conflictType: "contradictory_device_attribute",
        severity: "warning",
        message: `Device "${deviceId}" has conflicting vendor values from different sources`,
        entityRefs: devices.map(d => `device:${d.id}`),
        sourceRefs: devices.flatMap(d => d.sourceRefs),
        attributes: {
          vendor: [...vendors],
        },
        suggestedResolution: "Verify the correct vendor from authoritative source",
      })
    }

    if (models.size > 1) {
      conflicts.push({
        id: `conflict:device:${deviceId}:model`,
        conflictType: "contradictory_device_attribute",
        severity: "warning",
        message: `Device "${deviceId}" has conflicting model values from different sources`,
        entityRefs: devices.map(d => `device:${d.id}`),
        sourceRefs: devices.flatMap(d => d.sourceRefs),
        attributes: {
          model: [...models],
        },
        suggestedResolution: "Verify the correct model from authoritative source",
      })
    }

    if (redundancyIntents.size > 1) {
      conflicts.push({
        id: `conflict:device:${deviceId}:redundancyIntent`,
        conflictType: "contradictory_device_attribute",
        severity: "blocking",
        message: `Device "${deviceId}" has conflicting redundancyIntent values from different sources`,
        entityRefs: devices.map(d => `device:${d.id}`),
        sourceRefs: devices.flatMap(d => d.sourceRefs),
        attributes: {
          redundancyIntent: [...redundancyIntents],
        },
        suggestedResolution: "Verify the correct redundancy intent from authoritative source",
      })
    }
  }

  return conflicts
}

export function validatePortConflicts(args: {
  ports: Port[]
  devices: Device[]
}): Conflict[] {
  const conflicts: Conflict[] = []
  const deviceIds = new Set(args.devices.map(d => d.id))

  const portMap = new Map<string, Port[]>()
  for (const port of args.ports) {
    const key = `${port.deviceId}:${port.name}`
    const portsWithSameKey = portMap.get(key) || []
    portsWithSameKey.push(port)
    portMap.set(key, portsWithSameKey)
  }

  for (const [key, ports] of portMap.entries()) {
    if (ports.length > 1) {
      const [deviceId, portName] = key.split(":")
      conflicts.push({
        id: `conflict:port:${deviceId}:${portName}:duplicate`,
        conflictType: "duplicate_port_id",
        severity: "blocking",
        message: `Port "${portName}" is defined ${ports.length} times on device "${deviceId}"`,
        entityRefs: ports.map(p => `port:${p.id}`),
        sourceRefs: ports.flatMap(p => p.sourceRefs),
        suggestedResolution: "Remove duplicate port definitions or merge port information",
      })
    }
  }

  for (const port of args.ports) {
    if (!deviceIds.has(port.deviceId)) {
      conflicts.push({
        id: `conflict:port:${port.id}:impossible`,
        conflictType: "impossible_port",
        severity: "blocking",
        message: `Port "${port.id}" references non-existent device "${port.deviceId}"`,
        entityRefs: [`port:${port.id}`],
        sourceRefs: port.sourceRefs,
        suggestedResolution: "Add the missing device or correct the port's device reference",
      })
    }
  }

  return conflicts
}

export function validateLinkConflicts(args: {
  links: Link[]
  ports: Port[]
}): Conflict[] {
  const conflicts: Conflict[] = []
  const portIds = new Set(args.ports.map(p => p.id))

  for (const link of args.links) {
    if (!portIds.has(link.endpointA.portId)) {
      conflicts.push({
        id: `conflict:link:${link.id}:endpointA:impossible`,
        conflictType: "impossible_link_connection",
        severity: "blocking",
        message: `Link "${link.id}" endpointA references non-existent port "${link.endpointA.portId}"`,
        entityRefs: [`link:${link.id}`],
        sourceRefs: link.sourceRefs,
        suggestedResolution: "Add the missing port or correct the link endpoint reference",
      })
    }

    if (!portIds.has(link.endpointB.portId)) {
      conflicts.push({
        id: `conflict:link:${link.id}:endpointB:impossible`,
        conflictType: "impossible_link_connection",
        severity: "blocking",
        message: `Link "${link.id}" endpointB references non-existent port "${link.endpointB.portId}"`,
        entityRefs: [`link:${link.id}`],
        sourceRefs: link.sourceRefs,
        suggestedResolution: "Add the missing port or correct the link endpoint reference",
      })
    }
  }

  const portConnections = new Map<string, Set<string>>()
  for (const link of args.links) {
    const connectionsA = portConnections.get(link.endpointA.portId) || new Set<string>()
    connectionsA.add(link.endpointB.portId)
    portConnections.set(link.endpointA.portId, connectionsA)

    const connectionsB = portConnections.get(link.endpointB.portId) || new Set<string>()
    connectionsB.add(link.endpointA.portId)
    portConnections.set(link.endpointB.portId, connectionsB)
  }

  for (const [portId, connections] of portConnections.entries()) {
    if (connections.size > 1) {
      const connectionList = [...connections].join(", ")
      conflicts.push({
        id: `conflict:link:${portId}:endpoint_conflict`,
        conflictType: "link_endpoint_conflict",
        severity: "warning",
        message: `Port "${portId}" has multiple different connection targets: ${connectionList}`,
        entityRefs: [`port:${portId}`],
        sourceRefs: [],
        suggestedResolution: "Verify if port should have single or multiple connections (e.g., LAG)",
      })
    }
  }

  return conflicts
}

function parseIpv4(value: string): number[] | null {
  const parts = value.trim().split(".")
  if (parts.length !== 4) {
    return null
  }

  const octets = parts.map(part => Number(part))
  if (octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null
  }

  return octets
}

function ipv4ToNumber(octets: number[]): number {
  return octets.reduce((value, octet) => value * 256 + octet, 0)
}

function parseIpv4Cidr(value: string): { network: number; prefix: number } | null {
  const [ipPart, prefixPart] = value.trim().split("/")
  if (!ipPart || !prefixPart) {
    return null
  }

  const octets = parseIpv4(ipPart)
  const prefix = Number(prefixPart)
  if (!octets || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return null
  }

  return {
    network: ipv4ToNumber(octets),
    prefix,
  }
}

function getIpv4CidrRange(cidr: string): { start: number; end: number } | null {
  const parsedCidr = parseIpv4Cidr(cidr)
  if (!parsedCidr) {
    return null
  }

  const mask = parsedCidr.prefix === 0
    ? 0
    : (0xffffffff << (32 - parsedCidr.prefix)) >>> 0
  const start = parsedCidr.network & mask
  const hostCount = parsedCidr.prefix === 32 ? 1 : 2 ** (32 - parsedCidr.prefix)

  return {
    start,
    end: start + hostCount - 1,
  }
}

function cidrRangesOverlap(cidr1: string, cidr2: string): boolean {
  const range1 = getIpv4CidrRange(cidr1)
  const range2 = getIpv4CidrRange(cidr2)

  if (!range1 || !range2) {
    return false
  }

  return range1.start <= range2.end && range2.start <= range1.end
}

export function validateNetworkConflicts(args: {
  segments: NetworkSegment[]
}): Conflict[] {
  const conflicts: Conflict[] = []

  const segmentsWithCidr = args.segments
    .filter(s => s.cidr != null && s.cidr.length > 0)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))

  for (let i = 0; i < segmentsWithCidr.length; i += 1) {
    const segmentA = segmentsWithCidr[i]
    if (!segmentA?.cidr) {
      continue
    }

    for (let j = i + 1; j < segmentsWithCidr.length; j += 1) {
      const segmentB = segmentsWithCidr[j]
      if (!segmentB?.cidr) {
        continue
      }

      if (cidrRangesOverlap(segmentA.cidr, segmentB.cidr)) {
        conflicts.push({
          id: `conflict:segment:${segmentA.id}:${segmentB.id}:address_overlap`,
          conflictType: "segment_address_overlap",
          severity: "blocking",
          message: `Segments "${segmentA.id}" and "${segmentB.id}" have overlapping CIDR ranges`,
          entityRefs: [`segment:${segmentA.id}`, `segment:${segmentB.id}`],
          sourceRefs: [...segmentA.sourceRefs, ...segmentB.sourceRefs],
          attributes: {
            cidr: [segmentA.cidr, segmentB.cidr],
          },
          suggestedResolution: "Adjust CIDR ranges to eliminate overlap or merge segments if intended",
        })
      }
    }
  }

  const segmentsWithGateway = segmentsWithCidr.filter(s => s.gateway != null && s.gateway.length > 0)

  for (let i = 0; i < segmentsWithGateway.length; i += 1) {
    const segmentA = segmentsWithGateway[i]
    if (!segmentA?.cidr || !segmentA?.gateway) {
      continue
    }

    for (let j = i + 1; j < segmentsWithGateway.length; j += 1) {
      const segmentB = segmentsWithGateway[j]
      if (!segmentB?.cidr || !segmentB?.gateway) {
        continue
      }

      if (
        cidrRangesOverlap(segmentA.cidr, segmentB.cidr)
        && segmentA.gateway === segmentB.gateway
      ) {
        conflicts.push({
          id: `conflict:segment:${segmentA.id}:${segmentB.id}:gateway_conflict`,
          conflictType: "segment_gateway_conflict",
          severity: "blocking",
          message: `Overlapping segments "${segmentA.id}" and "${segmentB.id}" share the same gateway IP "${segmentA.gateway}"`,
          entityRefs: [`segment:${segmentA.id}`, `segment:${segmentB.id}`],
          sourceRefs: [...segmentA.sourceRefs, ...segmentB.sourceRefs],
          attributes: {
            gateway: [segmentA.gateway],
            cidr: [segmentA.cidr, segmentB.cidr],
          },
          suggestedResolution: "Use different gateway IPs for overlapping segments or adjust CIDR ranges",
        })
      }
    }
  }

  return conflicts
}

function parseIpAddressToNumber(value: string): number | null {
  const octets = parseIpv4(value)
  if (!octets) {
    return null
  }
  return ipv4ToNumber(octets)
}

export function validateAllocationConflicts(args: {
  allocations: IpAllocation[]
  segments: NetworkSegment[]
}): Conflict[] {
  const conflicts: Conflict[] = []
  const segmentMap = new Map(args.segments.map(s => [s.id, s]))

  const allocationMap = new Map<string, IpAllocation[]>()
  for (const allocation of args.allocations) {
    const key = `${allocation.segmentId}:${allocation.ipAddress}`
    const allocationsWithSameKey = allocationMap.get(key) || []
    allocationsWithSameKey.push(allocation)
    allocationMap.set(key, allocationsWithSameKey)
  }

  for (const [key, allocations] of allocationMap.entries()) {
    if (allocations.length > 1) {
      const [segmentId, ipAddress] = key.split(":")
      const consumerRefs = allocations
        .map(a => a.deviceId || a.hostname || a.id)
        .filter((v): v is string => v != null)
        .join(", ")

      conflicts.push({
        id: `conflict:allocation:${segmentId}:${ipAddress}:duplicate`,
        conflictType: "duplicate_allocation_ip",
        severity: "blocking",
        message: `IP address "${ipAddress}" is assigned to ${allocations.length} allocations in segment "${segmentId}"`,
        entityRefs: allocations.map(a => `allocation:${a.id}`),
        sourceRefs: allocations.flatMap(a => a.sourceRefs),
        attributes: {
          ipAddress: [ipAddress],
          segmentId: [segmentId],
          consumers: [consumerRefs],
        },
        suggestedResolution: "Remove duplicate IP allocations or assign unique IPs to each device",
      })
    }
  }

  for (const allocation of args.allocations) {
    const segment = segmentMap.get(allocation.segmentId)
    if (!segment?.cidr) {
      continue
    }

    const ipNumber = parseIpAddressToNumber(allocation.ipAddress)
    const cidrRange = getIpv4CidrRange(segment.cidr)

    if (ipNumber != null && cidrRange != null) {
      const isInSegment = ipNumber >= cidrRange.start && ipNumber <= cidrRange.end
      if (!isInSegment) {
        conflicts.push({
          id: `conflict:allocation:${allocation.id}:segment_mismatch`,
          conflictType: "allocation_segment_conflict",
          severity: "blocking",
          message: `Allocation "${allocation.id}" IP "${allocation.ipAddress}" is outside segment "${segment.id}" CIDR "${segment.cidr}"`,
          entityRefs: [`allocation:${allocation.id}`, `segment:${segment.id}`],
          sourceRefs: allocation.sourceRefs,
          attributes: {
            ipAddress: [allocation.ipAddress],
            segmentCidr: [segment.cidr],
          },
          suggestedResolution: "Correct the IP address to be within the segment's CIDR range",
        })
      }
    }
  }

  return conflicts
}

export function reconcileExtractedFacts(args: {
  devices: Device[]
  ports: Port[]
  links: Link[]
  segments: NetworkSegment[]
  allocations: IpAllocation[]
  racks: Rack[]
}): Conflict[] {
  const conflicts: Conflict[] = []

  const emptySourceRefs: SourceReference[] = []

  conflicts.push(...validateDeviceConflicts({
    devices: args.devices,
    sourceRefs: emptySourceRefs,
  }))

  conflicts.push(...validatePortConflicts({
    ports: args.ports,
    devices: args.devices,
  }))

  conflicts.push(...validateLinkConflicts({
    links: args.links,
    ports: args.ports,
  }))

  conflicts.push(...validateNetworkConflicts({
    segments: args.segments,
  }))

  conflicts.push(...validateAllocationConflicts({
    allocations: args.allocations,
    segments: args.segments,
  }))

  const severityRank: Record<Conflict["severity"], number> = {
    blocking: 0,
    warning: 1,
  }

  return conflicts.sort((left, right) => {
    const severityDelta = severityRank[left.severity] - severityRank[right.severity]
    if (severityDelta !== 0) {
      return severityDelta
    }

    const typeDelta = left.conflictType.localeCompare(right.conflictType)
    if (typeDelta !== 0) {
      return typeDelta
    }

    return left.id.localeCompare(right.id)
  })
}

import type {
  CloudSolutionSliceInput,
  Device,
  IpAllocation,
  Link,
  NetworkSegment,
  Port,
  Rack,
  ValidationIssue,
} from "../domain"

type ValidationSubject = {
  code: ValidationIssue["code"]
  message: string
  severity: ValidationIssue["severity"]
  subjectType: ValidationIssue["subjectType"]
  subjectId: string
  path?: string
  entityRefs?: string[]
  idSuffix?: string
  blocking?: boolean
}

const subnetLikeSegmentTypes = new Set([
  "subnet",
  "mgmt",
  "storage",
  "service",
])

const planeLinkTypes = new Set([
  "business",
  "storage",
  "inband-mgmt",
  "oob-mgmt",
])

const networkInfrastructureExcludedRoles = new Set([
  "server",
  "storage",
])

const powerValidationExcludedRoles = new Set([
  "cable-manager",
])

const severityRank: Record<ValidationIssue["severity"], number> = {
  blocking: 0,
  warning: 1,
  informational: 2,
}

function createIssue(subject: ValidationSubject): ValidationIssue {
  const primaryEntityRef = `${subject.subjectType}:${subject.subjectId}`
  const entityRefs = [...new Set(subject.entityRefs ?? [primaryEntityRef])]
    .sort((left, right) => left.localeCompare(right))

  return {
    id: [
      subject.code,
      subject.subjectType,
      subject.subjectId,
      subject.path,
      subject.idSuffix ?? entityRefs.join("|"),
    ]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(":"),
    severity: subject.severity,
    code: subject.code,
    message: subject.message,
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
    path: subject.path,
    entityRefs,
    blocking: subject.blocking ?? subject.severity === "blocking",
  }
}

function countDuplicates(values: string[]): string[] {
  const counts = new Map<string, number>()

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort((left, right) => left.localeCompare(right))
}

function parseIpv4(value: string): number[] | null {
  const parts = value.trim().split(".")
  if (parts.length !== 4) {
    return null
  }

  const octets = parts.map((part) => Number(part))
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
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

function isIpv4InCidr(address: string, cidr: string): boolean {
  const parsedAddress = parseIpv4(address)
  const parsedCidr = parseIpv4Cidr(cidr)
  if (!parsedAddress || !parsedCidr) {
    return false
  }

  const mask =
    parsedCidr.prefix === 0 ? 0 : (0xffffffff << (32 - parsedCidr.prefix)) >>> 0
  const addressNumber = ipv4ToNumber(parsedAddress)

  return (addressNumber & mask) === (parsedCidr.network & mask)
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

function validateSegment(segment: NetworkSegment): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const entityRef = `segment:${segment.id}`
  const requiresCidr = subnetLikeSegmentTypes.has(segment.segmentType)

  if (requiresCidr && !segment.cidr) {
    issues.push(
      createIssue({
        code: "segment_cidr_required",
        message: `Segment ${segment.id} requires a CIDR for type ${segment.segmentType}.`,
        severity: "blocking",
        subjectType: "segment",
        subjectId: segment.id,
        path: "segments[].cidr",
        entityRefs: [entityRef],
      }),
    )
  }

  if (segment.cidr && !parseIpv4Cidr(segment.cidr)) {
    issues.push(
      createIssue({
        code: "segment_cidr_invalid",
        message: `Segment ${segment.id} has an invalid IPv4 CIDR: ${segment.cidr}.`,
        severity: "blocking",
        subjectType: "segment",
        subjectId: segment.id,
        path: "segments[].cidr",
        entityRefs: [entityRef],
      }),
    )
  }

  if (segment.gateway && !parseIpv4(segment.gateway)) {
    issues.push(
      createIssue({
        code: "segment_gateway_invalid",
        message: `Segment ${segment.id} has an invalid IPv4 gateway: ${segment.gateway}.`,
        severity: "blocking",
        subjectType: "segment",
        subjectId: segment.id,
        path: "segments[].gateway",
        entityRefs: [entityRef],
      }),
    )
  }

  if (segment.gateway && !segment.cidr) {
    issues.push(
      createIssue({
        code: "segment_gateway_requires_cidr",
        message: `Segment ${segment.id} cannot define a gateway without a CIDR.`,
        severity: "blocking",
        subjectType: "segment",
        subjectId: segment.id,
        path: "segments[].gateway",
        entityRefs: [entityRef],
      }),
    )
  }

  if (segment.gateway && segment.cidr && parseIpv4(segment.gateway) && parseIpv4Cidr(segment.cidr)) {
    if (!isIpv4InCidr(segment.gateway, segment.cidr)) {
      issues.push(
        createIssue({
          code: "segment_gateway_outside_cidr",
          message: `Segment ${segment.id} has a gateway outside its CIDR range.`,
          severity: "blocking",
          subjectType: "segment",
          subjectId: segment.id,
          path: "segments[].gateway",
          entityRefs: [entityRef],
        }),
      )
    }
  }

  return issues
}

function validateNetworkSegmentRelationships(args: {
  input: CloudSolutionSliceInput
  requiresIpAllocationTable: boolean
}): ValidationIssue[] {
  const { input, requiresIpAllocationTable } = args
  const issues: ValidationIssue[] = []
  const segmentIdsWithAllocations = new Set(input.allocations.map((allocation) => allocation.segmentId))
  const candidateSegments = input.segments
    .filter((segment) => subnetLikeSegmentTypes.has(segment.segmentType))
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))

  for (const segment of candidateSegments) {
    const requiresGateway = requiresIpAllocationTable || segmentIdsWithAllocations.has(segment.id)

    if (requiresGateway && !segment.gateway) {
      issues.push(
        createIssue({
          code: "segment_gateway_required",
          message: `Segment ${segment.id} requires a gateway for the current IP planning slice.`,
          severity: "blocking",
          subjectType: "segment",
          subjectId: segment.id,
          path: "segments[].gateway",
          entityRefs: [`segment:${segment.id}`],
        }),
      )
    }
  }

  for (let index = 0; index < candidateSegments.length; index += 1) {
    const currentSegment = candidateSegments[index]
    if (!currentSegment?.cidr) {
      continue
    }

    const currentRange = getIpv4CidrRange(currentSegment.cidr)
    if (!currentRange) {
      continue
    }

    for (let nextIndex = index + 1; nextIndex < candidateSegments.length; nextIndex += 1) {
      const nextSegment = candidateSegments[nextIndex]
      if (!nextSegment?.cidr) {
        continue
      }

      const nextRange = getIpv4CidrRange(nextSegment.cidr)
      if (!nextRange) {
        continue
      }

      const overlaps = currentRange.start <= nextRange.end && nextRange.start <= currentRange.end
      if (!overlaps) {
        continue
      }

      issues.push(
        createIssue({
          code: "segment_cidr_overlap",
          message: `Segments ${currentSegment.id} and ${nextSegment.id} define overlapping CIDR ranges.`,
          severity: "blocking",
          subjectType: "segment",
          subjectId: currentSegment.id,
          path: "segments[].cidr",
          entityRefs: [`segment:${currentSegment.id}`, `segment:${nextSegment.id}`],
          idSuffix: `${currentSegment.id}:${nextSegment.id}`,
        }),
      )
    }
  }

  return issues
}

function validateAllocation(args: {
  allocation: IpAllocation
  deviceIds: Set<string>
  segmentMap: Map<string, NetworkSegment>
}): ValidationIssue[] {
  const { allocation, deviceIds, segmentMap } = args
  const issues: ValidationIssue[] = []
  const allocationEntityRef = `allocation:${allocation.id}`
  const segment = segmentMap.get(allocation.segmentId)

  if (!segment) {
    issues.push(
      createIssue({
        code: "allocation_segment_missing",
        message: `Allocation ${allocation.id} references a missing segment: ${allocation.segmentId}.`,
        severity: "blocking",
        subjectType: "allocation",
        subjectId: allocation.id,
        path: "allocations[].segmentId",
        entityRefs: [allocationEntityRef, `segment:${allocation.segmentId}`],
      }),
    )

    return issues
  }

  if (!parseIpv4(allocation.ipAddress)) {
    issues.push(
      createIssue({
        code: "allocation_ip_invalid",
        message: `Allocation ${allocation.id} has an invalid IPv4 address: ${allocation.ipAddress}.`,
        severity: "blocking",
        subjectType: "allocation",
        subjectId: allocation.id,
        path: "allocations[].ipAddress",
        entityRefs: [allocationEntityRef, `segment:${segment.id}`],
      }),
    )
  }

  if (allocation.deviceId && !deviceIds.has(allocation.deviceId)) {
    issues.push(
      createIssue({
        code: "allocation_device_missing",
        message: `Allocation ${allocation.id} references a missing device: ${allocation.deviceId}.`,
        severity: "blocking",
        subjectType: "allocation",
        subjectId: allocation.id,
        path: "allocations[].deviceId",
        entityRefs: [allocationEntityRef, `device:${allocation.deviceId}`],
      }),
    )
  }

  if (
    parseIpv4(allocation.ipAddress)
    && segment.cidr
    && parseIpv4Cidr(segment.cidr)
    && !isIpv4InCidr(allocation.ipAddress, segment.cidr)
  ) {
    issues.push(
      createIssue({
        code: "allocation_ip_outside_segment",
        message: `Allocation ${allocation.id} has an IP outside segment ${segment.id}.`,
        severity: "blocking",
        subjectType: "allocation",
        subjectId: allocation.id,
        path: "allocations[].ipAddress",
        entityRefs: [allocationEntityRef, `segment:${segment.id}`],
      }),
    )
  }

  return issues
}

function normalizeLinkPairKey(link: Link): string {
  return [link.endpointA.portId, link.endpointB.portId]
    .sort((left, right) => left.localeCompare(right))
    .join(":")
}

function validatePort(args: {
  port: Port
  deviceIds: Set<string>
}): ValidationIssue[] {
  const { port, deviceIds } = args

  if (deviceIds.has(port.deviceId)) {
    return []
  }

  return [
    createIssue({
      code: "port_device_missing",
      message: `Port ${port.id} references a missing device: ${port.deviceId}.`,
      severity: "blocking",
      subjectType: "port",
      subjectId: port.id,
      path: "ports[].deviceId",
      entityRefs: [`port:${port.id}`, `device:${port.deviceId}`],
    }),
  ]
}

function validateLink(args: {
  link: Link
  portIds: Set<string>
}): ValidationIssue[] {
  const { link, portIds } = args
  const issues: ValidationIssue[] = []

  if (link.endpointA.portId === link.endpointB.portId) {
    issues.push(
      createIssue({
        code: "link_self_reference",
        message: `Link ${link.id} cannot connect a port to itself: ${link.endpointA.portId}.`,
        severity: "blocking",
        subjectType: "link",
        subjectId: link.id,
        path: "links[].endpointA.portId",
        entityRefs: [`link:${link.id}`, `port:${link.endpointA.portId}`],
      }),
    )
  }

  if (!portIds.has(link.endpointA.portId)) {
    issues.push(
      createIssue({
        code: "link_port_missing",
        message: `Link ${link.id} references a missing port on endpointA: ${link.endpointA.portId}.`,
        severity: "blocking",
        subjectType: "link",
        subjectId: link.id,
        path: "links[].endpointA.portId",
        entityRefs: [`link:${link.id}`, `port:${link.endpointA.portId}`],
      }),
    )
  }

  if (!portIds.has(link.endpointB.portId)) {
    issues.push(
      createIssue({
        code: "link_port_missing",
        message: `Link ${link.id} references a missing port on endpointB: ${link.endpointB.portId}.`,
        severity: "blocking",
        subjectType: "link",
        subjectId: link.id,
        path: "links[].endpointB.portId",
        entityRefs: [`link:${link.id}`, `port:${link.endpointB.portId}`],
      }),
    )
  }

  return issues
}

function requiresPhysicalPlacement(input: CloudSolutionSliceInput): boolean {
  return input.requirement.artifactRequests.includes("device-cabling-table")
    || input.requirement.artifactRequests.includes("device-rack-layout")
    || input.requirement.artifactRequests.includes("device-port-plan")
}

function requiresRackAssignment(input: CloudSolutionSliceInput): boolean {
  return requiresPhysicalPlacement(input)
    || (
      input.requirement.artifactRequests.includes("device-port-connection-table")
      && input.racks.length > 1
    )
}

function getArtifactRequestFlags(input: CloudSolutionSliceInput) {
  return {
    requiresDeviceCablingTable: input.requirement.artifactRequests.includes("device-cabling-table"),
    requiresDeviceRackLayout: input.requirement.artifactRequests.includes("device-rack-layout"),
    requiresDevicePortPlan: input.requirement.artifactRequests.includes("device-port-plan"),
    requiresDevicePortConnectionTable: input.requirement.artifactRequests.includes(
      "device-port-connection-table",
    ),
    requiresIpAllocationTable: input.requirement.artifactRequests.includes("ip-allocation-table"),
  }
}

function validatePhysicalArtifactCompleteness(args: {
  input: CloudSolutionSliceInput
  requiresDeviceCablingTable: boolean
  requiresDeviceRackLayout: boolean
  requiresDevicePortPlan: boolean
  requiresDevicePortConnectionTable: boolean
  requiresIpAllocationTable: boolean
}): ValidationIssue[] {
  const {
    input,
    requiresDeviceCablingTable,
    requiresDeviceRackLayout,
    requiresDevicePortPlan,
    requiresDevicePortConnectionTable,
    requiresIpAllocationTable,
  } = args
  const issues: ValidationIssue[] = []
  const rackPlacementArtifactsRequested =
    requiresDeviceCablingTable || requiresDeviceRackLayout || requiresDevicePortPlan
  const connectivityArtifactsRequested =
    requiresDeviceCablingTable || requiresDevicePortPlan || requiresDevicePortConnectionTable
  const completenessChecksRequested =
    rackPlacementArtifactsRequested || connectivityArtifactsRequested || requiresIpAllocationTable

  if (!completenessChecksRequested) {
    return issues
  }

  if (rackPlacementArtifactsRequested && input.racks.length === 0) {
    issues.push(
      createIssue({
        code: "physical_racks_missing",
        message: "Requested physical planning artifacts require at least one explicit rack.",
        severity: "blocking",
        subjectType: "requirement",
        subjectId: input.requirement.id,
        path: "racks",
        entityRefs: [`requirement:${input.requirement.id}`],
      }),
    )
  }

  if (rackPlacementArtifactsRequested && input.devices.length === 0) {
    issues.push(
      createIssue({
        code: "physical_devices_missing",
        message: "Requested physical planning artifacts require at least one explicit device.",
        severity: "blocking",
        subjectType: "requirement",
        subjectId: input.requirement.id,
        path: "devices",
        entityRefs: [`requirement:${input.requirement.id}`],
      }),
    )
  }

  if (connectivityArtifactsRequested && input.ports.length === 0) {
    issues.push(
      createIssue({
        code: "physical_ports_missing",
        message: "Requested physical planning artifacts require at least one explicit port.",
        severity: "blocking",
        subjectType: "requirement",
        subjectId: input.requirement.id,
        path: "ports",
        entityRefs: [`requirement:${input.requirement.id}`],
      }),
    )
  }

  if (requiresDeviceCablingTable && input.links.length === 0) {
    issues.push(
      createIssue({
        code: "device_cabling_links_missing",
        message: "Requested device-cabling-table requires at least one explicit link.",
        severity: "blocking",
        subjectType: "requirement",
        subjectId: input.requirement.id,
        path: "links",
        entityRefs: [`requirement:${input.requirement.id}`],
      }),
    )
  }

  if (requiresDeviceRackLayout && input.devices.length === 0) {
    issues.push(
      createIssue({
        code: "rack_layout_devices_missing",
        message: "Requested device-rack-layout requires at least one explicit device.",
        severity: "blocking",
        subjectType: "requirement",
        subjectId: input.requirement.id,
        path: "devices",
        entityRefs: [`requirement:${input.requirement.id}`],
      }),
    )
  }

  if (requiresDevicePortConnectionTable && input.links.length === 0) {
    issues.push(
      createIssue({
        code: "port_connection_links_missing",
        message: "Requested device-port-connection-table requires at least one explicit link.",
        severity: "blocking",
        subjectType: "requirement",
        subjectId: input.requirement.id,
        path: "links",
        entityRefs: [`requirement:${input.requirement.id}`],
      }),
    )
  }

  if (requiresIpAllocationTable && input.allocations.length === 0) {
    issues.push(
      createIssue({
        code: "ip_allocations_missing",
        message: "Requested ip-allocation-table requires at least one explicit allocation.",
        severity: "blocking",
        subjectType: "requirement",
        subjectId: input.requirement.id,
        path: "allocations",
        entityRefs: [`requirement:${input.requirement.id}`],
      }),
    )
  }

  return issues
}

function validatePhysicalFactConfidence(args: {
  input: CloudSolutionSliceInput
  requiresDeviceCablingTable: boolean
  requiresDeviceRackLayout: boolean
  requiresDevicePortPlan: boolean
  requiresDevicePortConnectionTable: boolean
}): ValidationIssue[] {
  const {
    input,
    requiresDeviceCablingTable,
    requiresDeviceRackLayout,
    requiresDevicePortPlan,
    requiresDevicePortConnectionTable,
  } = args
  const physicalArtifactsRequested =
    requiresDeviceCablingTable
    || requiresDeviceRackLayout
    || requiresDevicePortPlan
    || requiresDevicePortConnectionTable

  if (!physicalArtifactsRequested) {
    return []
  }

  const issues: ValidationIssue[] = []
  const entities = [
    ...input.racks.map((rack) => ({
      subjectType: "rack" as const,
      subjectId: rack.id,
      path: "racks[].statusConfidence",
      statusConfidence: rack.statusConfidence,
    })),
    ...input.devices.map((device) => ({
      subjectType: "device" as const,
      subjectId: device.id,
      path: "devices[].statusConfidence",
      statusConfidence: device.statusConfidence,
    })),
    ...input.ports.map((port) => ({
      subjectType: "port" as const,
      subjectId: port.id,
      path: "ports[].statusConfidence",
      statusConfidence: port.statusConfidence,
    })),
    ...(requiresDeviceCablingTable || input.links.length > 0
      ? input.links.map((link) => ({
          subjectType: "link" as const,
          subjectId: link.id,
          path: "links[].statusConfidence",
          statusConfidence: link.statusConfidence,
        }))
      : []),
  ]

  for (const entity of entities) {
    if (entity.statusConfidence === "confirmed") {
      continue
    }

    issues.push(
      createIssue({
        code: "physical_fact_not_confirmed",
        message: `${entity.subjectType} ${entity.subjectId} has statusConfidence ${entity.statusConfidence} and cannot drive requested physical artifacts.`,
        severity: "blocking",
        subjectType: entity.subjectType,
        subjectId: entity.subjectId,
        path: entity.path,
        entityRefs: [`${entity.subjectType}:${entity.subjectId}`],
      }),
    )
  }

  return issues
}

function validateNetworkFactConfidence(args: {
  input: CloudSolutionSliceInput
  requiresIpAllocationTable: boolean
}): ValidationIssue[] {
  const { input, requiresIpAllocationTable } = args

  if (!requiresIpAllocationTable) {
    return []
  }

  const issues: ValidationIssue[] = []
  const entities = [
    ...input.segments.map((segment) => ({
      subjectType: "segment" as const,
      subjectId: segment.id,
      path: "segments[].statusConfidence",
      statusConfidence: segment.statusConfidence,
    })),
    ...input.allocations.map((allocation) => ({
      subjectType: "allocation" as const,
      subjectId: allocation.id,
      path: "allocations[].statusConfidence",
      statusConfidence: allocation.statusConfidence,
    })),
  ]

  for (const entity of entities) {
    if (entity.statusConfidence === "confirmed") {
      continue
    }

    issues.push(
      createIssue({
        code: "network_fact_not_confirmed",
        message: `${entity.subjectType} ${entity.subjectId} has statusConfidence ${entity.statusConfidence} and cannot drive requested IP artifacts.`,
        severity: "blocking",
        subjectType: entity.subjectType,
        subjectId: entity.subjectId,
        path: entity.path,
        entityRefs: [`${entity.subjectType}:${entity.subjectId}`],
      }),
    )
  }

  return issues
}

function validateDeviceRedundancyIntent(args: {
  devices: Device[]
  ports: Port[]
  links: Link[]
}): ValidationIssue[] {
  const { devices, ports, links } = args
  const portMap = new Map(ports.map((port) => [port.id, port]))
  const linkCountsByDevice = new Map<string, Set<string>>()
  const localPortIdsByDevice = new Map<string, Set<string>>()
  const peerDeviceIdsByDevice = new Map<string, Set<string>>()
  const redundancyGroupsByDevice = new Map<string, Set<string>>()
  const missingRedundancyGroupByDevice = new Set<string>()

  for (const link of links) {
    const endpointAPort = portMap.get(link.endpointA.portId)
    const endpointBPort = portMap.get(link.endpointB.portId)

    if (!endpointAPort || !endpointBPort) {
      continue
    }

    const directionalEndpoints = [
      {
        deviceId: endpointAPort.deviceId,
        localPortId: endpointAPort.id,
        peerDeviceId: endpointBPort.deviceId,
      },
      {
        deviceId: endpointBPort.deviceId,
        localPortId: endpointBPort.id,
        peerDeviceId: endpointAPort.deviceId,
      },
    ]

    for (const directionalEndpoint of directionalEndpoints) {
      const linkIds = linkCountsByDevice.get(directionalEndpoint.deviceId) ?? new Set<string>()
      linkIds.add(link.id)
      linkCountsByDevice.set(directionalEndpoint.deviceId, linkIds)

      const localPortIds = localPortIdsByDevice.get(directionalEndpoint.deviceId) ?? new Set<string>()
      localPortIds.add(directionalEndpoint.localPortId)
      localPortIdsByDevice.set(directionalEndpoint.deviceId, localPortIds)

      const peerDeviceIds = peerDeviceIdsByDevice.get(directionalEndpoint.deviceId) ?? new Set<string>()
      peerDeviceIds.add(directionalEndpoint.peerDeviceId)
      peerDeviceIdsByDevice.set(directionalEndpoint.deviceId, peerDeviceIds)

      if (!link.redundancyGroup) {
        missingRedundancyGroupByDevice.add(directionalEndpoint.deviceId)
      } else {
        const redundancyGroups = redundancyGroupsByDevice.get(directionalEndpoint.deviceId) ?? new Set<string>()
        redundancyGroups.add(link.redundancyGroup)
        redundancyGroupsByDevice.set(directionalEndpoint.deviceId, redundancyGroups)
      }
    }
  }

  const issues: ValidationIssue[] = []

  for (const device of devices) {
    if (!device.redundancyIntent || device.redundancyIntent === "single-homed") {
      continue
    }

    const linkCount = linkCountsByDevice.get(device.id)?.size ?? 0
    const localPortCount = localPortIdsByDevice.get(device.id)?.size ?? 0
    const peerDeviceCount = peerDeviceIdsByDevice.get(device.id)?.size ?? 0

    const severity = device.redundancyIntent === "dual-homed-required"
      ? "blocking"
      : "warning"

    if (linkCount < 2 || localPortCount < 2) {
      issues.push(
        createIssue({
          code: "device_redundancy_links_insufficient",
          message: `Device ${device.id} has redundancyIntent ${device.redundancyIntent} but only ${linkCount} link(s) across ${localPortCount} local port(s).`,
          severity,
          subjectType: "device",
          subjectId: device.id,
          path: "devices[].redundancyIntent",
          entityRefs: [`device:${device.id}`],
          blocking: severity === "blocking",
        }),
      )
      continue
    }

    if (peerDeviceCount < 2) {
      issues.push(
        createIssue({
          code: "device_redundancy_peers_insufficient",
          message: `Device ${device.id} has redundancyIntent ${device.redundancyIntent} but only ${peerDeviceCount} distinct peer device(s).`,
          severity,
          subjectType: "device",
          subjectId: device.id,
          path: "devices[].redundancyIntent",
          entityRefs: [`device:${device.id}`],
          blocking: severity === "blocking",
        }),
      )
    }

    if (missingRedundancyGroupByDevice.has(device.id)) {
      issues.push(
        createIssue({
          code: "redundancy_group_missing",
          message: `Device ${device.id} has redundancyIntent ${device.redundancyIntent} but one or more redundant links are missing redundancyGroup.`,
          severity,
          subjectType: "device",
          subjectId: device.id,
          path: "links[].redundancyGroup",
          entityRefs: [`device:${device.id}`],
          blocking: severity === "blocking",
        }),
      )
    }

    const redundancyGroupCount = redundancyGroupsByDevice.get(device.id)?.size ?? 0
    if (redundancyGroupCount > 1) {
      issues.push(
        createIssue({
          code: "redundancy_group_inconsistent",
          message: `Device ${device.id} has redundancyIntent ${device.redundancyIntent} but its redundant links span ${redundancyGroupCount} redundancy groups.`,
          severity,
          subjectType: "device",
          subjectId: device.id,
          path: "links[].redundancyGroup",
          entityRefs: [`device:${device.id}`],
          blocking: severity === "blocking",
        }),
      )
    }
  }

  return issues
}

function validateDeviceRackPlacement(args: {
  device: Device
  rackMap: Map<string, Rack>
  rackAssignmentRequired: boolean
  physicalPlacementRequired: boolean
}): ValidationIssue[] {
  const { device, rackMap, rackAssignmentRequired, physicalPlacementRequired } = args
  const issues: ValidationIssue[] = []
  const deviceEntityRef = `device:${device.id}`

  if (rackAssignmentRequired && !device.rackId) {
    issues.push(
      createIssue({
        code: "device_rack_required",
        message: `Device ${device.id} requires a rack reference for physical planning artifacts.`,
        severity: "blocking",
        subjectType: "device",
        subjectId: device.id,
        path: "devices[].rackId",
        entityRefs: [deviceEntityRef],
      }),
    )
  }

  if (device.rackId && !rackMap.has(device.rackId)) {
    issues.push(
      createIssue({
        code: "device_rack_missing",
        message: `Device ${device.id} references a missing rack: ${device.rackId}.`,
        severity: "blocking",
        subjectType: "device",
        subjectId: device.id,
        path: "devices[].rackId",
        entityRefs: [deviceEntityRef, `rack:${device.rackId}`],
      }),
    )
  }

  if (physicalPlacementRequired && typeof device.rackPosition !== "number") {
    issues.push(
      createIssue({
        code: "device_rack_position_required",
        message: `Device ${device.id} requires an explicit rack position for physical planning artifacts.`,
        severity: "blocking",
        subjectType: "device",
        subjectId: device.id,
        path: "devices[].rackPosition",
        entityRefs: [deviceEntityRef],
      }),
    )
  }

  if (physicalPlacementRequired && typeof device.rackUnitHeight !== "number") {
    issues.push(
      createIssue({
        code: "device_rack_unit_height_required",
        message: `Device ${device.id} requires an explicit rack unit height for physical planning artifacts.`,
        severity: "blocking",
        subjectType: "device",
        subjectId: device.id,
        path: "devices[].rackUnitHeight",
        entityRefs: [deviceEntityRef],
      }),
    )
  }

  if (
    device.rackId
    && typeof device.rackPosition === "number"
    && typeof device.rackUnitHeight === "number"
  ) {
    const rack = rackMap.get(device.rackId)
    const rackEndPosition = device.rackPosition + device.rackUnitHeight - 1

    if (rack?.uHeight && rackEndPosition > rack.uHeight) {
      issues.push(
        createIssue({
          code: "rack_position_exceeds_height",
          message: `Device ${device.id} exceeds rack ${rack.id} height at units ${device.rackPosition}-${rackEndPosition}.`,
          severity: "blocking",
          subjectType: "rack",
          subjectId: rack.id,
          path: "devices[].rackPosition",
          entityRefs: [deviceEntityRef, `rack:${rack.id}`],
          idSuffix: `${device.id}:${device.rackPosition}-${rackEndPosition}`,
        }),
      )
    }
  }

  return issues
}

function validateMultiRackSemantics(args: {
  input: CloudSolutionSliceInput
  ports: Port[]
}): ValidationIssue[] {
  const { input, ports } = args

  if (!input.requirement.artifactRequests.includes("device-port-connection-table")) {
    return []
  }

  const portMap = new Map(ports.map((port) => [port.id, port]))
  const deviceMap = new Map(input.devices.map((device) => [device.id, device]))
  const issues: ValidationIssue[] = []
  let crossRackLinkCount = 0

  for (const link of input.links) {
    const endpointAPort = portMap.get(link.endpointA.portId)
    const endpointBPort = portMap.get(link.endpointB.portId)

    if (!endpointAPort || !endpointBPort) {
      continue
    }

    const endpointADevice = deviceMap.get(endpointAPort.deviceId)
    const endpointBDevice = deviceMap.get(endpointBPort.deviceId)

    if (!endpointADevice || !endpointBDevice || !endpointADevice.rackId || !endpointBDevice.rackId) {
      continue
    }

    const endpointsAreCrossRack = endpointADevice.rackId !== endpointBDevice.rackId
    if (endpointsAreCrossRack) {
      crossRackLinkCount += 1
    }

    if (link.purpose?.includes("inter-rack") && !endpointsAreCrossRack) {
      issues.push(
        createIssue({
          code: "inter_rack_link_same_rack",
          message: `Link ${link.id} is marked inter-rack but both endpoints resolve to rack ${endpointADevice.rackId}.`,
          severity: "blocking",
          subjectType: "link",
          subjectId: link.id,
          path: "links[].purpose",
          entityRefs: [
            `link:${link.id}`,
            `device:${endpointADevice.id}`,
            `device:${endpointBDevice.id}`,
            `rack:${endpointADevice.rackId}`,
          ],
        }),
      )
    }
  }

  if (input.racks.length > 1 && crossRackLinkCount === 0) {
    issues.push(
      createIssue({
        code: "multi_rack_links_missing",
        message: "Multi-rack connection planning requires at least one cross-rack link.",
        severity: "blocking",
        subjectType: "requirement",
        subjectId: input.requirement.id,
        path: "links",
        entityRefs: [`requirement:${input.requirement.id}`],
      }),
    )
  }

  return issues
}

function validateRackPlacementOverlaps(args: {
  devices: Device[]
  rackMap: Map<string, Rack>
}): ValidationIssue[] {
  const { devices, rackMap } = args
  const placementsByRack = new Map<string, Array<{
    deviceId: string
    start: number
    end: number
  }>>()

  for (const device of devices) {
    if (
      !device.rackId
      || typeof device.rackPosition !== "number"
      || typeof device.rackUnitHeight !== "number"
      || !rackMap.has(device.rackId)
    ) {
      continue
    }

    const placements = placementsByRack.get(device.rackId) ?? []
    placements.push({
      deviceId: device.id,
      start: device.rackPosition,
      end: device.rackPosition + device.rackUnitHeight - 1,
    })
    placementsByRack.set(device.rackId, placements)
  }

  const issues: ValidationIssue[] = []

  for (const [rackId, placements] of placementsByRack.entries()) {
    const sortedPlacements = placements
      .slice()
      .sort((left, right) => left.start - right.start || left.deviceId.localeCompare(right.deviceId))

    for (let index = 0; index < sortedPlacements.length; index += 1) {
      const currentPlacement = sortedPlacements[index]
      if (!currentPlacement) {
        continue
      }

      for (let nextIndex = index + 1; nextIndex < sortedPlacements.length; nextIndex += 1) {
        const nextPlacement = sortedPlacements[nextIndex]
        if (!nextPlacement) {
          continue
        }

        if (nextPlacement.start > currentPlacement.end) {
          break
        }

        const overlapStart = Math.max(currentPlacement.start, nextPlacement.start)
        const overlapEnd = Math.min(currentPlacement.end, nextPlacement.end)
        issues.push(
          createIssue({
            code: "rack_position_overlap",
            message: `Devices ${currentPlacement.deviceId} and ${nextPlacement.deviceId} overlap in rack ${rackId} at units ${overlapStart}-${overlapEnd}.`,
            severity: "blocking",
            subjectType: "rack",
            subjectId: rackId,
            path: "devices[].rackPosition",
            entityRefs: [
              `rack:${rackId}`,
              `device:${currentPlacement.deviceId}`,
              `device:${nextPlacement.deviceId}`,
            ],
            idSuffix: `${currentPlacement.deviceId}:${nextPlacement.deviceId}:${overlapStart}-${overlapEnd}`,
          }),
        )
      }
    }
  }

  return issues
}

function validateRackPowerBudgets(args: {
  devices: Device[]
  rackMap: Map<string, Rack>
  requiresDeviceRackLayout: boolean
}): ValidationIssue[] {
  const { devices, rackMap, requiresDeviceRackLayout } = args
  const powerValidatedDevices = devices.filter((device) => !powerValidationExcludedRoles.has(device.role))
  const requiresPowerPlanning = requiresDeviceRackLayout
    && (
      powerValidatedDevices.some((device) => typeof device.powerWatts === "number" || !!device.highAvailabilityGroup)
      || [...rackMap.values()].some((rack) => typeof rack.maxPowerKw === "number")
    )

  if (!requiresPowerPlanning) {
    return []
  }

  const issues: ValidationIssue[] = []
  const placedDevices = powerValidatedDevices.filter((device) => device.rackId && rackMap.has(device.rackId))
  const rackIdsWithPlacedDevices = [...new Set(placedDevices.map((device) => device.rackId!))]

  for (const rackId of rackIdsWithPlacedDevices) {
    const rack = rackMap.get(rackId)
    if (rack && typeof rack.maxPowerKw !== "number") {
      issues.push(
        createIssue({
          code: "rack_power_budget_missing",
          message: `Rack ${rackId} requires maxPowerKw before high-reliability power validation can run.`,
          severity: "blocking",
          subjectType: "rack",
          subjectId: rackId,
          path: "racks[].maxPowerKw",
          entityRefs: [
            `rack:${rackId}`,
            ...placedDevices
              .filter((device) => device.rackId === rackId)
              .map((device) => `device:${device.id}`),
          ],
        }),
      )
    }
  }

  for (const device of placedDevices) {
    if (typeof device.powerWatts === "number") {
      continue
    }

    issues.push(
      createIssue({
        code: "device_power_missing",
        message: `Device ${device.id} requires powerWatts before high-reliability power validation can run.`,
        severity: "blocking",
        subjectType: "device",
        subjectId: device.id,
        path: "devices[].powerWatts",
        entityRefs: [
          `device:${device.id}`,
          ...(device.rackId ? [`rack:${device.rackId}`] : []),
        ],
      }),
    )
  }

  const powerByRack = new Map<string, number>()

  for (const device of powerValidatedDevices) {
    if (!device.rackId || typeof device.powerWatts !== "number" || !rackMap.has(device.rackId)) {
      continue
    }

    powerByRack.set(device.rackId, (powerByRack.get(device.rackId) ?? 0) + device.powerWatts)
  }

  for (const [rackId, totalPowerWatts] of powerByRack.entries()) {
    const rack = rackMap.get(rackId)
    if (!rack?.maxPowerKw) {
      continue
    }

    const powerThresholdWatts = rack.maxPowerKw * 1000 * 0.8
    if (totalPowerWatts <= powerThresholdWatts) {
      continue
    }

    issues.push(
      createIssue({
        code: "rack_power_threshold_exceeded",
        message: `Rack ${rackId} exceeds the 80% power threshold with ${totalPowerWatts}W planned against a ${rack.maxPowerKw}kW budget.`,
        severity: "blocking",
        subjectType: "rack",
        subjectId: rackId,
        path: "racks[].maxPowerKw",
        entityRefs: [
          `rack:${rackId}`,
          ...devices
            .filter((device) => device.rackId === rackId && typeof device.powerWatts === "number")
            .map((device) => `device:${device.id}`),
        ],
      }),
    )
  }

  return issues
}

function validateHighAvailabilityRoles(args: {
  devices: Device[]
}): ValidationIssue[] {
  const { devices } = args
  const devicesByHaGroup = new Map<string, Device[]>()
  const issues: ValidationIssue[] = []

  for (const device of devices) {
    if (!device.highAvailabilityGroup) {
      continue
    }

    if (!device.highAvailabilityRole) {
      issues.push(
        createIssue({
          code: "ha_group_role_missing",
          message: `Device ${device.id} is in highAvailabilityGroup ${device.highAvailabilityGroup} but has no highAvailabilityRole.`,
          severity: "blocking",
          subjectType: "device",
          subjectId: device.id,
          path: "devices[].highAvailabilityRole",
          entityRefs: [
            `device:${device.id}`,
          ],
        }),
      )
    }

    const groupedDevices = devicesByHaGroup.get(device.highAvailabilityGroup) ?? []
    groupedDevices.push(device)
    devicesByHaGroup.set(device.highAvailabilityGroup, groupedDevices)
  }

  for (const [groupId, groupedDevices] of devicesByHaGroup.entries()) {
    if (groupedDevices.length < 2) {
      continue
    }

    const roles = groupedDevices
      .map((device) => device.highAvailabilityRole)
      .filter((role): role is NonNullable<Device["highAvailabilityRole"]> => typeof role === "string")
    const roleSet = new Set(roles)
    const hasDuplicateRoles = roleSet.size !== roles.length
    const hasCompletePrimarySecondaryPair = groupedDevices.length !== 2
      || (roleSet.has("primary") && roleSet.has("secondary"))

    if (roles.length !== groupedDevices.length || hasDuplicateRoles || !hasCompletePrimarySecondaryPair) {
      issues.push(
        createIssue({
          code: "ha_group_role_incomplete",
          message: `High-availability group ${groupId} must resolve to a complete primary/secondary role set before high-reliability validation can continue.`,
          severity: "blocking",
          subjectType: "device",
          subjectId: groupedDevices[0]?.id ?? groupId,
          path: "devices[].highAvailabilityRole",
          entityRefs: groupedDevices.map((device) => `device:${device.id}`),
          idSuffix: groupId,
        }),
      )
    }
  }

  return issues
}

function validateHighAvailabilityAdjacency(args: {
  devices: Device[]
  rackMap: Map<string, Rack>
}): ValidationIssue[] {
  const { devices, rackMap } = args
  const devicesByHaGroup = new Map<string, Device[]>()

  for (const device of devices) {
    if (!device.highAvailabilityGroup) {
      continue
    }

    const groupedDevices = devicesByHaGroup.get(device.highAvailabilityGroup) ?? []
    groupedDevices.push(device)
    devicesByHaGroup.set(device.highAvailabilityGroup, groupedDevices)
  }

  const issues: ValidationIssue[] = []

  for (const [groupId, groupedDevices] of devicesByHaGroup.entries()) {
    if (groupedDevices.length < 2) {
      continue
    }

    const sortedDevices = groupedDevices.slice().sort((left, right) => left.id.localeCompare(right.id))
    for (let index = 0; index < sortedDevices.length; index += 1) {
      const currentDevice = sortedDevices[index]
      if (!currentDevice?.rackId) {
        continue
      }

      for (let nextIndex = index + 1; nextIndex < sortedDevices.length; nextIndex += 1) {
        const nextDevice = sortedDevices[nextIndex]
        if (!nextDevice?.rackId) {
          continue
        }

        const currentRack = rackMap.get(currentDevice.rackId)
        const nextRackId = nextDevice.rackId
        const adjacentRackIds = new Set([
          ...(currentRack?.adjacentRackIds ?? []),
          ...(currentRack?.adjacentColumnRackIds ?? []),
        ])
        const nextRack = rackMap.get(nextRackId)
        const reverseAdjacentRackIds = new Set([
          ...(nextRack?.adjacentRackIds ?? []),
          ...(nextRack?.adjacentColumnRackIds ?? []),
        ])
        const racksAreAdjacent = adjacentRackIds.has(nextRackId)
          || reverseAdjacentRackIds.has(currentDevice.rackId)

        if (currentDevice.rackId !== nextRackId && racksAreAdjacent) {
          continue
        }

        issues.push(
          createIssue({
            code: "ha_group_not_adjacent",
            message: `High-availability group ${groupId} places ${currentDevice.id} and ${nextDevice.id} outside adjacent rack or adjacent column positions.`,
            severity: "blocking",
            subjectType: "rack",
            subjectId: currentDevice.rackId,
            path: "racks[].adjacentRackIds",
            entityRefs: [
              `device:${currentDevice.id}`,
              `device:${nextDevice.id}`,
              `rack:${currentDevice.rackId}`,
              `rack:${nextRackId}`,
            ],
            idSuffix: `${groupId}:${currentDevice.id}:${nextDevice.id}`,
          }),
        )
      }
    }
  }

  return issues
}

function validateMlagPortSymmetry(args: {
  devices: Device[]
  ports: Port[]
  links: Link[]
}): ValidationIssue[] {
  const { devices, ports, links } = args
  const deviceMap = new Map(devices.map((device) => [device.id, device]))
  const portMap = new Map(ports.map((port) => [port.id, port]))
  const linksByDeviceAndGroup = new Map<string, Link[]>()

  for (const link of links) {
    if (!link.redundancyGroup) {
      continue
    }

    const endpointAPort = portMap.get(link.endpointA.portId)
    const endpointBPort = portMap.get(link.endpointB.portId)
    if (!endpointAPort || !endpointBPort) {
      continue
    }

    for (const deviceId of [endpointAPort.deviceId, endpointBPort.deviceId]) {
      const key = `${deviceId}:${link.redundancyGroup}`
      const groupedLinks = linksByDeviceAndGroup.get(key) ?? []
      groupedLinks.push(link)
      linksByDeviceAndGroup.set(key, groupedLinks)
    }
  }

  const issues: ValidationIssue[] = []

  for (const [key, groupedLinks] of linksByDeviceAndGroup.entries()) {
    if (groupedLinks.length < 2) {
      continue
    }

    const [deviceId, redundancyGroup] = key.split(":")
    const device = deviceMap.get(deviceId)
    if (!device?.redundancyIntent || device.redundancyIntent === "single-homed") {
      continue
    }

    const peerPortIndexes = new Set<number>()
    const peerHaGroups = new Set<string>()

    for (const link of groupedLinks) {
      const endpointAPort = portMap.get(link.endpointA.portId)
      const endpointBPort = portMap.get(link.endpointB.portId)
      if (!endpointAPort || !endpointBPort) {
        continue
      }

      const peerPort = endpointAPort.deviceId === deviceId ? endpointBPort : endpointAPort
      const peerDevice = deviceMap.get(peerPort.deviceId)
      if (typeof peerPort.portIndex === "number") {
        peerPortIndexes.add(peerPort.portIndex)
      }
      if (peerDevice?.highAvailabilityGroup) {
        peerHaGroups.add(peerDevice.highAvailabilityGroup)
      }
    }

    if (peerHaGroups.size !== 1 || peerPortIndexes.size <= 1) {
      continue
    }

    issues.push(
      createIssue({
        code: "mlag_port_index_mismatch",
        message: `Redundancy group ${redundancyGroup} connected to ${deviceId} uses mismatched peer port indexes across its HA pair.`,
        severity: device.redundancyIntent === "dual-homed-required" ? "blocking" : "warning",
        subjectType: "device",
        subjectId: deviceId,
        path: "ports[].portIndex",
        entityRefs: [
          `device:${deviceId}`,
          ...groupedLinks
            .map((link) => `link:${link.id}`)
            .sort((left, right) => left.localeCompare(right)),
        ],
        blocking: device.redundancyIntent === "dual-homed-required",
      }),
    )
  }

  return issues
}

function isNetworkInfrastructureDevice(device: Device | undefined): boolean {
  return !!device && !networkInfrastructureExcludedRoles.has(device.role)
}

function validateTypedConnectivitySemantics(args: {
  devices: Device[]
  ports: Port[]
  links: Link[]
}): ValidationIssue[] {
  const { devices, ports, links } = args
  const deviceMap = new Map(devices.map((device) => [device.id, device]))
  const portMap = new Map(ports.map((port) => [port.id, port]))
  const linksByPortId = new Map<string, Link[]>()
  const issues: ValidationIssue[] = []

  for (const link of links) {
    for (const portId of [link.endpointA.portId, link.endpointB.portId]) {
      const portLinks = linksByPortId.get(portId) ?? []
      portLinks.push(link)
      linksByPortId.set(portId, portLinks)
    }
  }

  for (const link of links) {
    const endpointAPort = portMap.get(link.endpointA.portId)
    const endpointBPort = portMap.get(link.endpointB.portId)
    const endpointADevice = endpointAPort ? deviceMap.get(endpointAPort.deviceId) : undefined
    const endpointBDevice = endpointBPort ? deviceMap.get(endpointBPort.deviceId) : undefined

    if (link.linkType && (planeLinkTypes.has(link.linkType) || link.linkType === "uplink" || link.linkType === "peer-link")) {
      for (const port of [endpointAPort, endpointBPort]) {
        if (port?.portType === link.linkType) {
          continue
        }

        issues.push(
          createIssue({
            code: "plane_link_port_type_mismatch",
            message: `Link ${link.id} uses linkType ${link.linkType} but port ${port?.id ?? "unknown"} does not match that type.`,
            severity: "blocking",
            subjectType: "link",
            subjectId: link.id,
            path: "links[].linkType",
            entityRefs: [`link:${link.id}`, ...(port ? [`port:${port.id}`] : [])],
            idSuffix: `${link.id}:${port?.id ?? "missing-port"}`,
          }),
        )
      }
    }

    if (link.linkType === "peer-link") {
      const endpointsAreInfrastructure = isNetworkInfrastructureDevice(endpointADevice)
        && isNetworkInfrastructureDevice(endpointBDevice)
      if (!endpointsAreInfrastructure) {
        issues.push(
          createIssue({
            code: "peer_link_endpoint_invalid",
            message: `Peer-link ${link.id} must connect two network-infrastructure devices.`,
            severity: "blocking",
            subjectType: "link",
            subjectId: link.id,
            path: "links[].linkType",
            entityRefs: [
              `link:${link.id}`,
              ...(endpointADevice ? [`device:${endpointADevice.id}`] : []),
              ...(endpointBDevice ? [`device:${endpointBDevice.id}`] : []),
            ],
          }),
        )
      }

      if (
        endpointADevice
        && endpointBDevice
        && endpointADevice.highAvailabilityGroup !== endpointBDevice.highAvailabilityGroup
      ) {
        issues.push(
          createIssue({
            code: "peer_link_ha_group_invalid",
            message: `Peer-link ${link.id} must terminate on devices in the same high-availability group.`,
            severity: "blocking",
            subjectType: "link",
            subjectId: link.id,
            path: "links[].linkType",
            entityRefs: [
              `link:${link.id}`,
              `device:${endpointADevice.id}`,
              `device:${endpointBDevice.id}`,
            ],
          }),
        )
      }
    }

    if (link.linkType === "inter-switch") {
      if (!(isNetworkInfrastructureDevice(endpointADevice) && isNetworkInfrastructureDevice(endpointBDevice))) {
        issues.push(
          createIssue({
            code: "inter_switch_link_endpoint_invalid",
            message: `Inter-switch link ${link.id} must connect two network-infrastructure devices.`,
            severity: "blocking",
            subjectType: "link",
            subjectId: link.id,
            path: "links[].linkType",
            entityRefs: [
              `link:${link.id}`,
              ...(endpointADevice ? [`device:${endpointADevice.id}`] : []),
              ...(endpointBDevice ? [`device:${endpointBDevice.id}`] : []),
            ],
          }),
        )
      }
    }

    if (link.linkType === "uplink") {
      if (!(isNetworkInfrastructureDevice(endpointADevice) && isNetworkInfrastructureDevice(endpointBDevice))) {
        issues.push(
          createIssue({
            code: "uplink_link_endpoint_invalid",
            message: `Uplink ${link.id} must connect two network-infrastructure devices for deterministic uplink planning.`,
            severity: "blocking",
            subjectType: "link",
            subjectId: link.id,
            path: "links[].linkType",
            entityRefs: [
              `link:${link.id}`,
              ...(endpointADevice ? [`device:${endpointADevice.id}`] : []),
              ...(endpointBDevice ? [`device:${endpointBDevice.id}`] : []),
            ],
          }),
        )
      }
    }
  }

  for (const port of ports) {
    if (!port.portType || (!planeLinkTypes.has(port.portType) && port.portType !== "uplink" && port.portType !== "peer-link")) {
      continue
    }

    const attachedLinks = linksByPortId.get(port.id) ?? []
    for (const link of attachedLinks) {
      if (link.linkType === port.portType) {
        continue
      }

      issues.push(
        createIssue({
          code: "plane_link_port_type_mismatch",
          message: `Port ${port.id} is typed ${port.portType} but link ${link.id} does not carry the same linkType.`,
          severity: "blocking",
          subjectType: "port",
          subjectId: port.id,
          path: "ports[].portType",
          entityRefs: [`port:${port.id}`, `link:${link.id}`],
          idSuffix: `${port.id}:${link.id}`,
        }),
      )
    }
  }

  return issues
}

function validateRedundancyPeerHighAvailability(args: {
  devices: Device[]
  ports: Port[]
  links: Link[]
}): ValidationIssue[] {
  const { devices, ports, links } = args
  const deviceMap = new Map(devices.map((device) => [device.id, device]))
  const portMap = new Map(ports.map((port) => [port.id, port]))
  const linksByDeviceAndGroup = new Map<string, Link[]>()

  for (const link of links) {
    if (!link.redundancyGroup) {
      continue
    }

    const endpointAPort = portMap.get(link.endpointA.portId)
    const endpointBPort = portMap.get(link.endpointB.portId)
    if (!endpointAPort || !endpointBPort) {
      continue
    }

    for (const deviceId of [endpointAPort.deviceId, endpointBPort.deviceId]) {
      const key = `${deviceId}:${link.redundancyGroup}`
      const groupedLinks = linksByDeviceAndGroup.get(key) ?? []
      groupedLinks.push(link)
      linksByDeviceAndGroup.set(key, groupedLinks)
    }
  }

  const issues: ValidationIssue[] = []

  for (const [key, groupedLinks] of linksByDeviceAndGroup.entries()) {
    if (groupedLinks.length < 2) {
      continue
    }

    const separatorIndex = key.indexOf(":")
    const deviceId = separatorIndex >= 0 ? key.slice(0, separatorIndex) : key
    const redundancyGroup = separatorIndex >= 0 ? key.slice(separatorIndex + 1) : key
    const device = deviceMap.get(deviceId)
    if (!device?.redundancyIntent || device.redundancyIntent === "single-homed") {
      continue
    }

    const peerDevices = new Map<string, Device>()

    for (const link of groupedLinks) {
      const endpointAPort = portMap.get(link.endpointA.portId)
      const endpointBPort = portMap.get(link.endpointB.portId)
      if (!endpointAPort || !endpointBPort) {
        continue
      }

      const peerPort = endpointAPort.deviceId === deviceId ? endpointBPort : endpointAPort
      const peerDevice = deviceMap.get(peerPort.deviceId)
      if (peerDevice) {
        peerDevices.set(peerDevice.id, peerDevice)
      }
    }

    if (peerDevices.size < 2) {
      continue
    }

    const resolvedPeerDevices = [...peerDevices.values()]
    const hasAnyPeerHaMetadata = resolvedPeerDevices.some(
      (peerDevice) => !!peerDevice.highAvailabilityGroup || !!peerDevice.highAvailabilityRole,
    )
    if (!hasAnyPeerHaMetadata) {
      continue
    }

    const hasMissingPeerGroup = resolvedPeerDevices.some((peerDevice) => !peerDevice.highAvailabilityGroup)
    const peerHaGroups = new Set(
      resolvedPeerDevices
        .map((peerDevice) => peerDevice.highAvailabilityGroup)
        .filter((group): group is string => typeof group === "string"),
    )
    const peerRoles = resolvedPeerDevices
      .map((peerDevice) => peerDevice.highAvailabilityRole)
      .filter((role): role is NonNullable<Device["highAvailabilityRole"]> => typeof role === "string")
    const peerRoleSet = new Set(peerRoles)
    const peerPairIsComplete = peerDevices.size !== 2
      || (peerRoleSet.has("primary") && peerRoleSet.has("secondary"))

    if (
      hasMissingPeerGroup
      ||
      peerHaGroups.size !== 1
      || peerRoles.length !== resolvedPeerDevices.length
      || peerRoleSet.size !== peerRoles.length
      || !peerPairIsComplete
    ) {
      issues.push(
        createIssue({
          code: "redundancy_peer_ha_group_invalid",
          message: `Redundancy group ${redundancyGroup} connected to ${deviceId} must terminate on one complete high-availability pair before symmetry validation can continue.`,
          severity: device.redundancyIntent === "dual-homed-required" ? "blocking" : "warning",
          subjectType: "device",
          subjectId: deviceId,
          path: "links[].redundancyGroup",
          entityRefs: [
            `device:${deviceId}`,
            ...resolvedPeerDevices.map((peerDevice) => `device:${peerDevice.id}`),
            ...groupedLinks
              .map((link) => `link:${link.id}`)
              .sort((left, right) => left.localeCompare(right)),
          ],
          blocking: device.redundancyIntent === "dual-homed-required",
        }),
      )
    }
  }

  return issues
}

export function hasBlockingIssues(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.blocking)
}

export function validateCloudSolutionModel(
  input: CloudSolutionSliceInput,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const {
    requiresDeviceCablingTable,
    requiresDeviceRackLayout,
    requiresDevicePortPlan,
    requiresDevicePortConnectionTable,
    requiresIpAllocationTable,
  } = getArtifactRequestFlags(input)
  const deviceIds = new Set(input.devices.map((device) => device.id))
  const rackMap = new Map(input.racks.map((rack) => [rack.id, rack]))
  const portIds = new Set(input.ports.map((port) => port.id))
  const segmentMap = new Map(input.segments.map((segment) => [segment.id, segment]))
  const physicalPlacementRequired = requiresPhysicalPlacement(input)
  const rackAssignmentRequired = requiresRackAssignment(input)
  const requiresNetworkSegments =
    input.allocations.length > 0
    || input.requirement.artifactRequests.includes("ip-allocation-table")

  if (requiresNetworkSegments && input.segments.length === 0) {
    issues.push(
      createIssue({
        code: "network_segments_missing",
        message: "At least one network segment is required for the validation slice.",
        severity: "blocking",
        subjectType: "requirement",
        subjectId: input.requirement.id,
        path: "segments",
        entityRefs: [`requirement:${input.requirement.id}`],
      }),
    )
  }

  for (const duplicateDeviceId of countDuplicates(input.devices.map((device) => device.id))) {
    issues.push(
      createIssue({
        code: "duplicate_device_id",
        message: `Device ID is duplicated: ${duplicateDeviceId}.`,
        severity: "blocking",
        subjectType: "device",
        subjectId: duplicateDeviceId,
        path: "devices[].id",
        entityRefs: [`device:${duplicateDeviceId}`],
      }),
    )
  }

  for (const duplicateRackId of countDuplicates(input.racks.map((rack) => rack.id))) {
    issues.push(
      createIssue({
        code: "duplicate_rack_id",
        message: `Rack ID is duplicated: ${duplicateRackId}.`,
        severity: "blocking",
        subjectType: "rack",
        subjectId: duplicateRackId,
        path: "racks[].id",
        entityRefs: [`rack:${duplicateRackId}`],
      }),
    )
  }

  for (const duplicateSegmentId of countDuplicates(input.segments.map((segment) => segment.id))) {
    issues.push(
      createIssue({
        code: "duplicate_segment_id",
        message: `Segment ID is duplicated: ${duplicateSegmentId}.`,
        severity: "blocking",
        subjectType: "segment",
        subjectId: duplicateSegmentId,
        path: "segments[].id",
        entityRefs: [`segment:${duplicateSegmentId}`],
      }),
    )
  }

  for (const duplicateAllocationId of countDuplicates(
    input.allocations.map((allocation) => allocation.id),
  )) {
    issues.push(
      createIssue({
        code: "duplicate_allocation_id",
        message: `Allocation ID is duplicated: ${duplicateAllocationId}.`,
        severity: "blocking",
        subjectType: "allocation",
        subjectId: duplicateAllocationId,
        path: "allocations[].id",
        entityRefs: [`allocation:${duplicateAllocationId}`],
      }),
    )
  }

  for (const duplicatePortId of countDuplicates(input.ports.map((port) => port.id))) {
    issues.push(
      createIssue({
        code: "duplicate_port_id",
        message: `Port ID is duplicated: ${duplicatePortId}.`,
        severity: "blocking",
        subjectType: "port",
        subjectId: duplicatePortId,
        path: "ports[].id",
        entityRefs: [`port:${duplicatePortId}`],
      }),
    )
  }

  for (const duplicateLinkId of countDuplicates(input.links.map((link) => link.id))) {
    issues.push(
      createIssue({
        code: "duplicate_link_id",
        message: `Link ID is duplicated: ${duplicateLinkId}.`,
        severity: "blocking",
        subjectType: "link",
        subjectId: duplicateLinkId,
        path: "links[].id",
        entityRefs: [`link:${duplicateLinkId}`],
      }),
    )
  }

  if (input.requirement.scopeType === "data-center" && input.devices.length === 0) {
    issues.push(
      createIssue({
        code: "device_inventory_missing",
        message: "Data-center scope should include at least one device in the current slice.",
        severity: "warning",
        subjectType: "requirement",
        subjectId: input.requirement.id,
        path: "devices",
        entityRefs: [`requirement:${input.requirement.id}`],
        blocking: false,
      }),
    )
  }

  issues.push(
    ...validatePhysicalArtifactCompleteness({
      input,
      requiresDeviceCablingTable,
      requiresDeviceRackLayout,
      requiresDevicePortPlan,
      requiresDevicePortConnectionTable,
      requiresIpAllocationTable,
    }),
  )

  issues.push(
    ...validatePhysicalFactConfidence({
      input,
      requiresDeviceCablingTable,
      requiresDeviceRackLayout,
      requiresDevicePortPlan,
      requiresDevicePortConnectionTable,
    }),
  )

  issues.push(
    ...validateNetworkFactConfidence({
      input,
      requiresIpAllocationTable,
    }),
  )

  for (const device of input.devices) {
    issues.push(
      ...validateDeviceRackPlacement({
        device,
        rackMap,
        rackAssignmentRequired,
        physicalPlacementRequired,
      }),
    )
  }

  issues.push(
    ...validateHighAvailabilityRoles({
      devices: input.devices,
    }),
  )

  issues.push(
    ...validateRackPlacementOverlaps({
      devices: input.devices,
      rackMap,
    }),
  )

  issues.push(
    ...validateRackPowerBudgets({
      devices: input.devices,
      rackMap,
      requiresDeviceRackLayout,
    }),
  )

  issues.push(
    ...validateHighAvailabilityAdjacency({
      devices: input.devices,
      rackMap,
    }),
  )

  for (const segment of input.segments) {
    issues.push(...validateSegment(segment))
  }

  issues.push(
    ...validateNetworkSegmentRelationships({
      input,
      requiresIpAllocationTable,
    }),
  )

  for (const port of input.ports) {
    issues.push(
      ...validatePort({
        port,
        deviceIds,
      }),
    )
  }

  const linkConnectionGroups = new Map<string, string[]>()

  for (const link of input.links) {
    issues.push(
      ...validateLink({
        link,
        portIds,
      }),
    )

    const pairKey = normalizeLinkPairKey(link)
    const groupedLinkIds = linkConnectionGroups.get(pairKey) ?? []
    groupedLinkIds.push(link.id)
    linkConnectionGroups.set(pairKey, groupedLinkIds)
  }

  for (const [pairKey, linkIds] of linkConnectionGroups.entries()) {
    if (linkIds.length < 2) {
      continue
    }

    const [endpointA, endpointB] = pairKey.split(":")
    issues.push(
      createIssue({
        code: "duplicate_link_connection",
        message: `Port connection ${endpointA} <-> ${endpointB} is duplicated.`,
        severity: "blocking",
        subjectType: "link",
        subjectId: linkIds.slice().sort((left, right) => left.localeCompare(right))[0] ?? pairKey,
        path: "links",
        entityRefs: [
          `port:${endpointA}`,
          `port:${endpointB}`,
          ...linkIds
            .slice()
            .sort((left, right) => left.localeCompare(right))
            .map((linkId) => `link:${linkId}`),
        ],
      }),
    )
  }

  issues.push(
    ...validateDeviceRedundancyIntent({
      devices: input.devices,
      ports: input.ports,
      links: input.links,
    }),
  )

  issues.push(
    ...validateRedundancyPeerHighAvailability({
      devices: input.devices,
      ports: input.ports,
      links: input.links,
    }),
  )

  issues.push(
    ...validateMlagPortSymmetry({
      devices: input.devices,
      ports: input.ports,
      links: input.links,
    }),
  )

  issues.push(
    ...validateTypedConnectivitySemantics({
      devices: input.devices,
      ports: input.ports,
      links: input.links,
    }),
  )

  issues.push(
    ...validateMultiRackSemantics({
      input,
      ports: input.ports,
    }),
  )

  const allocationAddressGroups = new Map<string, string[]>()

  for (const allocation of input.allocations) {
    issues.push(
      ...validateAllocation({
        allocation,
        deviceIds,
        segmentMap,
      }),
    )

    const duplicateAddressKey = `${allocation.segmentId}:${allocation.ipAddress}`
    const groupedAllocationIds = allocationAddressGroups.get(duplicateAddressKey) ?? []
    groupedAllocationIds.push(allocation.id)
    allocationAddressGroups.set(duplicateAddressKey, groupedAllocationIds)
  }

  for (const [groupKey, allocationIds] of allocationAddressGroups.entries()) {
    if (allocationIds.length < 2) {
      continue
    }

    const [segmentId, ipAddress] = groupKey.split(":")
    issues.push(
      createIssue({
        code: "duplicate_allocation_ip",
        message: `IP address ${ipAddress} is duplicated within segment ${segmentId}.`,
        severity: "blocking",
        subjectType: "segment",
        subjectId: segmentId,
        path: "allocations[].ipAddress",
        entityRefs: [
          `segment:${segmentId}`,
          ...allocationIds
            .sort((left, right) => left.localeCompare(right))
            .map((allocationId) => `allocation:${allocationId}`),
        ],
      }),
    )
  }

  return issues.sort((left, right) => {
    const severityDelta = severityRank[left.severity] - severityRank[right.severity]
    if (severityDelta !== 0) {
      return severityDelta
    }

    const codeDelta = left.code.localeCompare(right.code)
    if (codeDelta !== 0) {
      return codeDelta
    }

    const subjectTypeDelta = left.subjectType.localeCompare(right.subjectType)
    if (subjectTypeDelta !== 0) {
      return subjectTypeDelta
    }

    const subjectIdDelta = left.subjectId.localeCompare(right.subjectId)
    if (subjectIdDelta !== 0) {
      return subjectIdDelta
    }

    const pathDelta = (left.path ?? "").localeCompare(right.path ?? "")
    if (pathDelta !== 0) {
      return pathDelta
    }

    return left.entityRefs.join(",").localeCompare(right.entityRefs.join(","))
  })
}

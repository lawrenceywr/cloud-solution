import { z } from "zod"

import {
  CloudSolutionSliceInputSchema,
  SolutionRequirementSchema,
} from "../domain"

const StructuredConfidenceStateSchema = z.enum([
  "confirmed",
  "inferred",
  "unresolved",
])

const StructuredSourceReferenceSchema = z.object({
  kind: z.enum(["user-input", "inventory", "diagram", "document", "system"]),
  ref: z.string(),
  note: z.string().optional(),
})

const StructuredPortSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  purpose: z.string().optional(),
  sourceRefs: z.array(StructuredSourceReferenceSchema).default([]),
  statusConfidence: StructuredConfidenceStateSchema.default("confirmed"),
})

const StructuredDeviceSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  role: z.string(),
  vendor: z.string().optional(),
  model: z.string().optional(),
  redundancyIntent: z.enum([
    "single-homed",
    "dual-homed-preferred",
    "dual-homed-required",
  ]).optional(),
  rackName: z.string().optional(),
  rackPosition: z.number().int().positive().optional(),
  rackUnitHeight: z.number().int().positive().optional(),
  ports: z.array(StructuredPortSchema).default([]),
  sourceRefs: z.array(StructuredSourceReferenceSchema).default([]),
  statusConfidence: StructuredConfidenceStateSchema.default("confirmed"),
})

const StructuredRackSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  siteId: z.string().optional(),
  room: z.string().optional(),
  row: z.string().optional(),
  uHeight: z.number().int().positive().optional(),
  sourceRefs: z.array(StructuredSourceReferenceSchema).default([]),
  statusConfidence: StructuredConfidenceStateSchema.default("confirmed"),
})

const StructuredLinkEndpointSchema = z.object({
  deviceName: z.string(),
  portName: z.string(),
})

const StructuredLinkSchema = z.object({
  id: z.string().optional(),
  endpointA: StructuredLinkEndpointSchema,
  endpointB: StructuredLinkEndpointSchema,
  purpose: z.string().optional(),
  redundancyGroup: z.string().optional(),
  sourceRefs: z.array(StructuredSourceReferenceSchema).default([]),
  statusConfidence: StructuredConfidenceStateSchema.default("confirmed"),
})

const StructuredSegmentSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  segmentType: z.enum(["vlan", "subnet", "vrf", "mgmt", "storage", "service"]),
  cidr: z.string().optional(),
  gateway: z.string().optional(),
  purpose: z.string(),
  sourceRefs: z.array(StructuredSourceReferenceSchema).default([]),
  statusConfidence: StructuredConfidenceStateSchema.default("confirmed"),
})

const StructuredAllocationSchema = z.object({
  id: z.string().optional(),
  segmentName: z.string(),
  allocationType: z.enum(["gateway", "device", "service", "reserved"]),
  ipAddress: z.string(),
  deviceName: z.string().optional(),
  hostname: z.string().optional(),
  interfaceName: z.string().optional(),
  purpose: z.string().optional(),
  sourceRefs: z.array(StructuredSourceReferenceSchema).default([]),
  statusConfidence: StructuredConfidenceStateSchema.default("confirmed"),
})

export const StructuredSolutionInputSchema = z.object({
  requirement: SolutionRequirementSchema,
  structuredInput: z.object({
    racks: z.array(StructuredRackSchema).default([]),
    devices: z.array(StructuredDeviceSchema).default([]),
    links: z.array(StructuredLinkSchema).default([]),
    segments: z.array(StructuredSegmentSchema).default([]),
    allocations: z.array(StructuredAllocationSchema).default([]),
  }),
})

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function buildId(prefix: string, value: string): string {
  const slug = slugify(value)
  return `${prefix}-${slug || "unnamed"}`
}

function buildPortId(deviceName: string, portName: string): string {
  return `${buildId("port", `${deviceName}-${portName}`)}`
}

function buildLinkId(args: {
  endpointADeviceName: string
  endpointAPortName: string
  endpointBDeviceName: string
  endpointBPortName: string
}): string {
  const {
    endpointADeviceName,
    endpointAPortName,
    endpointBDeviceName,
    endpointBPortName,
  } = args

  return buildId(
    "link",
    `${endpointADeviceName}-${endpointAPortName}-to-${endpointBDeviceName}-${endpointBPortName}`,
  )
}

function buildAllocationId(args: {
  segmentName: string
  ipAddress: string
}): string {
  const { segmentName, ipAddress } = args
  return buildId("allocation", `${segmentName}-${ipAddress.replace(/[^0-9a-z]+/gi, "-")}`)
}

export function normalizeStructuredSolutionInput(input: unknown) {
  const parsed = StructuredSolutionInputSchema.parse(input)

  const racks = parsed.structuredInput.racks.map((rack) => ({
    id: rack.id ?? buildId("rack", rack.name),
    name: rack.name,
    siteId: rack.siteId,
    room: rack.room,
    row: rack.row,
    uHeight: rack.uHeight,
    sourceRefs: rack.sourceRefs,
    statusConfidence: rack.statusConfidence,
  }))

  const devices = parsed.structuredInput.devices.map((device) => ({
    id: device.id ?? buildId("device", device.name),
    name: device.name,
    role: device.role,
    vendor: device.vendor,
    model: device.model,
    redundancyIntent: device.redundancyIntent,
    rackId: device.rackName ? buildId("rack", device.rackName) : undefined,
    rackPosition: device.rackPosition,
    rackUnitHeight: device.rackUnitHeight,
    sourceRefs: device.sourceRefs,
    statusConfidence: device.statusConfidence,
  }))

  const ports = parsed.structuredInput.devices.flatMap((device) => {
    const deviceId = device.id ?? buildId("device", device.name)

    return device.ports.map((port) => ({
      id: port.id ?? buildPortId(device.name, port.name),
      deviceId,
      name: port.name,
      purpose: port.purpose,
      sourceRefs: port.sourceRefs,
      statusConfidence: port.statusConfidence,
    }))
  })

  const links = parsed.structuredInput.links.map((link) => ({
    id: link.id
      ?? buildLinkId({
        endpointADeviceName: link.endpointA.deviceName,
        endpointAPortName: link.endpointA.portName,
        endpointBDeviceName: link.endpointB.deviceName,
        endpointBPortName: link.endpointB.portName,
      }),
    endpointA: {
      portId: buildPortId(link.endpointA.deviceName, link.endpointA.portName),
    },
    endpointB: {
      portId: buildPortId(link.endpointB.deviceName, link.endpointB.portName),
    },
    purpose: link.purpose,
    redundancyGroup: link.redundancyGroup,
    sourceRefs: link.sourceRefs,
    statusConfidence: link.statusConfidence,
  }))

  const segments = parsed.structuredInput.segments.map((segment) => ({
    id: segment.id ?? buildId("segment", segment.name),
    name: segment.name,
    segmentType: segment.segmentType,
    cidr: segment.cidr,
    gateway: segment.gateway,
    purpose: segment.purpose,
    sourceRefs: segment.sourceRefs,
    statusConfidence: segment.statusConfidence,
  }))

  const allocations = parsed.structuredInput.allocations.map((allocation) => ({
    id: allocation.id ?? buildAllocationId({
      segmentName: allocation.segmentName,
      ipAddress: allocation.ipAddress,
    }),
    segmentId: buildId("segment", allocation.segmentName),
    allocationType: allocation.allocationType,
    ipAddress: allocation.ipAddress,
    deviceId: allocation.deviceName ? buildId("device", allocation.deviceName) : undefined,
    hostname: allocation.hostname,
    interfaceName: allocation.interfaceName,
    purpose: allocation.purpose,
    sourceRefs: allocation.sourceRefs,
    statusConfidence: allocation.statusConfidence,
  }))

  return CloudSolutionSliceInputSchema.parse({
    requirement: parsed.requirement,
    racks,
    devices,
    ports,
    links,
    segments,
    allocations,
  })
}

export function normalizeSolutionToolInput(input: unknown) {
  if (typeof input !== "object" || input === null) {
    return CloudSolutionSliceInputSchema.parse(input)
  }

  if ("structuredInput" in input) {
    return normalizeStructuredSolutionInput(input)
  }

  return CloudSolutionSliceInputSchema.parse(input)
}

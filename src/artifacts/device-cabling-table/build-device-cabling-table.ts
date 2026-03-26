import type {
  CloudSolutionSliceInput,
  DeviceCablingTableRow,
  GeneratedArtifact,
  ValidationIssue,
} from "../../domain"
import { DeviceCablingTableRowSchema } from "../../domain"
import { hasBlockingIssues } from "../../validators"

type ResolvedEndpoint = {
  rackId: string
  rackName: string
  rackPosition: number
  deviceId: string
  deviceName: string
  portId: string
  portName: string
}

function buildIssueTable(issues: ValidationIssue[]): string {
  const lines = [
    "| Severity | Code | Message | Entities |",
    "| --- | --- | --- | --- |",
  ]

  for (const issue of issues) {
    lines.push(
      `| ${issue.severity} | ${issue.code} | ${issue.message} | ${issue.entityRefs.join(", ") || "-"} |`,
    )
  }

  return lines.join("\n")
}

function compareEndpoints(left: ResolvedEndpoint, right: ResolvedEndpoint): number {
  const rackNameDelta = left.rackName.localeCompare(right.rackName)
  if (rackNameDelta !== 0) {
    return rackNameDelta
  }

  const rackIdDelta = left.rackId.localeCompare(right.rackId)
  if (rackIdDelta !== 0) {
    return rackIdDelta
  }

  const rackPositionDelta = left.rackPosition - right.rackPosition
  if (rackPositionDelta !== 0) {
    return rackPositionDelta
  }

  const deviceNameDelta = left.deviceName.localeCompare(right.deviceName)
  if (deviceNameDelta !== 0) {
    return deviceNameDelta
  }

  const deviceIdDelta = left.deviceId.localeCompare(right.deviceId)
  if (deviceIdDelta !== 0) {
    return deviceIdDelta
  }

  const portNameDelta = left.portName.localeCompare(right.portName)
  if (portNameDelta !== 0) {
    return portNameDelta
  }

  return left.portId.localeCompare(right.portId)
}

function resolveEndpointMaps(input: CloudSolutionSliceInput) {
  return {
    rackMap: new Map(input.racks.map((rack) => [rack.id, rack])),
    deviceMap: new Map(input.devices.map((device) => [device.id, device])),
    portMap: new Map(input.ports.map((port) => [port.id, port])),
  }
}

function resolveEndpoint(args: {
  portId: string
  input: CloudSolutionSliceInput
  rackMap: Map<string, CloudSolutionSliceInput["racks"][number]>
  deviceMap: Map<string, CloudSolutionSliceInput["devices"][number]>
  portMap: Map<string, CloudSolutionSliceInput["ports"][number]>
}): ResolvedEndpoint {
  const { portId, rackMap, deviceMap, portMap } = args
  const port = portMap.get(portId)
  if (!port) {
    throw new Error(`Cannot build device cabling row for missing port: ${portId}`)
  }

  const device = deviceMap.get(port.deviceId)
  if (!device) {
    throw new Error(`Cannot build device cabling row for missing device: ${port.deviceId}`)
  }

  if (!device.rackId) {
    throw new Error(`Cannot build device cabling row for unplaced device: ${device.id}`)
  }

  const rack = rackMap.get(device.rackId)
  if (!rack) {
    throw new Error(`Cannot build device cabling row for missing rack: ${device.rackId}`)
  }

  if (typeof device.rackPosition !== "number") {
    throw new Error(`Cannot build device cabling row for missing rack position: ${device.id}`)
  }

  return {
    rackId: rack.id,
    rackName: rack.name,
    rackPosition: device.rackPosition,
    deviceId: device.id,
    deviceName: device.name,
    portId: port.id,
    portName: port.name,
  }
}

function buildRows(input: CloudSolutionSliceInput): DeviceCablingTableRow[] {
  const { rackMap, deviceMap, portMap } = resolveEndpointMaps(input)

  return input.links
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((link) => {
      const endpointA = resolveEndpoint({
        portId: link.endpointA.portId,
        input,
        rackMap,
        deviceMap,
        portMap,
      })
      const endpointB = resolveEndpoint({
        portId: link.endpointB.portId,
        input,
        rackMap,
        deviceMap,
        portMap,
      })

      const [leftEndpoint, rightEndpoint] = [endpointA, endpointB].sort(compareEndpoints)

      return DeviceCablingTableRowSchema.parse({
        linkId: link.id,
        endpointARackName: leftEndpoint.rackName,
        endpointARackId: leftEndpoint.rackId,
        endpointARackPosition: leftEndpoint.rackPosition,
        endpointADeviceName: leftEndpoint.deviceName,
        endpointADeviceId: leftEndpoint.deviceId,
        endpointAPortName: leftEndpoint.portName,
        endpointAPortId: leftEndpoint.portId,
        endpointBRackName: rightEndpoint.rackName,
        endpointBRackId: rightEndpoint.rackId,
        endpointBRackPosition: rightEndpoint.rackPosition,
        endpointBDeviceName: rightEndpoint.deviceName,
        endpointBDeviceId: rightEndpoint.deviceId,
        endpointBPortName: rightEndpoint.portName,
        endpointBPortId: rightEndpoint.portId,
        purpose: link.purpose,
        redundancyGroup: link.redundancyGroup,
      })
    })
}

function buildRowTable(rows: DeviceCablingTableRow[]): string {
  const lines = [
    "| Link ID | Endpoint A Rack | Endpoint A Device | Endpoint A Port | Endpoint B Rack | Endpoint B Device | Endpoint B Port | Purpose | Redundancy Group |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ]

  for (const row of rows) {
    lines.push(
      `| ${row.linkId} | ${row.endpointARackName} (${row.endpointARackId}) U${row.endpointARackPosition} | ${row.endpointADeviceName} (${row.endpointADeviceId}) | ${row.endpointAPortName} (${row.endpointAPortId}) | ${row.endpointBRackName} (${row.endpointBRackId}) U${row.endpointBRackPosition} | ${row.endpointBDeviceName} (${row.endpointBDeviceId}) | ${row.endpointBPortName} (${row.endpointBPortId}) | ${row.purpose ?? "-"} | ${row.redundancyGroup ?? "-"} |`,
    )
  }

  return lines.join("\n")
}

export function buildDeviceCablingTableArtifact(args: {
  input: CloudSolutionSliceInput
  issues: ValidationIssue[]
}): GeneratedArtifact {
  const { input, issues } = args
  const blocked = hasBlockingIssues(issues)

  const sections = [
    "# Device Cabling Table",
    "",
    `Project: ${input.requirement.projectName}`,
    `Status: ${blocked ? "blocked" : "ready"}`,
    `Rack count: ${input.racks.length}`,
    `Device count: ${input.devices.length}`,
    `Link count: ${input.links.length}`,
    `Issue count: ${issues.length}`,
  ]

  if (blocked) {
    sections.push("", "## Blocking Conditions", buildIssueTable(issues))
  } else {
    const rows = buildRows(input)
    sections.push("", "## Cabling Rows", buildRowTable(rows))
  }

  return {
    name: "device-cabling-table.md",
    mimeType: "text/markdown",
    content: sections.join("\n"),
  }
}

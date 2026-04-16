import type {
  CloudSolutionSliceInput,
  DeviceRackLayoutRow,
  GeneratedArtifact,
  ValidationIssue,
} from "../../domain"
import { DeviceRackLayoutRowSchema } from "../../domain"
import { hasBlockingIssues } from "../../validators"

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

function buildRows(input: CloudSolutionSliceInput): DeviceRackLayoutRow[] {
  const rackMap = new Map(input.racks.map((rack) => [rack.id, rack]))

  return input.devices
    .filter((device) => device.rackId && typeof device.rackPosition === "number" && typeof device.rackUnitHeight === "number")
    .slice()
    .sort((left, right) => {
      const leftRack = rackMap.get(left.rackId ?? "")
      const rightRack = rackMap.get(right.rackId ?? "")
      const rackNameDelta = (leftRack?.name ?? "").localeCompare(rightRack?.name ?? "")
      if (rackNameDelta !== 0) {
        return rackNameDelta
      }

      const rackPositionDelta = (left.rackPosition ?? 0) - (right.rackPosition ?? 0)
      if (rackPositionDelta !== 0) {
        return rackPositionDelta
      }

      return left.id.localeCompare(right.id)
    })
    .map((device) => {
      const rack = rackMap.get(device.rackId ?? "")
      if (!rack || typeof device.rackPosition !== "number" || typeof device.rackUnitHeight !== "number") {
        throw new Error(`Cannot build rack layout row for unplaced device: ${device.id}`)
      }

      return DeviceRackLayoutRowSchema.parse({
        rackName: rack.name,
        rackId: rack.id,
        rackPosition: device.rackPosition,
        rackUnitHeight: device.rackUnitHeight,
        deviceName: device.name,
        deviceId: device.id,
        deviceRole: device.role,
        highAvailabilityGroup: device.highAvailabilityGroup,
        highAvailabilityRole: device.highAvailabilityRole,
        powerWatts: device.powerWatts,
      })
    })
}

function buildRowTable(rows: DeviceRackLayoutRow[]): string {
  const lines = [
    "| Rack | Rack Units | Device | Role | HA Group | HA Role | Power (W) |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ]

  for (const row of rows) {
    lines.push(
      `| ${row.rackName} (${row.rackId}) | U${row.rackPosition} (${row.rackUnitHeight}U) | ${row.deviceName} (${row.deviceId}) | ${row.deviceRole} | ${row.highAvailabilityGroup ?? "-"} | ${row.highAvailabilityRole ?? "-"} | ${row.powerWatts ?? "-"} |`,
    )
  }

  return lines.join("\n")
}

export function buildDeviceRackLayoutArtifact(args: {
  input: CloudSolutionSliceInput
  issues: ValidationIssue[]
}): GeneratedArtifact {
  const { input, issues } = args
  const blocked = hasBlockingIssues(issues)

  const sections = [
    "# Device Rack Layout",
    "",
    `Project: ${input.requirement.projectName}`,
    `Status: ${blocked ? "blocked" : "ready"}`,
    `Rack count: ${input.racks.length}`,
    `Device count: ${input.devices.length}`,
    `Issue count: ${issues.length}`,
  ]

  if (blocked) {
    sections.push("", "## Blocking Conditions", buildIssueTable(issues))
  } else {
    const rows = buildRows(input)
    sections.push("", "## Rack Layout Rows", buildRowTable(rows))
  }

  return {
    name: "device-rack-layout.md",
    mimeType: "text/markdown",
    content: sections.join("\n"),
  }
}

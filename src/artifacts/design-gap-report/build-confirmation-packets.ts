import type {
  CloudSolutionSliceInput,
  ConfirmationPacket,
  PendingConfirmationItem,
  ValidationIssue,
  ValidationIssueSubjectType,
} from "../../domain"

function formatEndpoint(endpoint?: PendingConfirmationItem["endpointA"]): string {
  return endpoint ? `${endpoint.deviceName}:${endpoint.portName}` : "the affected connection"
}

const physicalSubjectOrder: ValidationIssueSubjectType[] = [
  "rack",
  "device",
  "port",
  "link",
]

function extractConflictingPlaneTypes(detail: string): string | undefined {
  const match = detail.match(/conflicting explicit plane types \(([^)]+)\)/)
  if (!match?.[1]) {
    return undefined
  }

  const planeTypes = match[1]
    .split(/\s+vs\s+/i)
    .map((value) => value.trim())
    .filter(Boolean)

  if (planeTypes.length === 0) {
    return undefined
  }

  return planeTypes.join(" or ")
}

function buildRequiredDecision(item: PendingConfirmationItem): string {
  switch (item.kind) {
    case "template-plane-type-conflict": {
      const endpointA = formatEndpoint(item.endpointA)
      const endpointB = formatEndpoint(item.endpointB)
      const planeTypeChoice = extractConflictingPlaneTypes(item.detail)
      const choiceText = planeTypeChoice ? `: ${planeTypeChoice}` : ""

      return `Operator must choose the authoritative plane/link type for ${endpointA} ↔ ${endpointB}${choiceText}, then update the source/structured input accordingly.`
    }
  }
}

function buildSuggestedAction(item: PendingConfirmationItem): string {
  if (item.suggestedAction) {
    return item.suggestedAction
  }

  switch (item.kind) {
    case "template-plane-type-conflict":
      return "Confirm the intended plane/link type with the operator and update the source or structured input to match that decision."
  }
}

export function buildConfirmationPackets(items: PendingConfirmationItem[]): ConfirmationPacket[] {
  return items
    .filter((item) => item.confidenceState === "unresolved")
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      severity: item.severity,
      title: item.title,
      requiredDecision: buildRequiredDecision(item),
      currentAmbiguity: item.detail,
      subjectType: item.subjectType,
      subjectId: item.subjectId ?? item.id,
      entityRefs: item.entityRefs,
      sourceRefs: item.sourceRefs,
      ...(item.endpointA || item.endpointB
        ? {
            endpoints: {
              ...(item.endpointA ? { endpointA: item.endpointA } : {}),
              ...(item.endpointB ? { endpointB: item.endpointB } : {}),
            },
          }
        : {}),
      suggestedAction: buildSuggestedAction(item),
    }))
}

function countIssuesBySubjectType(issues: ValidationIssue[]): string {
  const counts = new Map<ValidationIssueSubjectType, number>()

  for (const issue of issues) {
    counts.set(issue.subjectType, (counts.get(issue.subjectType) ?? 0) + 1)
  }

  return physicalSubjectOrder
    .filter((subjectType) => counts.has(subjectType))
    .map((subjectType) => `${counts.get(subjectType)} ${subjectType}`)
    .join(", ")
}

function buildPhysicalFactConfirmationPacket(args: {
  input: CloudSolutionSliceInput
  issues: ValidationIssue[]
}): ConfirmationPacket[] {
  const { input, issues } = args
  const physicalFactIssues = issues.filter((issue) => issue.code === "physical_fact_not_confirmed")

  if (physicalFactIssues.length === 0) {
    return []
  }

  const subjectSummary = countIssuesBySubjectType(physicalFactIssues)
  const issueCount = physicalFactIssues.length

  return [{
    id: `physical-fact-confirmation-required|${input.requirement.id}`,
    kind: "physical-fact-confirmation-required",
    severity: "blocking",
    title: "physical facts require operator confirmation",
    requiredDecision: "Operator must decide whether all unconfirmed physical facts in this planning slice are authoritative for final physical artifacts, or update/remove them before export.",
    currentAmbiguity: `${issueCount} unconfirmed physical fact${issueCount === 1 ? "" : "s"} remain (${subjectSummary}). Individual affected facts are listed as blocking gaps; this packet aggregates the operator decision to avoid one packet per fact.`,
    subjectType: "requirement",
    subjectId: input.requirement.id,
    entityRefs: [`requirement:${input.requirement.id}`],
    sourceRefs: input.requirement.sourceRefs,
    suggestedAction: "Confirm the physical inventory, rack placement, ports, and links as design truth, or update the source/structured input so only confirmed physical facts drive artifact export.",
  }]
}

function buildRackPowerConfirmationPackets(args: {
  input: CloudSolutionSliceInput
  issues: ValidationIssue[]
}): ConfirmationPacket[] {
  const { input, issues } = args
  const rackById = new Map(input.racks.map((rack) => [rack.id, rack]))

  return issues
    .filter((issue) => issue.code === "rack_power_threshold_exceeded")
    .sort((left, right) => left.subjectId.localeCompare(right.subjectId))
    .map((issue): ConfirmationPacket => {
      const rack = rackById.get(issue.subjectId)

      return {
        id: `rack-power-threshold-exceeded|${issue.subjectId}`,
        kind: "rack-power-threshold-exceeded",
        severity: issue.severity,
        title: "rack power threshold requires operator decision",
        requiredDecision: `Operator must decide whether rack ${issue.subjectId}'s planned load is an approved power-threshold exception, or revise the rack budget/device placement before export.`,
        currentAmbiguity: issue.message,
        subjectType: "rack",
        subjectId: issue.subjectId,
        entityRefs: issue.entityRefs,
        sourceRefs: rack?.sourceRefs ?? [],
        suggestedAction: "Confirm the rack-level power exception with the operator, or update rack maxPowerKw, device power, or device rack placement so the plan returns within threshold.",
      }
    })
}

export function buildIssueConfirmationPackets(args: {
  input: CloudSolutionSliceInput
  issues: ValidationIssue[]
}): ConfirmationPacket[] {
  return [
    ...buildPhysicalFactConfirmationPacket(args),
    ...buildRackPowerConfirmationPackets(args),
  ]
}

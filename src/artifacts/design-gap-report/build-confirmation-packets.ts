import type {
  ConfirmationPacket,
  PendingConfirmationItem,
} from "../../domain"

function formatEndpoint(endpoint?: PendingConfirmationItem["endpointA"]): string {
  return endpoint ? `${endpoint.deviceName}:${endpoint.portName}` : "the affected connection"
}

function buildRequiredDecision(item: PendingConfirmationItem): string {
  switch (item.kind) {
    case "template-plane-type-conflict": {
      const endpointA = formatEndpoint(item.endpointA)
      const endpointB = formatEndpoint(item.endpointB)

      return `Confirm the intended plane/link type for ${endpointA} ↔ ${endpointB}, then update the source/structured input accordingly.`
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

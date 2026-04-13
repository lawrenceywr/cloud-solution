import { z } from "zod"

import type { SourceReference } from "../domain"
import { StructuredSolutionInputSchema } from "../normalizers/normalize-structured-solution-input"

type DraftStructuredInput = z.infer<typeof StructuredSolutionInputSchema>["structuredInput"]

function uniqueSourceRefs(sourceRefs: SourceReference[]): SourceReference[] {
  const entries = new Map<string, SourceReference>()

  for (const sourceRef of sourceRefs) {
    const key = `${sourceRef.kind}:${sourceRef.ref}:${sourceRef.note ?? ""}`
    if (!entries.has(key)) {
      entries.set(key, sourceRef)
    }
  }

  return [...entries.values()]
}

function draftStatus(statusConfidence?: string): "inferred" | "unresolved" {
  return statusConfidence === "unresolved" ? "unresolved" : "inferred"
}

export function finalizePlanningDraftStructuredInput(args: {
  structuredInput: DraftStructuredInput
  plannerRef: string
  plannerNote: string
}): DraftStructuredInput {
  const plannerSourceRef: SourceReference = {
    kind: "system",
    ref: args.plannerRef,
    note: args.plannerNote,
  }

  const mergeRefs = (sourceRefs: SourceReference[]) => uniqueSourceRefs([
    ...sourceRefs,
    plannerSourceRef,
  ])

  return {
    racks: args.structuredInput.racks.map((rack) => ({
      ...rack,
      sourceRefs: mergeRefs(rack.sourceRefs),
      statusConfidence: draftStatus(rack.statusConfidence),
    })),
    devices: args.structuredInput.devices.map((device) => ({
      ...device,
      sourceRefs: mergeRefs(device.sourceRefs),
      statusConfidence: draftStatus(device.statusConfidence),
      ports: device.ports.map((port) => ({
        ...port,
        sourceRefs: mergeRefs(port.sourceRefs),
        statusConfidence: draftStatus(port.statusConfidence),
      })),
    })),
    links: args.structuredInput.links.map((link) => ({
      ...link,
      sourceRefs: mergeRefs(link.sourceRefs),
      statusConfidence: draftStatus(link.statusConfidence),
    })),
    segments: args.structuredInput.segments.map((segment) => ({
      ...segment,
      sourceRefs: mergeRefs(segment.sourceRefs),
      statusConfidence: draftStatus(segment.statusConfidence),
    })),
    allocations: args.structuredInput.allocations.map((allocation) => ({
      ...allocation,
      sourceRefs: mergeRefs(allocation.sourceRefs),
      statusConfidence: draftStatus(allocation.statusConfidence),
    })),
  }
}

import { ZodError, z } from "zod"

import type {
  CandidateFact,
  CandidateFactConfirmationSummary,
  CloudSolutionSliceInput,
  DraftInputState,
  PendingConfirmationItem,
  SourceReference,
} from "../domain"
import {
  CandidateFactConfirmationSummarySchema,
  CandidateFactSchema,
  CloudSolutionSliceInputSchema,
  PendingConfirmationItemSchema,
  SolutionRequirementSchema,
  SourceReferenceSchema,
} from "../domain"
import {
  StructuredSolutionInputSchema,
  normalizeStructuredSolutionInput,
} from "./normalize-structured-solution-input"

const DocumentSourceSchema = SourceReferenceSchema.extend({
  kind: z.enum(["document", "diagram", "image"]),
})

const ConfirmationInputSchema = z.object({
  entityRefs: z.array(z.string()).default([]),
})

const DraftPreparationSchema = z.object({
  requirement: SolutionRequirementSchema,
  structuredInput: StructuredSolutionInputSchema.shape.structuredInput.optional(),
  documentAssist: z.object({
    documentSources: z.array(DocumentSourceSchema).min(1),
    candidateFacts: StructuredSolutionInputSchema.shape.structuredInput,
  }).optional(),
  confirmation: ConfirmationInputSchema.optional(),
  pendingConfirmationItems: z.array(PendingConfirmationItemSchema).default([]),
})

type StructuredInput = z.infer<typeof StructuredSolutionInputSchema>["structuredInput"]

const CandidateFactSourceKinds = new Set(["document", "diagram", "image", "inventory", "system"])

type PrepareDraftSolutionInputArgs = {
  input: unknown
  allowDocumentAssist: boolean
}

export type PreparedDraftSolutionInput = {
  normalizedInput: CloudSolutionSliceInput
  inputState: DraftInputState
  candidateFacts: CandidateFact[]
  confirmationSummary: CandidateFactConfirmationSummary
}

function extractRawPendingConfirmationItems(rawInputRecord: Record<string, unknown>): PendingConfirmationItem[] {
  const rawItems = rawInputRecord.pendingConfirmationItems
  if (!Array.isArray(rawItems)) {
    return []
  }

  return rawItems.map((item) => PendingConfirmationItemSchema.parse(item))
}

function resolvePendingConfirmationItems(args: {
  items: PendingConfirmationItem[]
  input: CloudSolutionSliceInput
}): PendingConfirmationItem[] {
  if (args.items.length === 0) {
    return []
  }

  const deviceNameById = new Map(args.input.devices.map((device) => [device.id, device.name]))
  const portIdByRef = new Map<string, string>()
  const portsById = new Map(args.input.ports.map((port) => [port.id, port]))

  for (const port of args.input.ports) {
    const deviceName = deviceNameById.get(port.deviceId)
    if (!deviceName) {
      continue
    }
    portIdByRef.set(`${deviceName}:${port.name}`, port.id)
  }

  return args.items.map((item) => {
    if (item.subjectId && item.entityRefs.length > 0) {
      return item
    }

    const endpointARef = item.endpointA
      ? `${item.endpointA.deviceName}:${item.endpointA.portName}`
      : undefined
    const endpointBRef = item.endpointB
      ? `${item.endpointB.deviceName}:${item.endpointB.portName}`
      : undefined
    const endpointAPortId = endpointARef ? portIdByRef.get(endpointARef) : undefined
    const endpointBPortId = endpointBRef ? portIdByRef.get(endpointBRef) : undefined

    const resolvedLink = endpointAPortId && endpointBPortId
      ? args.input.links.find((link) => {
          const sameDirection = link.endpointA.portId === endpointAPortId && link.endpointB.portId === endpointBPortId
          const reverseDirection = link.endpointA.portId === endpointBPortId && link.endpointB.portId === endpointAPortId
          return sameDirection || reverseDirection
        })
      : undefined

    const entityRefs = [
      ...(resolvedLink ? [`link:${resolvedLink.id}`] : []),
      ...(endpointAPortId ? [`port:${endpointAPortId}`] : []),
      ...(endpointBPortId ? [`port:${endpointBPortId}`] : []),
    ]

    return PendingConfirmationItemSchema.parse({
      ...item,
      subjectId: resolvedLink?.id ?? item.subjectId ?? item.id,
      entityRefs,
      sourceRefs: item.sourceRefs.length > 0
        ? item.sourceRefs
        : [
            ...(endpointAPortId ? (portsById.get(endpointAPortId)?.sourceRefs ?? []) : []),
            ...(endpointBPortId ? (portsById.get(endpointBPortId)?.sourceRefs ?? []) : []),
          ],
    })
  })
}

function hasNonEmptyCanonicalEntities(input: Record<string, unknown>): boolean {
  return ["devices", "racks", "ports", "links", "segments", "allocations"]
    .some((field) => Array.isArray(input[field]) && input[field].length > 0)
}

function hasCandidateFactSourceBasedFacts(input: Record<string, unknown>): boolean {
  const checkEntity = (entity: unknown): boolean => {
    if (typeof entity !== "object" || entity === null) {
      return false
    }
    const record = entity as Record<string, unknown>
    const statusConfidence = record.statusConfidence as string
    const sourceRefs = Array.isArray(record.sourceRefs) ? record.sourceRefs : []
    
    const hasInferredStatus = statusConfidence === "inferred" || statusConfidence === "unresolved"
    const hasCandidateFactSource = sourceRefs.some((ref: unknown) => {
      if (typeof ref !== "object" || ref === null) {
        return false
      }
      const refRecord = ref as Record<string, unknown>
      return CandidateFactSourceKinds.has(refRecord.kind as string)
    })
    
    return hasInferredStatus && hasCandidateFactSource
  }
  
  const checkArray = (entities: unknown): boolean => {
    if (!Array.isArray(entities)) {
      return false
    }
    return entities.some((entity: unknown) => checkEntity(entity))
  }
  
  return ["devices", "racks", "ports", "links", "segments", "allocations"]
    .some((field) => checkArray(input[field]))
}

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

function createDraftConfidenceIssues(args: {
  rootPath: Array<string | number>
  structuredInput: StructuredInput
}) {
  const issues: Array<{
    path: Array<string | number>
    message: string
  }> = []

  const { rootPath, structuredInput } = args
  const check = (path: Array<string | number>, statusConfidence?: string) => {
    if (statusConfidence === "confirmed") {
      issues.push({
        path,
        message: "Invalid option: expected one of \"inferred\"|\"unresolved\"",
      })
    }
  }

  structuredInput.racks.forEach((rack, index) => {
    check([...rootPath, "racks", index, "statusConfidence"], rack.statusConfidence)
  })
  structuredInput.devices.forEach((device, index) => {
    check([...rootPath, "devices", index, "statusConfidence"], device.statusConfidence)
    device.ports.forEach((port, portIndex) => {
      check([
        ...rootPath,
        "devices",
        index,
        "ports",
        portIndex,
        "statusConfidence",
      ], port.statusConfidence)
    })
  })
  structuredInput.links.forEach((link, index) => {
    check([...rootPath, "links", index, "statusConfidence"], link.statusConfidence)
  })
  structuredInput.segments.forEach((segment, index) => {
    check([...rootPath, "segments", index, "statusConfidence"], segment.statusConfidence)
  })
  structuredInput.allocations.forEach((allocation, index) => {
    check([...rootPath, "allocations", index, "statusConfidence"], allocation.statusConfidence)
  })

  return issues
}

function assertDraftOnlyStructuredInput(args: {
  rootPath: Array<string | number>
  structuredInput: StructuredInput
}) {
  const issues = createDraftConfidenceIssues(args)
  if (issues.length === 0) {
    return
  }

  throw new ZodError(
    issues.map((issue) => ({
      code: "invalid_value" as const,
      values: ["inferred", "unresolved"],
      path: issue.path,
      message: issue.message,
    })),
  )
}

function mergeDocumentSourcesIntoStructuredInput(args: {
  structuredInput: StructuredInput
  documentSources: SourceReference[]
}): StructuredInput {
  const mergeRefs = (sourceRefs: SourceReference[]) => sourceRefs.length > 0
    ? uniqueSourceRefs(sourceRefs)
    : uniqueSourceRefs(args.documentSources)

  return {
    racks: args.structuredInput.racks.map((rack) => ({
      ...rack,
      sourceRefs: mergeRefs(rack.sourceRefs ?? []),
    })),
    devices: args.structuredInput.devices.map((device) => ({
      ...device,
      sourceRefs: mergeRefs(device.sourceRefs ?? []),
      ports: device.ports.map((port) => ({
        ...port,
        sourceRefs: mergeRefs(port.sourceRefs ?? []),
      })),
    })),
    links: args.structuredInput.links.map((link) => ({
      ...link,
      sourceRefs: mergeRefs(link.sourceRefs ?? []),
    })),
    segments: args.structuredInput.segments.map((segment) => ({
      ...segment,
      sourceRefs: mergeRefs(segment.sourceRefs ?? []),
    })),
    allocations: args.structuredInput.allocations.map((allocation) => ({
      ...allocation,
      sourceRefs: mergeRefs(allocation.sourceRefs ?? []),
    })),
  }
}

function applyDraftConfidenceDefaults(rawStructuredInput: unknown): StructuredInput {
  const value = typeof rawStructuredInput === "object" && rawStructuredInput !== null
    ? rawStructuredInput as Record<string, unknown>
    : {}

  const racks = Array.isArray(value.racks) ? value.racks : []
  const devices = Array.isArray(value.devices) ? value.devices : []
  const links = Array.isArray(value.links) ? value.links : []
  const segments = Array.isArray(value.segments) ? value.segments : []
  const allocations = Array.isArray(value.allocations) ? value.allocations : []

  return {
    racks: racks.map((rack) => ({
      ...(typeof rack === "object" && rack !== null ? rack : {}),
      statusConfidence:
        typeof rack === "object" && rack !== null && "statusConfidence" in rack
          ? (rack as { statusConfidence?: unknown }).statusConfidence
          : "inferred",
    })),
    devices: devices.map((device) => {
      const ports =
        typeof device === "object" && device !== null && Array.isArray((device as { ports?: unknown[] }).ports)
          ? (device as { ports: unknown[] }).ports
          : []

      return {
        ...(typeof device === "object" && device !== null ? device : {}),
        statusConfidence:
          typeof device === "object" && device !== null && "statusConfidence" in device
            ? (device as { statusConfidence?: unknown }).statusConfidence
            : "inferred",
        ports: ports.map((port) => ({
          ...(typeof port === "object" && port !== null ? port : {}),
          statusConfidence:
            typeof port === "object" && port !== null && "statusConfidence" in port
              ? (port as { statusConfidence?: unknown }).statusConfidence
              : "inferred",
        })),
      }
    }),
    links: links.map((link) => ({
      ...(typeof link === "object" && link !== null ? link : {}),
      statusConfidence:
        typeof link === "object" && link !== null && "statusConfidence" in link
          ? (link as { statusConfidence?: unknown }).statusConfidence
          : "inferred",
    })),
    segments: segments.map((segment) => ({
      ...(typeof segment === "object" && segment !== null ? segment : {}),
      statusConfidence:
        typeof segment === "object" && segment !== null && "statusConfidence" in segment
          ? (segment as { statusConfidence?: unknown }).statusConfidence
          : "inferred",
    })),
    allocations: allocations.map((allocation) => ({
      ...(typeof allocation === "object" && allocation !== null ? allocation : {}),
      statusConfidence:
        typeof allocation === "object" && allocation !== null && "statusConfidence" in allocation
          ? (allocation as { statusConfidence?: unknown }).statusConfidence
          : "inferred",
    })),
  } as StructuredInput
}

function buildCandidateFacts(input: CloudSolutionSliceInput): CandidateFact[] {
  const subjects = [
    ...input.devices.map((device) => ({
      subjectType: "device" as const,
      subjectId: device.id,
      statusConfidence: device.statusConfidence,
      sourceRefs: device.sourceRefs,
    })),
    ...input.racks.map((rack) => ({
      subjectType: "rack" as const,
      subjectId: rack.id,
      statusConfidence: rack.statusConfidence,
      sourceRefs: rack.sourceRefs,
    })),
    ...input.ports.map((port) => ({
      subjectType: "port" as const,
      subjectId: port.id,
      statusConfidence: port.statusConfidence,
      sourceRefs: port.sourceRefs,
    })),
    ...input.links.map((link) => ({
      subjectType: "link" as const,
      subjectId: link.id,
      statusConfidence: link.statusConfidence,
      sourceRefs: link.sourceRefs,
    })),
    ...input.segments.map((segment) => ({
      subjectType: "segment" as const,
      subjectId: segment.id,
      statusConfidence: segment.statusConfidence,
      sourceRefs: segment.sourceRefs,
    })),
    ...input.allocations.map((allocation) => ({
      subjectType: "allocation" as const,
      subjectId: allocation.id,
      statusConfidence: allocation.statusConfidence,
      sourceRefs: allocation.sourceRefs,
    })),
  ]

  return subjects
    .filter((subject) => subject.sourceRefs.some((sourceRef) => CandidateFactSourceKinds.has(sourceRef.kind)))
    .map((subject) => CandidateFactSchema.parse({
      entityRef: `${subject.subjectType}:${subject.subjectId}`,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      statusConfidence: subject.statusConfidence,
      sourceRefs: uniqueSourceRefs(subject.sourceRefs),
      requiresConfirmation: subject.statusConfidence !== "confirmed",
    }))
    .sort((left, right) => left.entityRef.localeCompare(right.entityRef))
}

function applyConfirmations(args: {
  input: CloudSolutionSliceInput
  entityRefs: string[]
}): {
  normalizedInput: CloudSolutionSliceInput
  confirmationSummary: CandidateFactConfirmationSummary
} {
  const requestedEntityRefs = [...new Set(args.entityRefs)].sort((left, right) => left.localeCompare(right))
  const requestedSet = new Set(requestedEntityRefs)
  const foundEntityRefs = new Set<string>()

  const promoteIfRequested = <T extends { id: string; statusConfidence: string }>(
    subjectType: string,
    item: T,
  ): T => {
    const entityRef = `${subjectType}:${item.id}`
    if (!requestedSet.has(entityRef)) {
      return item
    }

    foundEntityRefs.add(entityRef)
    return {
      ...item,
      statusConfidence: "confirmed",
    }
  }

  const normalizedInput = CloudSolutionSliceInputSchema.parse({
    ...args.input,
    devices: args.input.devices.map((device) => promoteIfRequested("device", device)),
    racks: args.input.racks.map((rack) => promoteIfRequested("rack", rack)),
    ports: args.input.ports.map((port) => promoteIfRequested("port", port)),
    links: args.input.links.map((link) => promoteIfRequested("link", link)),
    segments: args.input.segments.map((segment) => promoteIfRequested("segment", segment)),
    allocations: args.input.allocations.map((allocation) =>
      promoteIfRequested("allocation", allocation)),
  })

  const candidateFacts = buildCandidateFacts(normalizedInput)
  return {
    normalizedInput,
    confirmationSummary: CandidateFactConfirmationSummarySchema.parse({
      requestedEntityRefs,
      confirmedEntityRefs: candidateFacts
        .filter((fact) => requestedSet.has(fact.entityRef) && fact.statusConfidence === "confirmed")
        .map((fact) => fact.entityRef),
      pendingEntityRefs: candidateFacts
        .filter((fact) => fact.statusConfidence !== "confirmed")
        .map((fact) => fact.entityRef),
      missingEntityRefs: requestedEntityRefs.filter((entityRef) => !foundEntityRefs.has(entityRef)),
    }),
  }
}

export function prepareDraftSolutionInput(
  args: PrepareDraftSolutionInputArgs,
): PreparedDraftSolutionInput {
  const rawInput = args.input
  const rawInputRecord = rawInput as Record<string, unknown>
  if (typeof rawInput !== "object" || rawInput === null) {
    return {
      normalizedInput: CloudSolutionSliceInputSchema.parse(rawInput),
      inputState: "confirmed_slice",
      candidateFacts: [],
      confirmationSummary: CandidateFactConfirmationSummarySchema.parse({}),
    }
  }
  const rawPendingConfirmationItems = extractRawPendingConfirmationItems(rawInputRecord)

  const hasDraftKeys = "structuredInput" in rawInput || "documentAssist" in rawInput || "confirmation" in rawInput
  if (!hasDraftKeys) {
    // Check if input contains entities with document-based inferred/unresolved confidence
      if (hasCandidateFactSourceBasedFacts(rawInputRecord)) {
        // Treat as a candidate fact draft even without explicit documentAssist wrapper
      const normalizedInput = CloudSolutionSliceInputSchema.parse(rawInput)
      const pendingConfirmationItems = resolvePendingConfirmationItems({
        items: rawPendingConfirmationItems,
        input: normalizedInput,
      })
      const candidateFacts = buildCandidateFacts(normalizedInput)
      const confirmationSummary = CandidateFactConfirmationSummarySchema.parse(
        pendingConfirmationItems.length > 0
          ? { pendingConfirmationItems }
          : {},
      )
      return {
        normalizedInput,
        inputState: candidateFacts.some((fact) => fact.requiresConfirmation)
          ? "candidate_fact_draft"
          : "confirmed_slice",
        candidateFacts,
        confirmationSummary,
      }
    }

    const normalizedInput = CloudSolutionSliceInputSchema.parse(rawInput)
    const pendingConfirmationItems = resolvePendingConfirmationItems({
      items: rawPendingConfirmationItems,
      input: normalizedInput,
    })

    return {
      normalizedInput,
      inputState: "confirmed_slice",
      candidateFacts: [],
      confirmationSummary: CandidateFactConfirmationSummarySchema.parse(
        pendingConfirmationItems.length > 0
          ? { pendingConfirmationItems }
          : {},
      ),
    }
  }

  if (hasDraftKeys && hasNonEmptyCanonicalEntities(rawInputRecord)) {
    throw new Error(
      "Provide either canonical slice entities or draft/document-assisted input, not both.",
    )
  }

  const preprocessedInput = {
    ...rawInputRecord,
    ...(rawInputRecord.structuredInput
      ? {
          structuredInput: applyDraftConfidenceDefaults(rawInputRecord.structuredInput),
        }
      : {}),
    ...(rawInputRecord.documentAssist && typeof rawInputRecord.documentAssist === "object"
      ? {
          documentAssist: {
            ...rawInputRecord.documentAssist,
            candidateFacts: applyDraftConfidenceDefaults(
              (rawInputRecord.documentAssist as { candidateFacts?: unknown }).candidateFacts,
            ),
          },
        }
      : {}),
  }

  const parsedInput = DraftPreparationSchema.parse(preprocessedInput)
  if (parsedInput.structuredInput && parsedInput.documentAssist) {
    throw new Error("Provide either structuredInput or documentAssist, not both.")
  }

  if (!parsedInput.structuredInput && !parsedInput.documentAssist) {
    throw new Error("Provide structuredInput or documentAssist for draft preparation.")
  }

  if (parsedInput.documentAssist && !args.allowDocumentAssist) {
    throw new Error("Document-assisted drafting is disabled by plugin config.")
  }

  const draftStructuredInput = parsedInput.documentAssist
    ? mergeDocumentSourcesIntoStructuredInput({
        structuredInput: parsedInput.documentAssist.candidateFacts,
        documentSources: parsedInput.documentAssist.documentSources,
      })
    : parsedInput.structuredInput!

  assertDraftOnlyStructuredInput({
    rootPath: parsedInput.documentAssist
      ? ["documentAssist", "candidateFacts"]
      : ["structuredInput"],
    structuredInput: draftStructuredInput,
  })

  const normalizedDraft = normalizeStructuredSolutionInput({
    requirement: parsedInput.requirement,
    structuredInput: draftStructuredInput,
  })
  const promoted = applyConfirmations({
    input: normalizedDraft,
    entityRefs: parsedInput.documentAssist
      ? (parsedInput.confirmation?.entityRefs ?? [])
      : [],
  })
  const pendingConfirmationItems = resolvePendingConfirmationItems({
    items: parsedInput.pendingConfirmationItems,
    input: promoted.normalizedInput,
  })
  const candidateFacts = buildCandidateFacts(promoted.normalizedInput)

  return {
    normalizedInput: promoted.normalizedInput,
    inputState: parsedInput.documentAssist
      ? candidateFacts.some((fact) => fact.requiresConfirmation)
        ? "candidate_fact_draft"
        : "confirmed_slice"
      : "structured_input",
    candidateFacts,
    confirmationSummary: CandidateFactConfirmationSummarySchema.parse({
      ...promoted.confirmationSummary,
      ...(pendingConfirmationItems.length > 0
        ? {
            pendingConfirmationItems,
          }
        : {}),
    }),
  }
}

export { resolvePendingConfirmationItems }

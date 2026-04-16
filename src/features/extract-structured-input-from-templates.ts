import { existsSync, realpathSync, statSync } from "node:fs"
import path from "node:path"
import { z } from "zod"

import type { CloudSolutionConfig } from "../config"
import { SolutionRequirementSchema, SourceReferenceSchema } from "../domain"
import type { WorkerRuntimeContext } from "../coordinator/types"
import { StructuredSolutionInputSchema } from "../normalizers/normalize-structured-solution-input"
import { prepareDocumentSourcesAsMarkdown } from "./document-source-markdown"

const TemplateSourceSchema = SourceReferenceSchema.extend({
  kind: z.enum(["document", "diagram", "image"]),
})

const ExtractStructuredInputFromTemplatesInputSchema = z.object({
  requirement: SolutionRequirementSchema,
  documentSources: z.array(TemplateSourceSchema).min(1),
})

type TemplateSourceRef = z.infer<typeof TemplateSourceSchema>
type StructuredInput = z.infer<typeof StructuredSolutionInputSchema.shape.structuredInput>

type MutablePort = {
  name: string
  purpose?: string
  portType?: StructuredInput["devices"][number]["ports"][number]["portType"]
  portIndex?: number
  sourceRefs: TemplateSourceRef[]
  statusConfidence: "inferred"
}

type MutableDevice = {
  name: string
  role: string
  rackName?: string
  rackPosition?: number
  rackUnitHeight?: number
  powerWatts?: number
  powerSourcePriority?: number
  sourceRefs: TemplateSourceRef[]
  statusConfidence: "inferred"
  ports: Map<string, MutablePort>
}

type MutableRack = {
  name: string
  row?: string
  uHeight?: number
  maxPowerKw?: number
  sourceRefs: TemplateSourceRef[]
  statusConfidence: "inferred"
}

type MutableLink = StructuredInput["links"][number]

type TemplateAdapterState = {
  racks: Map<string, MutableRack>
  devices: Map<string, MutableDevice>
  links: MutableLink[]
  portCounters: Map<string, number>
  portPlanProfiles: PortPlanProfile[]
  portPlanAssignmentsByDevice: Map<string, PortPlanAssignment[]>
  inventoryProfiles: InventoryProfile[]
  parameterPowerProfiles: ParameterPowerProfile[]
  warnings: string[]
}

type PortPlanPortCategory =
  | "business"
  | "storage"
  | "inband-mgmt"
  | "oob-mgmt"
  | "peer-link"
  | "uplink"
  | "inter-switch"
  | "server-facing"
  | "data"

type PortPlanAssignment = {
  boardNumber: string
  boardType?: string
  portIndex: number
  portName: string
  category: PortPlanPortCategory
  portType?: StructuredInput["devices"][number]["ports"][number]["portType"]
  purpose?: string
  sourceRefs: TemplateSourceRef[]
  used: boolean
}

type PortPlanProfile = {
  title: string
  sectionTitle: string
  matchKey: string
  modelKey?: string
  parity?: "odd" | "even"
  assignments: PortPlanAssignment[]
}

type InventoryProfile = {
  title: string
  matchKey: string
  modelKey?: string
  sourceRefs: TemplateSourceRef[]
}

type ParameterPowerProfile = {
  title: string
  matchKey: string
  modelKey?: string
  powerWatts: number
  sourceRefs: TemplateSourceRef[]
}

type TemplateSemantics = {
  linkType?: StructuredInput["links"][number]["linkType"]
  endpointAPortType?: StructuredInput["devices"][number]["ports"][number]["portType"]
  endpointBPortType?: StructuredInput["devices"][number]["ports"][number]["portType"]
  endpointAPortBucket: string
  endpointBPortBucket: string
  purpose: string
}

type MarkdownSection = {
  title: string
  body: string
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function mergeSourceRefs(current: TemplateSourceRef[], incoming: TemplateSourceRef[]): TemplateSourceRef[] {
  const seen = new Set(current.map((ref) => `${ref.kind}:${ref.ref}:${ref.note ?? ""}`))
  const merged = [...current]

  for (const sourceRef of incoming) {
    const key = `${sourceRef.kind}:${sourceRef.ref}:${sourceRef.note ?? ""}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(sourceRef)
    }
  }

  return merged
}

function normalizeTemplateSourceRefs(args: {
  documentSources: TemplateSourceRef[]
  rootDirectory: string
}): TemplateSourceRef[] {
  const canonicalRootDirectory = realpathSync(args.rootDirectory)

  return args.documentSources.map((sourceRef) => {
    if (path.isAbsolute(sourceRef.ref)) {
      throw new Error("documentSources[].ref must be relative to the current workspace.")
    }

    const resolvedRef = path.resolve(args.rootDirectory, sourceRef.ref)
    const relativeRef = path.relative(args.rootDirectory, resolvedRef)
    if (relativeRef === "" || relativeRef.startsWith("..") || path.isAbsolute(relativeRef)) {
      throw new Error("documentSources[].ref must stay within the current workspace.")
    }

    if (!existsSync(resolvedRef)) {
      throw new Error("documentSources[].ref must point to an existing file within the current workspace.")
    }

    const canonicalResolvedRef = realpathSync(resolvedRef)
    const canonicalRelativeRef = path.relative(canonicalRootDirectory, canonicalResolvedRef)
    if (
      canonicalRelativeRef === ""
      || canonicalRelativeRef.startsWith("..")
      || path.isAbsolute(canonicalRelativeRef)
    ) {
      throw new Error("documentSources[].ref must not resolve outside the current workspace.")
    }

    const sourceStat = statSync(canonicalResolvedRef)
    if (!sourceStat.isFile()) {
      throw new Error("documentSources[].ref must point to a file within the current workspace.")
    }

    return {
      ...sourceRef,
      ref: relativeRef,
    }
  })
}

function cleanCell(value: string | undefined): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim()
  if (normalized === "NaN" || normalized === "Unnamed:" || normalized.startsWith("Unnamed:")) {
    return ""
  }
  return normalized
}

function parseNumber(value: string | undefined): number | undefined {
  const normalized = cleanCell(value).replace(/,/g, "")
  if (!normalized) {
    return undefined
  }

  const numeric = Number.parseFloat(normalized.replace(/[^0-9.\-]+/g, ""))
  return Number.isFinite(numeric) ? numeric : undefined
}

function parsePowerKw(value: string | undefined): number | undefined {
  const normalized = cleanCell(value)
  const kwMatch = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*kw/i)
  if (kwMatch?.[1]) {
    return Number.parseFloat(kwMatch[1])
  }

  return parseNumber(normalized)
}

function parseRackHeightU(value: string | undefined): number | undefined {
  const normalized = cleanCell(value)
  const match = normalized.match(/(\d+)\s*U/i)
  if (match?.[1]) {
    return Number.parseInt(match[1], 10)
  }

  return undefined
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeMatchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
}

function relaxPortFamilyKey(value: string): string {
  return value
    .replace(/千兆|干兆|万兆|10ge|25ge|40ge|100ge/giu, "")
}

function extractTrailingInstanceNumber(value: string): number | undefined {
  const match = value.match(/-(\d+)$/)
  return match?.[1] ? Number.parseInt(match[1], 10) : undefined
}

function inferDeviceParity(value: string): "odd" | "even" | undefined {
  if (/(?:-|\b)A\d*$/i.test(value)) {
    return "odd"
  }
  if (/(?:-|\b)B\d*$/i.test(value)) {
    return "even"
  }

  const instanceNumber = extractTrailingInstanceNumber(value)
  if (typeof instanceNumber === "number") {
    return instanceNumber % 2 === 0 ? "even" : "odd"
  }

  return undefined
}

function inferParity(value: string): "odd" | "even" | undefined {
  if (value.includes("奇数") || value.includes("A设备")) {
    return "odd"
  }
  if (value.includes("偶数") || value.includes("B设备")) {
    return "even"
  }
  return undefined
}

function deriveProfileMatchKey(args: {
  sectionTitle: string
  profileTitle: string
}): string {
  const combined = `${args.sectionTitle} ${args.profileTitle}`
  const explicitPatterns = [
    /[A-Z]\d{1,2}-?[HK]?服务器/iu,
    /千兆带内管理TOR/iu,
    /千兆带外管理TOR/iu,
    /带内管理TOR/iu,
    /带外管理TOR/iu,
    /万兆带内管理TOR/iu,
    /SDN硬件接入交换机\((?:10|25)GE\)/iu,
    /业务\/存储接入交换机\(10GE\)/iu,
    /存储接入交换机\((?:10|40)GE\)/iu,
    /管理核心交换机/iu,
    /管理汇聚交换机/iu,
    /核心交换机/iu,
    /业务专用设备接入交换机/iu,
    /SDN网关/iu,
  ]

  for (const pattern of explicitPatterns) {
    const match = combined.match(pattern)
    if (match?.[0]) {
      return normalizeMatchText(match[0])
    }
  }

  return normalizeMatchText(args.profileTitle || args.sectionTitle)
}

function extractModelKey(value: string): string | undefined {
  const matches = value.match(/[A-Z][A-Z0-9-]{3,}/g) ?? []
  const sorted = matches
    .map((match) => normalizeMatchText(match))
    .filter((match) => /\d/.test(match))
    .sort((left, right) => right.length - left.length)

  return sorted[0]
}

function looksLikeTableHeaderRow(row: string[]): boolean {
  return row.some((cell) => cell.includes("板卡编号")) && row.some((cell) => cell.includes("端口编号"))
}

function looksLikeProfileTitleRow(row: string[]): boolean {
  const nonEmptyCells = row.filter((cell) => cell.length > 0)
  if (nonEmptyCells.length === 0) {
    return false
  }

  if (looksLikeTableHeaderRow(row)) {
    return false
  }

  const firstCell = nonEmptyCells[0] ?? ""
  return !/^\d/.test(firstCell) && !/^NaN$/i.test(firstCell)
}

function parsePortNumberSpec(value: string | undefined): number[] {
  const normalized = cleanCell(value)
  if (!normalized) {
    return []
  }

  const parts = normalized.split(/[，,、]/).map((part) => part.trim()).filter(Boolean)
  const results: number[] = []

  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*[-~]\s*(\d+)$/)
    if (rangeMatch?.[1] && rangeMatch[2]) {
      const start = Number.parseInt(rangeMatch[1], 10)
      const end = Number.parseInt(rangeMatch[2], 10)
      const low = Math.min(start, end)
      const high = Math.max(start, end)
      for (let current = low; current <= high; current += 1) {
        results.push(current)
      }
      continue
    }

    const numeric = Number.parseInt(part, 10)
    if (Number.isFinite(numeric)) {
      results.push(numeric)
    }
  }

  return [...new Set(results)]
}

function buildPlannedPortName(boardNumber: string, portIndex: number): string {
  const normalizedBoard = boardNumber.replace(/\s+/g, "") || "board"
  return `${normalizedBoard}/${portIndex}`
}

function classifyPortPlanAssignment(args: {
  sectionTitle: string
  profileTitle: string
  boardType?: string
  connectTo?: string
  direction?: string
  purpose?: string
}): {
  category: PortPlanPortCategory
  portType?: StructuredInput["devices"][number]["ports"][number]["portType"]
  purpose?: string
} {
  const connectTo = cleanCell(args.connectTo)
  const direction = cleanCell(args.direction)
  const purpose = cleanCell(args.purpose)
  const context = `${args.sectionTitle} ${args.profileTitle} ${args.boardType ?? ""} ${connectTo} ${direction} ${purpose}`

  if (/IPMI|HDM/i.test(context)) {
    return { category: "oob-mgmt", portType: "oob-mgmt", purpose: purpose || "IPMI网络" }
  }
  if (/keepalive|IPL/i.test(context)) {
    return { category: "peer-link", portType: "peer-link", purpose: purpose || "peer-link" }
  }
  if (/核心交换机|汇聚交换机|网关|路由器|防火墙|内部互联/i.test(context)) {
    return { category: "uplink", portType: "uplink", purpose: purpose || "内部互联" }
  }
  if (/存储网|存储接入|磁盘阵列|高性能文件存储/i.test(context)) {
    return { category: "storage", portType: "storage", purpose: purpose || "存储网" }
  }
  if (/管理网|管理接入|千兆管理网络|万兆管理网络|带内管理/i.test(context)) {
    return { category: "inband-mgmt", portType: "inband-mgmt", purpose: purpose || "管理网" }
  }
  if (/业务网|业务接入/i.test(context)) {
    return { category: "business", portType: "business", purpose: purpose || "业务网" }
  }
  if (/服务器/i.test(context)) {
    return { category: "server-facing", purpose: purpose || "服务器" }
  }

  return { category: "data", purpose: purpose || undefined }
}

function parseInventoryWorkbook(args: {
  markdown: string
  sourceRef: TemplateSourceRef
  state: TemplateAdapterState
}) {
  const { markdown, sourceRef, state } = args

  for (const section of splitMarkdownSections(markdown)) {
    const rows = extractFirstTableRows(section)
    if (rows.length === 0) {
      continue
    }

    const headerIndex = rows.findIndex(
      (row) => row.some((cell) => cell.includes("项目")) && row.some((cell) => cell.includes("产品型号/编号")),
    )
    if (headerIndex < 0) {
      continue
    }

    for (const row of rows.slice(headerIndex + 1)) {
      const title = cleanCell(row[1])
      const model = cleanCell(row[2])
      if (!title || !model) {
        continue
      }

      state.inventoryProfiles.push({
        title,
        matchKey: deriveProfileMatchKey({
          sectionTitle: section.title,
          profileTitle: title,
        }),
        modelKey: extractModelKey(`${title} ${model}`),
        sourceRefs: [sourceRef],
      })
    }
  }
}

function parseParameterResponseWorkbook(args: {
  markdown: string
  sourceRef: TemplateSourceRef
  state: TemplateAdapterState
}) {
  const { markdown, sourceRef, state } = args

  for (const section of splitMarkdownSections(markdown)) {
    const rows = extractFirstTableRows(section)
    if (rows.length === 0) {
      continue
    }

    const headerIndex = rows.findIndex(
      (row) => row.some((cell) => cell.includes("设备名称"))
        && row.some((cell) => cell.includes("设备型号"))
        && row.some((cell) => cell.includes("设备实配运行功耗")),
    )
    if (headerIndex < 0) {
      continue
    }

    for (const row of rows.slice(headerIndex + 1)) {
      const title = cleanCell(row[0])
      const model = cleanCell(row[1])
      const powerWatts = parseNumber(row[7])
      if (!title || !model || typeof powerWatts !== "number") {
        continue
      }

      state.parameterPowerProfiles.push({
        title,
        matchKey: deriveProfileMatchKey({
          sectionTitle: section.title,
          profileTitle: title,
        }),
        modelKey: extractModelKey(`${title} ${model}`),
        powerWatts,
        sourceRefs: [sourceRef],
      })
    }
  }
}

function matchesByProfileKey(args: {
  deviceName: string
  profileKey: string
}): boolean {
  const normalizedDeviceName = normalizeMatchText(args.deviceName)
  const relaxedDeviceName = relaxPortFamilyKey(normalizedDeviceName)
  const relaxedProfileKey = relaxPortFamilyKey(args.profileKey)

  return normalizedDeviceName.includes(args.profileKey)
    || args.profileKey.includes(normalizedDeviceName)
    || (!!relaxedProfileKey && (
      relaxedDeviceName.includes(relaxedProfileKey)
      || relaxedProfileKey.includes(relaxedDeviceName)
    ))
}

function findMatchingInventoryProfiles(args: {
  state: TemplateAdapterState
  deviceName: string
}): InventoryProfile[] {
  const deviceModelKey = extractModelKey(args.deviceName)

  return args.state.inventoryProfiles
    .filter((profile) => {
      const keyMatches = matchesByProfileKey({
        deviceName: args.deviceName,
        profileKey: profile.matchKey,
      })
      const modelMatches = !!profile.modelKey && !!deviceModelKey && deviceModelKey.includes(profile.modelKey)
      return keyMatches || modelMatches
    })
    .sort((left, right) => right.matchKey.length - left.matchKey.length)
}

function warnOnAmbiguousMatches(args: {
  state: TemplateAdapterState
  deviceName: string
  matches: Array<{ title: string, matchKey: string }>
  warningPrefix: string
}) {
  const { state, deviceName, matches, warningPrefix } = args
  const strongestMatch = matches[0]
  const secondMatch = matches[1]
  if (!strongestMatch || !secondMatch) {
    return
  }

  if (secondMatch.matchKey.length === strongestMatch.matchKey.length) {
    state.warnings.push(
      `${warningPrefix} matched device ${deviceName}; selected '${strongestMatch.title}' using longest-key precedence.`,
    )
  }
}

function findMatchingParameterPowerProfiles(args: {
  state: TemplateAdapterState
  inventoryProfile: InventoryProfile
  deviceName: string
}): ParameterPowerProfile[] {
  const deviceModelKey = extractModelKey(args.deviceName)

  return args.state.parameterPowerProfiles
    .filter((profile) => {
      const inventoryKeyMatches = matchesByProfileKey({
        deviceName: args.inventoryProfile.title,
        profileKey: profile.matchKey,
      })
      const deviceKeyMatches = matchesByProfileKey({
        deviceName: args.deviceName,
        profileKey: profile.matchKey,
      })
      const modelMatches = !!profile.modelKey
        && (
          (!!args.inventoryProfile.modelKey && profile.modelKey === args.inventoryProfile.modelKey)
          || (!!deviceModelKey && deviceModelKey.includes(profile.modelKey))
        )

      return (inventoryKeyMatches || deviceKeyMatches) && modelMatches
    })
    .sort((left, right) => right.matchKey.length - left.matchKey.length)
}

function hydratePowerForDevice(args: {
  state: TemplateAdapterState
  deviceName: string
}) {
  const { state, deviceName } = args
  const device = state.devices.get(deviceName)
  if (!device) {
    return
  }

  const inventoryMatches = findMatchingInventoryProfiles({
    state,
    deviceName,
  })
  warnOnAmbiguousMatches({
    state,
    deviceName,
    matches: inventoryMatches,
    warningPrefix: "Multiple inventory profiles",
  })
  const inventoryProfile = inventoryMatches[0]
  if (!inventoryProfile) {
    if (state.inventoryProfiles.length > 0) {
      state.warnings.push(
        `No inventory workbook row matched device ${deviceName}, so device power remains unresolved until the project provides a matching inventory entry.`,
      )
    }
    return
  }

  const parameterMatches = findMatchingParameterPowerProfiles({
    state,
    inventoryProfile,
    deviceName,
  })
  warnOnAmbiguousMatches({
    state,
    deviceName,
    matches: parameterMatches,
    warningPrefix: "Multiple parameter-response power profiles",
  })
  const parameterProfile = parameterMatches[0]
  if (!parameterProfile) {
    state.warnings.push(
      `Inventory matched device ${deviceName}, but no parameter-response workbook row provided deterministic power for it.`,
    )
    return
  }

  if ((device.powerSourcePriority ?? 0) >= 3) {
    return
  }

  state.devices.set(deviceName, {
    ...device,
    powerWatts: parameterProfile.powerWatts,
    powerSourcePriority: 3,
    sourceRefs: mergeSourceRefs(
      device.sourceRefs,
      mergeSourceRefs(inventoryProfile.sourceRefs, parameterProfile.sourceRefs),
    ),
  })
}

function inferRoleFromDeviceName(deviceName: string): string {
  if (deviceName.includes("交换机") || deviceName.includes("TOR") || deviceName.includes("网关")) {
    return "switch"
  }
  if (deviceName.includes("防火墙")) {
    return "firewall"
  }
  if (deviceName.includes("路由器")) {
    return "router"
  }
  if (deviceName.includes("负载均衡")) {
    return "load-balancer"
  }
  if (deviceName.includes("IPS")) {
    return "ips"
  }
  if (deviceName.includes("WAF")) {
    return "waf"
  }
  if (deviceName.includes("探针")) {
    return "probe"
  }
  if (deviceName.includes("理线器")) {
    return "cable-manager"
  }
  if (deviceName.includes("服务器")) {
    return "server"
  }
  if (deviceName.includes("存储") || deviceName.includes("阵列")) {
    return "storage"
  }
  return "device"
}

function splitMarkdownSections(markdown: string): MarkdownSection[] {
  const sections: MarkdownSection[] = []
  const lines = markdown.split(/\r?\n/)
  let currentTitle = "document"
  let currentLines: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.*)$/)
    if (headingMatch) {
      if (currentLines.length > 0) {
        sections.push({
          title: currentTitle,
          body: currentLines.join("\n"),
        })
      }
      currentTitle = headingMatch[1]?.trim() || "document"
      currentLines = []
      continue
    }

    currentLines.push(line)
  }

  if (currentLines.length > 0) {
    sections.push({
      title: currentTitle,
      body: currentLines.join("\n"),
    })
  }

  return sections
}

function extractFirstTableRows(section: MarkdownSection): string[][] {
  const tableLines: string[] = []
  for (const line of section.body.split(/\r?\n/)) {
    if (line.trim().startsWith("|")) {
      tableLines.push(line)
      continue
    }

    if (tableLines.length > 0) {
      break
    }
  }

  const rows = tableLines
    .map((line) => line.split("|").slice(1, -1).map((cell) => cleanCell(cell)))
    .filter((row) => row.length > 0)
    .filter((row) => !row.every((cell) => /^:?-+:?$/.test(cell) || cell === ""))

  return rows
}

function inferRackRow(rackName: string): string | undefined {
  const match = rackName.match(/^([A-Z])/i)
  return match?.[1]?.toUpperCase()
}

function extractRackName(cell: string, previousCell: string): string | undefined {
  const normalized = cleanCell(cell)
  const match = normalized.match(/机柜[\(（]([^\)）]+)[\)）]/)
  if (match?.[1]) {
    return cleanCell(match[1].replace(/\s+\d+\s*U$/i, ""))
  }

  return cleanCell(previousCell) || undefined
}

function normalizePairBase(value: string): string {
  return value
    .replace(/[（(].*?[)）]/g, "")
    .replace(/[-－](?:[12]|[ABab])$/, "")
    .replace(/\s+/g, "")
    .trim()
}

function areLikelyPeerPair(left: string, right: string): boolean {
  const normalizedLeft = normalizePairBase(left)
  const normalizedRight = normalizePairBase(right)
  return !!normalizedLeft && normalizedLeft === normalizedRight
}

function inferTemplateSemantics(args: {
  sheetTitle: string
  endpointADeviceName: string
  endpointBDeviceName: string
}): TemplateSemantics {
  const { sheetTitle, endpointADeviceName, endpointBDeviceName } = args

  if (sheetTitle.includes("带内带外")) {
    const oob = /带外|IPMI/i.test(`${endpointADeviceName} ${endpointBDeviceName}`)
    return {
      linkType: oob ? "oob-mgmt" : "inband-mgmt",
      endpointAPortType: oob ? "oob-mgmt" : "inband-mgmt",
      endpointBPortType: oob ? "oob-mgmt" : "inband-mgmt",
      endpointAPortBucket: oob ? "oob-mgmt" : "inband-mgmt",
      endpointBPortBucket: oob ? "oob-mgmt" : "inband-mgmt",
      purpose: oob ? "template-oob-management" : "template-inband-management",
    }
  }

  if (sheetTitle.includes("上联")) {
    return {
      linkType: "uplink",
      endpointAPortType: "uplink",
      endpointBPortType: "uplink",
      endpointAPortBucket: "uplink",
      endpointBPortBucket: "uplink",
      purpose: "template-uplink",
    }
  }

  if (sheetTitle.includes("互联")) {
    const peerLink = areLikelyPeerPair(endpointADeviceName, endpointBDeviceName)
    return {
      linkType: peerLink ? "peer-link" : "inter-switch",
      endpointAPortType: peerLink ? "peer-link" : undefined,
      endpointBPortType: peerLink ? "peer-link" : undefined,
      endpointAPortBucket: peerLink ? "peer-link" : "inter-switch",
      endpointBPortBucket: peerLink ? "peer-link" : "inter-switch",
      purpose: peerLink ? "template-peer-link" : "template-inter-switch",
    }
  }

  return {
    endpointAPortType: "data",
    endpointBPortType: "data",
    endpointAPortBucket: "data",
    endpointBPortBucket: "data",
    purpose: "template-server-business-storage",
  }
}

function createTemplateAdapterState(): TemplateAdapterState {
  return {
    racks: new Map(),
    devices: new Map(),
    links: [],
    portCounters: new Map(),
    portPlanProfiles: [],
    portPlanAssignmentsByDevice: new Map(),
    inventoryProfiles: [],
    parameterPowerProfiles: [],
    warnings: [
      "Rack layout import currently defaults device rackUnitHeight to 1U when workbook markdown does not preserve merged-cell height.",
    ],
  }
}

function upsertRack(
  state: TemplateAdapterState,
  rackName: string,
  patch: Partial<MutableRack>,
  sourceRef: TemplateSourceRef,
) {
  const existing = state.racks.get(rackName)
  const nextRack: MutableRack = {
    name: rackName,
    row: patch.row ?? existing?.row ?? inferRackRow(rackName),
    uHeight: patch.uHeight ?? existing?.uHeight,
    maxPowerKw: patch.maxPowerKw ?? existing?.maxPowerKw,
    sourceRefs: mergeSourceRefs(existing?.sourceRefs ?? [], [sourceRef]),
    statusConfidence: "inferred",
  }

  state.racks.set(rackName, nextRack)
}

function upsertDevice(
  state: TemplateAdapterState,
  deviceName: string,
  patch: Partial<Omit<MutableDevice, "ports" | "sourceRefs" | "statusConfidence">>,
  sourceRef: TemplateSourceRef,
) {
  const existing = state.devices.get(deviceName)
  const existingPowerPriority = existing?.powerSourcePriority ?? 0
  const incomingPowerPriority = patch.powerWatts === undefined ? existingPowerPriority : (patch.powerSourcePriority ?? 0)
  const shouldReplacePower = patch.powerWatts !== undefined && incomingPowerPriority >= existingPowerPriority
  const nextDevice: MutableDevice = {
    name: deviceName,
    role: patch.role ?? existing?.role ?? inferRoleFromDeviceName(deviceName),
    rackName: patch.rackName ?? existing?.rackName,
    rackPosition: patch.rackPosition ?? existing?.rackPosition,
    rackUnitHeight: patch.rackUnitHeight ?? existing?.rackUnitHeight,
    powerWatts: shouldReplacePower ? patch.powerWatts : existing?.powerWatts,
    powerSourcePriority: shouldReplacePower ? incomingPowerPriority : existing?.powerSourcePriority,
    sourceRefs: mergeSourceRefs(existing?.sourceRefs ?? [], [sourceRef]),
    statusConfidence: "inferred",
    ports: existing?.ports ?? new Map(),
  }

  state.devices.set(deviceName, nextDevice)

  hydratePortPlanAssignmentsForDevice({
    state,
    deviceName,
  })
  hydratePowerForDevice({
    state,
    deviceName,
  })
}

function upsertPort(args: {
  state: TemplateAdapterState
  deviceName: string
  bucket: string
  portType?: MutablePort["portType"]
  sourceRef: TemplateSourceRef
  purpose?: string
}): string {
  const { state, deviceName, bucket, portType, sourceRef, purpose } = args
  const key = `${deviceName}:${bucket}`
  const nextIndex = (state.portCounters.get(key) ?? 0) + 1
  state.portCounters.set(key, nextIndex)
  const portName = `${bucket}-${nextIndex}`

  const device = state.devices.get(deviceName)
  if (!device) {
    throw new Error(`Template adapter attempted to add a port to missing device '${deviceName}'.`)
  }

  const existingPort = device.ports.get(portName)
  const nextPort: MutablePort = {
    name: portName,
    purpose: purpose ?? existingPort?.purpose,
    portType: portType ?? existingPort?.portType,
    portIndex: existingPort?.portIndex,
    sourceRefs: mergeSourceRefs(existingPort?.sourceRefs ?? [], [sourceRef]),
    statusConfidence: "inferred",
  }
  device.ports.set(portName, nextPort)
  return portName
}

function upsertPortFromPlan(args: {
  state: TemplateAdapterState
  deviceName: string
  assignment: PortPlanAssignment
}): string {
  const { state, deviceName, assignment } = args
  const device = state.devices.get(deviceName)
  if (!device) {
    throw new Error(`Template adapter attempted to bind a planned port to missing device '${deviceName}'.`)
  }

  const existingPort = device.ports.get(assignment.portName)
  device.ports.set(assignment.portName, {
    name: assignment.portName,
    purpose: assignment.purpose ?? existingPort?.purpose,
    portType: assignment.portType ?? existingPort?.portType,
    portIndex: assignment.portIndex,
    sourceRefs: mergeSourceRefs(existingPort?.sourceRefs ?? [], assignment.sourceRefs),
    statusConfidence: "inferred",
  })

  return assignment.portName
}

function parsePortPlanWorkbook(args: {
  markdown: string
  sourceRef: TemplateSourceRef
  state: TemplateAdapterState
}) {
  const { markdown, sourceRef, state } = args

  for (const section of splitMarkdownSections(markdown)) {
    const rows = extractFirstTableRows(section)
    if (rows.length === 0) {
      continue
    }

    let currentProfileTitle = section.title
    let currentBoardNumber = ""
    let currentBoardType = ""
    let insideTable = false

    for (const row of rows) {
      if (looksLikeProfileTitleRow(row)) {
        currentProfileTitle = row.find((cell) => cell.length > 0) ?? section.title
        insideTable = false
        currentBoardNumber = ""
        currentBoardType = ""
        continue
      }

      if (looksLikeTableHeaderRow(row)) {
        insideTable = true
        currentBoardNumber = ""
        currentBoardType = ""
        continue
      }

      if (!insideTable) {
        continue
      }

      const portIndexes = parsePortNumberSpec(row[2])
      if (portIndexes.length === 0) {
        continue
      }

      currentBoardNumber = cleanCell(row[0]) || currentBoardNumber
      currentBoardType = cleanCell(row[1]) || currentBoardType
      if (!currentBoardNumber) {
        continue
      }

      const classification = classifyPortPlanAssignment({
        sectionTitle: section.title,
        profileTitle: currentProfileTitle,
        boardType: currentBoardType,
        connectTo: row[4],
        direction: row[5],
        purpose: row[6],
      })
      const matchKey = deriveProfileMatchKey({
        sectionTitle: section.title,
        profileTitle: currentProfileTitle,
      })
      const parity = inferParity(currentProfileTitle)
      let profile = state.portPlanProfiles.find(
        (entry) => entry.matchKey === matchKey && entry.parity === parity && entry.title === currentProfileTitle,
      )
      if (!profile) {
        profile = {
          title: currentProfileTitle,
          sectionTitle: section.title,
          matchKey,
          modelKey: extractModelKey(`${section.title} ${currentProfileTitle}`),
          parity,
          assignments: [],
        }
        state.portPlanProfiles.push(profile)
      }

      for (const portIndex of portIndexes) {
        profile.assignments.push({
          boardNumber: currentBoardNumber,
          boardType: currentBoardType || undefined,
          portIndex,
          portName: buildPlannedPortName(currentBoardNumber, portIndex),
          category: classification.category,
          portType: classification.portType,
          purpose: classification.purpose,
          sourceRefs: [sourceRef],
          used: false,
        })
      }
    }
  }
}

function findMatchingPortPlanProfiles(args: {
  state: TemplateAdapterState
  deviceName: string
}): PortPlanProfile[] {
  const normalizedDeviceName = normalizeMatchText(args.deviceName)
  const relaxedDeviceName = relaxPortFamilyKey(normalizedDeviceName)
  const deviceParity = inferDeviceParity(args.deviceName)

  const candidates = args.state.portPlanProfiles.filter((profile: PortPlanProfile) => {
    const profileMatchesDevice = !!profile.matchKey && (
      normalizedDeviceName.includes(profile.matchKey)
      || profile.matchKey.includes(normalizedDeviceName)
    )
    const relaxedProfileKey = relaxPortFamilyKey(profile.matchKey)
    const relaxedMatchesDevice = !!relaxedProfileKey && (
      relaxedDeviceName.includes(relaxedProfileKey)
      || relaxedProfileKey.includes(relaxedDeviceName)
    )
    const modelMatchesDevice = !!profile.modelKey && normalizedDeviceName.includes(profile.modelKey)

    if (!profileMatchesDevice && !relaxedMatchesDevice && !modelMatchesDevice) {
      return false
    }

    if (!profile.parity || !deviceParity) {
      return true
    }

    return profile.parity === deviceParity
  })

  return candidates.sort((left: PortPlanProfile, right: PortPlanProfile) => right.matchKey.length - left.matchKey.length)
}

function hydratePortPlanAssignmentsForDevice(args: {
  state: TemplateAdapterState
  deviceName: string
}) {
  const { state, deviceName } = args
  if (state.portPlanAssignmentsByDevice.has(deviceName)) {
    return
  }

  const matches = findMatchingPortPlanProfiles({
    state,
    deviceName,
  })
  if (matches.length === 0) {
    return
  }

  const selectedProfile = matches[0]
  if (
    matches.length > 1
    && matches[1]
    && matches[1].matchKey.length === selectedProfile.matchKey.length
  ) {
    state.warnings.push(
      `Multiple workbook-derived port plan profiles matched device ${deviceName}; selected '${selectedProfile.title}' using longest-key precedence.`,
    )
  }

  const clonedAssignments = selectedProfile.assignments.map((assignment) => ({
    ...assignment,
    sourceRefs: [...assignment.sourceRefs],
    used: false,
  }))
  state.portPlanAssignmentsByDevice.set(deviceName, clonedAssignments)

  for (const assignment of clonedAssignments) {
    upsertPortFromPlan({
      state,
      deviceName,
      assignment,
    })
  }
}

function determineRequestedPortCategories(bucket: string): PortPlanPortCategory[] {
  switch (bucket) {
    case "business":
      return ["business", "server-facing", "data"]
    case "storage":
      return ["storage", "server-facing", "data"]
    case "inband-mgmt":
      return ["inband-mgmt", "server-facing", "data"]
    case "oob-mgmt":
      return ["oob-mgmt", "server-facing", "data"]
    case "peer-link":
      return ["peer-link"]
    case "uplink":
      return ["uplink", "inter-switch"]
    case "inter-switch":
      return ["inter-switch", "uplink"]
    default:
      return ["data", "business", "storage", "server-facing"]
  }
}

function resolveTemplatePortName(args: {
  state: TemplateAdapterState
  deviceName: string
  bucket: string
  portType?: MutablePort["portType"]
  sourceRef: TemplateSourceRef
  purpose?: string
}): string {
  const { state, deviceName, bucket, portType, sourceRef, purpose } = args
  hydratePortPlanAssignmentsForDevice({
    state,
    deviceName,
  })
  const assignments = state.portPlanAssignmentsByDevice.get(deviceName)
  const requestedCategories = determineRequestedPortCategories(bucket)

  if (assignments) {
    const assignment = assignments.find(
      (candidate) => !candidate.used && requestedCategories.includes(candidate.category),
    )
    if (assignment) {
      assignment.used = true
      return upsertPortFromPlan({
        state,
        deviceName,
        assignment: {
          ...assignment,
          portType: assignment.portType ?? portType,
          purpose: assignment.purpose ?? purpose,
          sourceRefs: mergeSourceRefs(assignment.sourceRefs, [sourceRef]),
        },
      })
    }

    state.warnings.push(
      `Port plan matched device ${deviceName}, but no remaining ${bucket} port was available in workbook-derived assignments. Falling back to synthesized port naming.`,
    )
  } else if (state.portPlanProfiles.length > 0) {
    state.warnings.push(
      `No workbook-derived port plan profile matched device ${deviceName}. Falling back to synthesized port naming for ${bucket}.`,
    )
  }

  return upsertPort({
    state,
    deviceName,
    bucket,
    portType,
    sourceRef,
    purpose,
  })
}

function parseCablingWorkbook(args: {
  markdown: string
  sourceRef: TemplateSourceRef
  state: TemplateAdapterState
}) {
  const { markdown, sourceRef, state } = args

  for (const section of splitMarkdownSections(markdown)) {
    const rows = extractFirstTableRows(section)
    if (rows.length < 3) {
      continue
    }

    for (const row of rows.slice(2)) {
      const cableIndex = parseNumber(row[0])
      const endpointARackName = cleanCell(row[6])
      const endpointADeviceName = cleanCell(row[7])
      const endpointBRackName = cleanCell(row[8])
      const endpointBDeviceName = cleanCell(row[9])
      if (
        typeof cableIndex !== "number"
        || !endpointARackName
        || !endpointADeviceName
        || !endpointBRackName
        || !endpointBDeviceName
      ) {
        continue
      }

      const semantics = inferTemplateSemantics({
        sheetTitle: section.title,
        endpointADeviceName,
        endpointBDeviceName,
      })

      upsertRack(state, endpointARackName, {}, sourceRef)
      upsertRack(state, endpointBRackName, {}, sourceRef)
      upsertDevice(state, endpointADeviceName, { rackName: endpointARackName }, sourceRef)
      upsertDevice(state, endpointBDeviceName, { rackName: endpointBRackName }, sourceRef)

      const endpointAPortName = resolveTemplatePortName({
        state,
        deviceName: endpointADeviceName,
        bucket: semantics.endpointAPortBucket,
        portType: semantics.endpointAPortType,
        sourceRef,
        purpose: semantics.purpose,
      })
      const endpointBPortName = resolveTemplatePortName({
        state,
        deviceName: endpointBDeviceName,
        bucket: semantics.endpointBPortBucket,
        portType: semantics.endpointBPortType,
        sourceRef,
        purpose: semantics.purpose,
      })

      state.links.push({
        endpointA: {
          deviceName: endpointADeviceName,
          portName: endpointAPortName,
        },
        endpointB: {
          deviceName: endpointBDeviceName,
          portName: endpointBPortName,
        },
        purpose: semantics.purpose,
        linkType: semantics.linkType,
        cableId: cleanCell(row[0]),
        cableName: cleanCell(row[1]) || undefined,
        cableSpec: cleanCell(row[2]) || undefined,
        cableCount: parseNumber(row[3]),
        sourceRefs: [sourceRef],
        statusConfidence: "inferred",
      })
    }
  }
}

function parseRackLayoutWorkbook(args: {
  markdown: string
  sourceRef: TemplateSourceRef
  state: TemplateAdapterState
}) {
  const { markdown, sourceRef, state } = args

  for (const section of splitMarkdownSections(markdown)) {
    const rows = extractFirstTableRows(section)
    if (rows.length === 0) {
      continue
    }

    let activeBlocks: Array<{ rackName: string, blockStart: number, maxPowerKw?: number, uHeight?: number }> = []

    for (const row of rows) {
      const headerBlocks = row.flatMap((cell, index) => {
        if (!cell.includes("机柜(" ) && !cell.includes("机柜（")) {
          return []
        }

        const rackName = extractRackName(cell, row[index - 1] ?? "")
        if (!rackName) {
          return []
        }

        const blockStart = Math.max(index - 1, 0)
        const maxPowerKw = parsePowerKw(row[index + 2])
        const uHeight = parseRackHeightU([
          row[index - 1] ?? "",
          cell,
          row[index + 1] ?? "",
          row[index + 2] ?? "",
          row[index + 3] ?? "",
        ].join(" "))
        return [{
          rackName,
          blockStart,
          maxPowerKw,
          uHeight,
        }]
      })

      if (headerBlocks.length > 0) {
        activeBlocks = headerBlocks
        for (const block of activeBlocks) {
          upsertRack(state, block.rackName, { maxPowerKw: block.maxPowerKw, uHeight: block.uHeight }, sourceRef)
        }
        continue
      }

      for (const block of activeBlocks) {
        const rackPosition = parseNumber(row[block.blockStart + 2])
        if (typeof rackPosition !== "number") {
          continue
        }

        const deviceName = cleanCell(row[block.blockStart + 1])
        if (!deviceName || deviceName.includes("总功耗")) {
          continue
        }

        const powerWatts = parseNumber(row[block.blockStart])
        upsertDevice(state, deviceName, {
          rackName: block.rackName,
          rackPosition,
          rackUnitHeight: 1,
          powerWatts,
          powerSourcePriority: 1,
        }, sourceRef)
      }
    }
  }
}

function detectWorkbookKind(args: {
  sourceRef: TemplateSourceRef
  markdown: string
}): "cabling" | "rack-layout" | "port-plan" | "inventory" | "parameter-response" | "unsupported" {
  const refText = `${args.sourceRef.ref} ${args.sourceRef.note ?? ""}`

  if (
    refText.includes("连线")
    || args.markdown.includes("## 服务器业务存储连线")
    || args.markdown.includes("## 服务器带内带外连线")
    || args.markdown.includes("## 交换机互联表")
    || args.markdown.includes("## 交换机上联表")
  ) {
    return "cabling"
  }

  if (refText.includes("装架") || args.markdown.includes("机柜(") || args.markdown.includes("机柜（")) {
    return "rack-layout"
  }

  if (refText.includes("端口规划") || args.markdown.includes("板卡编号") && args.markdown.includes("主要用途")) {
    return "port-plan"
  }

  if (refText.includes("设备清单") || args.markdown.includes("产品型号/编号")) {
    return "inventory"
  }

  if (refText.includes("参数应答表") || args.markdown.includes("设备参数表") && args.markdown.includes("设备实配运行功耗")) {
    return "parameter-response"
  }

  return "unsupported"
}

function buildStructuredInput(state: TemplateAdapterState): StructuredInput {
  const racks = [...state.racks.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((rack) => {
      if (typeof rack.uHeight !== "number") {
        state.warnings.push(
          `Defaulted rack ${rack.name} to 48U because no explicit rack height was provided for this project.`,
        )
      }
      if (typeof rack.maxPowerKw !== "number") {
        state.warnings.push(
          `Defaulted rack ${rack.name} to 7kW because no explicit rack power limit was provided; project confirmation is still required.`,
        )
      }

      return {
        name: rack.name,
        row: rack.row,
        uHeight: rack.uHeight ?? 48,
        maxPowerKw: rack.maxPowerKw ?? 7,
        sourceRefs: rack.sourceRefs,
        statusConfidence: rack.statusConfidence,
      }
    })

  const devices = [...state.devices.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((device) => ({
      name: device.name,
      role: device.role,
      rackName: device.rackName,
      rackPosition: device.rackPosition,
      rackUnitHeight: device.rackUnitHeight,
      powerWatts: device.powerWatts,
      ports: [...device.ports.values()]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((port) => ({
          name: port.name,
          purpose: port.purpose,
          portType: port.portType,
          portIndex: port.portIndex,
          sourceRefs: port.sourceRefs,
          statusConfidence: port.statusConfidence,
        })),
      sourceRefs: device.sourceRefs,
      statusConfidence: device.statusConfidence,
    }))

  const links = state.links
    .slice()
    .sort((left, right) => {
      const endpointDelta = `${left.endpointA.deviceName}:${left.endpointA.portName}:${left.endpointB.deviceName}:${left.endpointB.portName}`
        .localeCompare(
          `${right.endpointA.deviceName}:${right.endpointA.portName}:${right.endpointB.deviceName}:${right.endpointB.portName}`,
        )
      if (endpointDelta !== 0) {
        return endpointDelta
      }
      return (left.cableId ?? "").localeCompare(right.cableId ?? "")
    })

  return StructuredSolutionInputSchema.shape.structuredInput.parse({
    racks,
    devices,
    links,
    segments: [],
    allocations: [],
  })
}

export async function runExtractStructuredInputFromTemplates(args: {
  input: unknown
  pluginConfig: CloudSolutionConfig
  runtime: WorkerRuntimeContext
  rootDirectory: string
}) {
  if (!args.pluginConfig.allow_document_assist) {
    throw new Error("Template-to-structured-input import requires document assist to be enabled.")
  }

  const parsedInput = ExtractStructuredInputFromTemplatesInputSchema.parse(args.input)
  const normalizedDocumentSources = normalizeTemplateSourceRefs({
    documentSources: parsedInput.documentSources,
    rootDirectory: args.rootDirectory,
  })

  const markdownPreparation = await prepareDocumentSourcesAsMarkdown({
    documentSources: normalizedDocumentSources,
    runtime: args.runtime,
  })

  const state = createTemplateAdapterState()

  for (const convertedDocument of markdownPreparation.convertedDocuments) {
    const workbookKind = detectWorkbookKind({
      sourceRef: convertedDocument.sourceRef,
      markdown: convertedDocument.markdown,
    })

    if (workbookKind === "inventory") {
      parseInventoryWorkbook({
        markdown: convertedDocument.markdown,
        sourceRef: convertedDocument.sourceRef,
        state,
      })
      continue
    }

    if (workbookKind === "parameter-response") {
      parseParameterResponseWorkbook({
        markdown: convertedDocument.markdown,
        sourceRef: convertedDocument.sourceRef,
        state,
      })
      continue
    }

    if (workbookKind === "port-plan") {
      parsePortPlanWorkbook({
        markdown: convertedDocument.markdown,
        sourceRef: convertedDocument.sourceRef,
        state,
      })
    }
  }

  for (const convertedDocument of markdownPreparation.convertedDocuments) {
    const workbookKind = detectWorkbookKind({
      sourceRef: convertedDocument.sourceRef,
      markdown: convertedDocument.markdown,
    })

    if (workbookKind === "cabling") {
      parseCablingWorkbook({
        markdown: convertedDocument.markdown,
        sourceRef: convertedDocument.sourceRef,
        state,
      })
      continue
    }

    if (workbookKind === "rack-layout") {
      parseRackLayoutWorkbook({
        markdown: convertedDocument.markdown,
        sourceRef: convertedDocument.sourceRef,
        state,
      })
      continue
    }

    if (workbookKind === "port-plan") {
      continue
    }

    if (workbookKind === "inventory" || workbookKind === "parameter-response") {
      continue
    }

    state.warnings.push(
      `Skipped converted workbook ${convertedDocument.sourceRef.ref} because no deterministic parser is registered for its markdown shape.`,
    )
  }

  if (state.devices.size > 0 && state.inventoryProfiles.length === 0) {
    state.warnings.push(
      "No project-bound inventory workbook was recognized, so device power could not be resolved from required user input.",
    )
  }

  if (state.devices.size > 0 && state.parameterPowerProfiles.length === 0) {
    state.warnings.push(
      "No device parameter-response workbook was recognized, so device power could not be resolved from required user input.",
    )
  }

  if (state.links.length > 0 && state.portPlanProfiles.length === 0) {
    state.warnings.push(
      "No project-bound port plan workbook was recognized, so endpoint port names remain synthesized placeholders.",
    )
  }

  const structuredInput = buildStructuredInput(state)

  return {
    requirement: parsedInput.requirement,
    draftInput: {
      requirement: parsedInput.requirement,
      structuredInput,
    },
    warnings: uniqueStrings([
      ...markdownPreparation.conversionWarnings,
      ...state.warnings,
    ]),
    summary: {
      parsedSourceCount: markdownPreparation.convertedDocuments.length,
      rackCount: structuredInput.racks.length,
      deviceCount: structuredInput.devices.length,
      linkCount: structuredInput.links.length,
    },
    nextAction: "draft_topology_model" as const,
  }
}

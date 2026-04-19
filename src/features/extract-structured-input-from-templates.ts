import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs"
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
type ConvertedDocumentManifest = {
  convertedDocuments: Array<{
    kind: TemplateSourceRef["kind"]
    ref: string
    note?: string
  }>
}

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
  redundancyIntent?: StructuredInput["devices"][number]["redundancyIntent"]
  rackName?: string
  rackPosition?: number
  rackUnitHeight?: number
  highAvailabilityGroup?: string
  highAvailabilityRole?: StructuredInput["devices"][number]["highAvailabilityRole"]
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
  adjacentRackNames: string[]
  adjacentColumnRackNames: string[]
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

type PortPlanColumnIndexes = {
  boardNumber: number
  boardType: number
  portNumber: number
  connectTo: number
  direction: number
  purpose: number
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
  rackUnitHeight?: number
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

type ScoredProfileMatch<T extends { title: string, matchKey: string }> = {
  profile: T
  score: number
}

const SCOPE_HINT_PATTERNS: Array<{ pattern: RegExp, value: string }> = [
  { pattern: /业务\s*POD/iu, value: normalizeMatchText("业务POD") },
  { pattern: /DMZ\s*POD/iu, value: normalizeMatchText("DMZPOD") },
  { pattern: /管理\s*POD|管理网/iu, value: normalizeMatchText("管理POD") },
  { pattern: /核心区/iu, value: normalizeMatchText("核心区") },
  { pattern: /互联层/iu, value: normalizeMatchText("互联层") },
  { pattern: /出口层|专网出口|公网接入/iu, value: normalizeMatchText("出口层") },
]

const ROLE_HINT_PATTERNS: Array<{ pattern: RegExp, value: string }> = [
  { pattern: /南北向(?:汇聚|互联)交换机/iu, value: normalizeMatchText("南北向汇聚交换机") },
  { pattern: /东西向(?:汇聚|互联)交换机/iu, value: normalizeMatchText("东西向汇聚交换机") },
  { pattern: /管理核心交换机/iu, value: normalizeMatchText("管理核心交换机") },
  { pattern: /管理汇聚交换机/iu, value: normalizeMatchText("管理汇聚交换机") },
  { pattern: /存储汇聚交换机/iu, value: normalizeMatchText("存储汇聚交换机") },
  { pattern: /业务专用设备接入交换机/iu, value: normalizeMatchText("业务专用设备接入交换机") },
  {
    pattern: /SDN核心防火墙|业务\s*POD\s*SDN防火墙|DMZ\s*POD\s*SDN防火墙|SDN防火墙|核心防火墙/iu,
    value: normalizeMatchText("SDN防火墙"),
  },
  { pattern: /互联网接入防火墙|公网(?:出口|接入)防火墙|出口防火墙/iu, value: normalizeMatchText("互联网接入防火墙") },
  { pattern: /管理域防火墙/iu, value: normalizeMatchText("管理域防火墙") },
  { pattern: /公网接入路由器/iu, value: normalizeMatchText("公网接入路由器") },
  { pattern: /IP承载网接入路由器/iu, value: normalizeMatchText("IP承载网接入路由器") },
  { pattern: /专网出口路由器/iu, value: normalizeMatchText("专网出口路由器") },
  { pattern: /SDN负载均衡(?:器)?/iu, value: normalizeMatchText("SDN负载均衡") },
  { pattern: /负载均衡(?:器)?(?:[（(]SSL卸载[）)])?/iu, value: normalizeMatchText("负载均衡") },
  { pattern: /SDN网关/iu, value: normalizeMatchText("SDN网关") },
  { pattern: /SDN核心交换机/iu, value: normalizeMatchText("SDN核心交换机") },
  { pattern: /SDN硬件接入交换机\((?:10|25)GE\)/iu, value: normalizeMatchText("SDN硬件接入交换机") },
  { pattern: /业务\/存储接入交换机\(10GE\)/iu, value: normalizeMatchText("业务存储接入交换机") },
  {
    pattern: /[千干]兆带内\/带外管理TOR/iu,
    value: normalizeMatchText("带内管理TOR"),
  },
  {
    pattern: /千兆带外管理(?:TOR|IPMI)|带外管理(?:TOR|IPMI)|千兆带外管理交换机/iu,
    value: normalizeMatchText("带外管理TOR"),
  },
  {
    pattern: /万兆带内管理TOR|千兆带内管理TOR|带内管理TOR|POD内管理接入交换机|千兆管理TOR/iu,
    value: normalizeMatchText("带内管理TOR"),
  },
  { pattern: /核心交换机/iu, value: normalizeMatchText("核心交换机") },
]

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function mergeStringValues(current: string[], incoming: string[]): string[] {
  return [...new Set([...current, ...incoming])].sort((left, right) => left.localeCompare(right))
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

function discoverParameterResponseSupportSources(args: {
  rootDirectory: string
  documentSources: TemplateSourceRef[]
}): {
  documentSources: TemplateSourceRef[]
  warnings: string[]
} {
  const existingRefs = new Set(args.documentSources.map((sourceRef) => sourceRef.ref))
  const discoveredDocumentSources: TemplateSourceRef[] = []
  let discoveredFromDirectoryCount = 0
  const warnings: string[] = []

  const parameterDirectory = path.join(args.rootDirectory, "test", "设备参数应答表")
  const parameterDirectoryExists = existsSync(parameterDirectory) && statSync(parameterDirectory).isDirectory()
  if (parameterDirectoryExists) {
    for (const entry of readdirSync(parameterDirectory).sort((left, right) => left.localeCompare(right, "zh-Hans-CN"))) {
      if (!/\.(xlsx|xlsm|xls)$/i.test(entry)) {
        continue
      }
      const resolvedPath = path.join(parameterDirectory, entry)
      const sourceRef = {
        kind: "document" as const,
        ref: path.relative(args.rootDirectory, resolvedPath),
        note: path.basename(entry, path.extname(entry)),
      }
      if (existingRefs.has(sourceRef.ref)) {
        continue
      }
      existingRefs.add(sourceRef.ref)
      discoveredDocumentSources.push(sourceRef)
      discoveredFromDirectoryCount += 1
    }

    return {
      documentSources: [...args.documentSources, ...discoveredDocumentSources],
      warnings: uniqueStrings([
        ...(discoveredFromDirectoryCount > 0
          ? [
              `Discovered ${discoveredFromDirectoryCount} parameter-response support workbook(s) under test/设备参数应答表 for deterministic power hydration.`,
            ]
          : []),
      ]),
    }
  }

  const manifestCandidates = [
    path.join(args.rootDirectory, "test", "converted-markdown", "convertedDocuments.json"),
    path.join(args.rootDirectory, "dist", "runtime-assets", "converted-markdown", "convertedDocuments.json"),
  ]

  for (const manifestPath of manifestCandidates) {
    if (!existsSync(manifestPath)) {
      continue
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ConvertedDocumentManifest
    const manifestSupportSources = manifest.convertedDocuments
      .filter((document) => document.ref.includes("test/设备参数应答表/"))
      .map((document) => ({
        kind: document.kind,
        ref: document.ref,
        note: document.note,
      }))
      .filter((sourceRef) => !existingRefs.has(sourceRef.ref))

    if (manifestSupportSources.length === 0) {
      continue
    }

    for (const sourceRef of manifestSupportSources) {
      existingRefs.add(sourceRef.ref)
      discoveredDocumentSources.push(sourceRef)
    }

    warnings.push(
      `Recovered ${manifestSupportSources.length} parameter-response support workbook reference(s) from the deterministic converted-markdown bundle.`,
    )
  }

  if (discoveredDocumentSources.length === 0) {
    return {
      documentSources: args.documentSources,
      warnings: [],
    }
  }

  return {
    documentSources: [...args.documentSources, ...discoveredDocumentSources],
    warnings: uniqueStrings([
      ...warnings,
    ]),
  }
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

function extractProfileInstanceNumber(value: string): number | undefined {
  const normalized = value.normalize("NFKC")
  for (const { pattern } of ROLE_HINT_PATTERNS) {
    const match = normalized.match(pattern)
    if (!match?.[0] || typeof match.index !== "number") {
      continue
    }

    const trailingText = normalized.slice(match.index + match[0].length)
    const instanceMatch = trailingText.match(/^\s*(\d+)\b/u)
    if (instanceMatch?.[1]) {
      return Number.parseInt(instanceMatch[1], 10)
    }
  }

  const normalizedWithoutModelTokens = normalized.replace(/[A-Z][A-Z0-9-]{3,}/gu, " ")
  const looseInstanceMatch = normalizedWithoutModelTokens.match(/\b([1-9])\b/u)
  if (looseInstanceMatch?.[1]) {
    return Number.parseInt(looseInstanceMatch[1], 10)
  }

  return undefined
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

function extractServerFamilyToken(value: string): string | undefined {
  const normalized = value.normalize("NFKC").toUpperCase()
  const match = normalized.match(/([A-Z]\d{1,2}[HK]?)(?=服务器)/u)
  return match?.[1]?.toLowerCase()
}

function hasConflictingExplicitFamilyToken(args: {
  deviceName: string
  profileTitle: string
}): boolean {
  const deviceFamilyToken = extractServerFamilyToken(args.deviceName)
  const profileFamilyToken = extractServerFamilyToken(args.profileTitle)
  return !!deviceFamilyToken && !!profileFamilyToken && deviceFamilyToken !== profileFamilyToken
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

function extractRoleHint(value: string): string | undefined {
  const normalized = value.normalize("NFKC")
  for (const { pattern, value: roleHint } of ROLE_HINT_PATTERNS) {
    const match = normalized.match(pattern)
    if (match?.[0]) {
      return roleHint
    }
  }

  return undefined
}

function extractScopeHint(value: string): string | undefined {
  const normalized = value.normalize("NFKC")
  for (const { pattern, value: scopeHint } of SCOPE_HINT_PATTERNS) {
    if (pattern.test(normalized)) {
      return scopeHint
    }
  }

  return undefined
}

function scoreProfileContextMatch(args: {
  deviceName: string
  profileContext: string
}): number {
  const deviceRoleHint = extractRoleHint(args.deviceName)
  const profileRoleHint = extractRoleHint(args.profileContext)
  const deviceScopeHint = extractScopeHint(args.deviceName)
  const profileScopeHint = extractScopeHint(args.profileContext)
  const deviceInstanceNumber = extractTrailingInstanceNumber(args.deviceName)
  const profileInstanceNumber = extractProfileInstanceNumber(args.profileContext)

  let score = 0

  if (deviceRoleHint && profileRoleHint) {
    if (deviceRoleHint === profileRoleHint) {
      score += 120
    } else {
      score -= 60
    }
  }

  if (deviceScopeHint && profileScopeHint) {
    if (deviceScopeHint === profileScopeHint) {
      score += 70
    } else {
      score -= 35
    }
  }

  if (typeof deviceInstanceNumber === "number" && typeof profileInstanceNumber === "number") {
    if (deviceInstanceNumber === profileInstanceNumber) {
      score += 90
    } else {
      score -= 60
    }
  }

  return score
}

function deriveProfileMatchKey(args: {
  sectionTitle: string
  profileTitle: string
}): string {
  const combined = `${args.sectionTitle} ${args.profileTitle}`
  const roleHint = extractRoleHint(combined)
  if (roleHint) {
    return roleHint
  }

  const explicitPatterns = [
    /[A-Z]\d{1,2}-?[HK]?服务器/iu,
    /千兆带内管理TOR/iu,
    /千兆带外管理TOR/iu,
    /带内管理TOR/iu,
    /带外管理TOR/iu,
    /万兆带内管理TOR/iu,
    /南北向(?:汇聚|互联)交换机/iu,
    /东西向(?:汇聚|互联)交换机/iu,
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
    .map((match) => match.replace(/-\d+$/u, ""))
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

  if (/keepalive|IPL/i.test(context)) {
    return { category: "peer-link", portType: "peer-link", purpose: purpose || "peer-link" }
  }
  if (/核心交换机|汇聚交换机|网关|路由器|防火墙|内部互联/i.test(context)) {
    return { category: "uplink", portType: "uplink", purpose: purpose || "内部互联" }
  }
  if (/IPMI|HDM/i.test(context)) {
    return { category: "oob-mgmt", portType: "oob-mgmt", purpose: purpose || "IPMI网络" }
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
      const rackUnitHeight = parseNumber(row[4])
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
        rackUnitHeight,
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
    .map((profile) => {
      const keyMatches = matchesByProfileKey({
        deviceName: args.deviceName,
        profileKey: profile.matchKey,
      })
      const exactModelMatch = !!profile.modelKey && !!deviceModelKey && profile.modelKey === deviceModelKey
      const partialModelMatch = !exactModelMatch
        && !!profile.modelKey
        && !!deviceModelKey
        && (deviceModelKey.includes(profile.modelKey) || profile.modelKey.includes(deviceModelKey))

      let score = 0
      if (exactModelMatch) {
        score += 220
      } else if (partialModelMatch) {
        score += 120
      }

      if (keyMatches) {
        score += 80
      }

      score += scoreProfileContextMatch({
        deviceName: args.deviceName,
        profileContext: profile.title,
      })

      return {
        profile,
        score,
      }
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      const modelLengthDelta = (right.profile.modelKey?.length ?? 0) - (left.profile.modelKey?.length ?? 0)
      if (modelLengthDelta !== 0) {
        return modelLengthDelta
      }

      return right.profile.matchKey.length - left.profile.matchKey.length
    })
    .map((candidate) => candidate.profile)
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

function warnOnAmbiguousScoredMatches<T extends { title: string, matchKey: string }>(args: {
  state: TemplateAdapterState
  deviceName: string
  matches: Array<ScoredProfileMatch<T>>
  warningPrefix: string
}) {
  const { state, deviceName, matches, warningPrefix } = args
  const strongestMatch = matches[0]
  const secondMatch = matches[1]
  if (!strongestMatch || !secondMatch) {
    return
  }

  if (shouldSuppressEquivalentAliasWarning({
    deviceName,
    strongestProfile: strongestMatch.profile,
    secondProfile: secondMatch.profile,
  })) {
    return
  }

  if (
    secondMatch.score === strongestMatch.score
    && secondMatch.profile.matchKey.length === strongestMatch.profile.matchKey.length
  ) {
    state.warnings.push(
      `${warningPrefix} matched device ${deviceName}; selected '${strongestMatch.profile.title}' using longest-key precedence.`,
    )
  }
}

function findMatchingParameterPowerProfiles(args: {
  state: TemplateAdapterState
  inventoryProfile: InventoryProfile
  deviceName: string
}): Array<ScoredProfileMatch<ParameterPowerProfile>> {
  const deviceModelKey = extractModelKey(args.deviceName)

  return args.state.parameterPowerProfiles
    .map((profile) => {
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
      const contextScore = scoreProfileContextMatch({
        deviceName: args.deviceName,
        profileContext: profile.title,
      })

      if (!modelMatches) {
        return undefined
      }

      let score = 0
      if (inventoryKeyMatches) {
         score += 90
      }
      if (deviceKeyMatches) {
        score += 70
      }
      score += 180
      score += contextScore

      return {
        profile,
        score,
      }
    })
    .filter((candidate): candidate is ScoredProfileMatch<ParameterPowerProfile> => !!candidate)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      const modelLengthDelta = (right.profile.modelKey?.length ?? 0) - (left.profile.modelKey?.length ?? 0)
      if (modelLengthDelta !== 0) {
        return modelLengthDelta
      }

      return right.profile.matchKey.length - left.profile.matchKey.length
    })
}

function findDirectParameterPowerProfiles(args: {
  state: TemplateAdapterState
  deviceName: string
}): Array<ScoredProfileMatch<ParameterPowerProfile>> {
  const deviceModelKey = extractModelKey(args.deviceName)

  const candidates = args.state.parameterPowerProfiles
    .map((profile) => {
      const exactModelMatch = !!profile.modelKey && !!deviceModelKey && profile.modelKey === deviceModelKey
      const partialModelMatch = !!profile.modelKey
        && !!deviceModelKey
        && (deviceModelKey.includes(profile.modelKey) || profile.modelKey.includes(deviceModelKey))
      const keyMatches = matchesByProfileKey({
        deviceName: args.deviceName,
        profileKey: profile.matchKey,
      })
      const hasFamilyConflict = hasConflictingExplicitFamilyToken({
        deviceName: args.deviceName,
        profileTitle: profile.title,
      })

      if (hasFamilyConflict && !keyMatches) {
        return {
          profile,
          score: 0,
        }
      }

      let score = 0
      if (exactModelMatch) {
        score += 260
      } else if (partialModelMatch) {
        score += 140
      }

      if (keyMatches) {
        score += 80
      }

      score += scoreProfileContextMatch({
        deviceName: args.deviceName,
        profileContext: profile.title,
      })

      return {
        profile,
        score,
      }
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      const modelLengthDelta = (right.profile.modelKey?.length ?? 0) - (left.profile.modelKey?.length ?? 0)
      if (modelLengthDelta !== 0) {
        return modelLengthDelta
      }
      return right.profile.matchKey.length - left.profile.matchKey.length
    })

  return candidates
}

function isTorRoleHint(roleHint: string | undefined): boolean {
  return roleHint === normalizeMatchText("带内管理TOR") || roleHint === normalizeMatchText("带外管理TOR")
}

function buildProfileWarningContext(profile: {
  title: string
  sectionTitle?: string
}): string {
  return `${profile.sectionTitle ?? ""} ${profile.title}`.trim()
}

function shouldSuppressEquivalentAliasWarning(args: {
  deviceName: string
  strongestProfile: { title: string, modelKey?: string, sectionTitle?: string, powerWatts?: number, rackUnitHeight?: number }
  secondProfile: { title: string, modelKey?: string, sectionTitle?: string, powerWatts?: number, rackUnitHeight?: number }
}): boolean {
  const strongestRoleHint = extractRoleHint(buildProfileWarningContext(args.strongestProfile))
  const secondRoleHint = extractRoleHint(buildProfileWarningContext(args.secondProfile))

  if (!isTorRoleHint(strongestRoleHint) || strongestRoleHint !== secondRoleHint) {
    return false
  }

  if (!args.strongestProfile.modelKey || args.strongestProfile.modelKey !== args.secondProfile.modelKey) {
    return false
  }

  const strongestPower = args.strongestProfile.powerWatts
  const secondPower = args.secondProfile.powerWatts
  if (typeof strongestPower === "number" || typeof secondPower === "number") {
    return strongestPower === secondPower && args.strongestProfile.rackUnitHeight === args.secondProfile.rackUnitHeight
  }

  return true
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
  const parameterMatches = inventoryProfile
    ? findMatchingParameterPowerProfiles({
        state,
        inventoryProfile,
        deviceName,
      })
    : []
  warnOnAmbiguousScoredMatches({
    state,
    deviceName,
    matches: parameterMatches,
    warningPrefix: "Multiple parameter-response power profiles",
  })
  let parameterProfile = parameterMatches[0]?.profile

  if (!parameterProfile) {
    const directParameterMatches = findDirectParameterPowerProfiles({
      state,
      deviceName,
    })
    warnOnAmbiguousScoredMatches({
      state,
      deviceName,
      matches: directParameterMatches,
      warningPrefix: "Multiple direct parameter-response power profiles",
    })
    parameterProfile = directParameterMatches[0]?.profile
  }

  if (!parameterProfile) {
    if (typeof device.powerWatts === "number") {
      return
    }

    if (inventoryProfile && state.parameterPowerProfiles.length > 0) {
      state.warnings.push(
        `Inventory matched device ${deviceName}, but no parameter-response workbook row provided deterministic power for it.`,
      )
    } else if (state.parameterPowerProfiles.length > 0) {
      state.warnings.push(
        `No parameter-response workbook row matched device ${deviceName} by deterministic model/title rules, so device power remains unresolved and requires user confirmation.`,
      )
    } else if (state.inventoryProfiles.length > 0) {
      state.warnings.push(
        `No inventory workbook row matched device ${deviceName}, so device power remains unresolved until the project provides a matching inventory entry.`,
      )
    }
    return
  }

  if ((device.powerSourcePriority ?? 0) >= 3) {
    return
  }

  state.devices.set(deviceName, {
    ...device,
    rackUnitHeight: parameterProfile.rackUnitHeight ?? device.rackUnitHeight,
    powerWatts: parameterProfile.powerWatts,
    powerSourcePriority: 3,
    sourceRefs: mergeSourceRefs(
      device.sourceRefs,
      inventoryProfile
        ? mergeSourceRefs(inventoryProfile.sourceRefs, parameterProfile.sourceRefs)
        : parameterProfile.sourceRefs,
    ),
  })
}

function pruneResolvedPowerWarnings(state: TemplateAdapterState) {
  const unresolvedPowerPatterns = [
    /^Inventory matched device (.+), but no parameter-response workbook row provided deterministic power for it\.$/,
    /^No parameter-response workbook row matched device (.+) by deterministic model\/title rules, so device power remains unresolved and requires user confirmation\.$/,
    /^No inventory workbook row matched device (.+), so device power remains unresolved until the project provides a matching inventory entry\.$/,
  ]

  state.warnings = state.warnings.filter((warning) => {
    for (const pattern of unresolvedPowerPatterns) {
      const match = warning.match(pattern)
      if (!match?.[1]) {
        continue
      }

      const device = state.devices.get(match[1])
      if (typeof device?.powerWatts === "number") {
        return false
      }
    }

    return true
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

function parseRackCoordinate(rackName: string): { row: string, column: number } | undefined {
  const match = rackName.trim().toUpperCase().match(/^([A-Z]+)(\d+)$/)
  if (!match?.[1] || !match[2]) {
    return undefined
  }

  return {
    row: match[1],
    column: Number.parseInt(match[2], 10),
  }
}

function rackRowToOrdinal(row: string): number {
  return row
    .toUpperCase()
    .split("")
    .reduce((total, character) => total * 26 + (character.charCodeAt(0) - 64), 0)
}

function areRackNamesAdjacent(left: string, right: string): boolean {
  const leftCoordinate = parseRackCoordinate(left)
  const rightCoordinate = parseRackCoordinate(right)
  if (!leftCoordinate || !rightCoordinate) {
    return false
  }

  if (leftCoordinate.row === rightCoordinate.row) {
    return Math.abs(leftCoordinate.column - rightCoordinate.column) === 1
  }

  return leftCoordinate.column === rightCoordinate.column
    && Math.abs(rackRowToOrdinal(leftCoordinate.row) - rackRowToOrdinal(rightCoordinate.row)) === 1
}

function inferPlacementAffinityKey(deviceName: string): string {
  return deviceName.replace(/-(\d+)$/u, "")
}

function inferNumericSuffix(deviceName: string): number | undefined {
  const match = deviceName.match(/-(\d+)$/u)
  return match?.[1] ? Number.parseInt(match[1], 10) : undefined
}

function defaultRackUnitHeightForRole(device: MutableDevice): number {
  if (device.role === "server" || device.role === "storage") {
    if (typeof device.rackUnitHeight === "number" && device.rackUnitHeight > 1) {
      return device.rackUnitHeight
    }
    return 2
  }

  if (typeof device.rackUnitHeight === "number") {
    return device.rackUnitHeight
  }

  return 1
}

function synthesizeRackAdjacency(state: TemplateAdapterState) {
  const rackNames = [...state.racks.keys()]
  for (const rackName of rackNames) {
    const rack = state.racks.get(rackName)
    const coordinate = parseRackCoordinate(rackName)
    if (!rack || !coordinate) {
      continue
    }

    const adjacentRackNames = rackNames.filter((candidate) => {
      if (candidate === rackName) {
        return false
      }
      const candidateCoordinate = parseRackCoordinate(candidate)
      return !!candidateCoordinate
        && candidateCoordinate.row === coordinate.row
        && Math.abs(candidateCoordinate.column - coordinate.column) === 1
    })
    const adjacentColumnRackNames = rackNames.filter((candidate) => {
      if (candidate === rackName) {
        return false
      }
      const candidateCoordinate = parseRackCoordinate(candidate)
      return !!candidateCoordinate
        && candidateCoordinate.column === coordinate.column
        && Math.abs(rackRowToOrdinal(candidateCoordinate.row) - rackRowToOrdinal(coordinate.row)) === 1
    })

    rack.adjacentRackNames = mergeStringValues(rack.adjacentRackNames, adjacentRackNames)
    rack.adjacentColumnRackNames = mergeStringValues(rack.adjacentColumnRackNames, adjacentColumnRackNames)
    state.racks.set(rackName, rack)
  }
}

const heuristicRedundantPlacementRoles = new Set([
  "switch",
  "router",
  "firewall",
  "load-balancer",
  "ips",
  "waf",
])

function isRedundantPairCandidate(groupedDevices: MutableDevice[]): boolean {
  if (groupedDevices.length !== 2) {
    return false
  }

  const [firstDevice, secondDevice] = groupedDevices
  if (!firstDevice || !secondDevice) {
    return false
  }

  if (
    firstDevice.highAvailabilityGroup
    && secondDevice.highAvailabilityGroup
    && firstDevice.highAvailabilityGroup === secondDevice.highAvailabilityGroup
  ) {
    return true
  }

  const hasExplicitRedundancyIntent = groupedDevices.some((device) => device.redundancyIntent && device.redundancyIntent !== "single-homed")
  if (hasExplicitRedundancyIntent) {
    return true
  }

  return firstDevice.role === secondDevice.role && heuristicRedundantPlacementRoles.has(firstDevice.role)
}

function buildRackOccupancy(state: TemplateAdapterState) {
  const occupancyByRack = new Map<string, Array<{ start: number, end: number }>>()
  const powerByRack = new Map<string, number>()

  return { occupancyByRack, powerByRack }
}

function isRangeAvailable(args: {
  ranges: Array<{ start: number, end: number }>
  start: number
  unitHeight: number
  rackHeight: number
}): boolean {
  const end = args.start + args.unitHeight - 1
  if (args.start < 1 || end > args.rackHeight) {
    return false
  }

  return !args.ranges.some((range) => !(end < range.start || args.start > range.end))
}

function findAvailableRackPosition(args: {
  rackHeight: number
  unitHeight: number
  ranges: Array<{ start: number, end: number }>
  role: string
}): number | undefined {
  const preferTopPlacement = args.role !== "server" && args.role !== "storage"
  const start = preferTopPlacement ? args.rackHeight - args.unitHeight + 1 : 1
  const end = preferTopPlacement ? 1 : args.rackHeight - args.unitHeight + 1
  const step = preferTopPlacement ? -1 : 1

  for (let rackPosition = start; preferTopPlacement ? rackPosition >= end : rackPosition <= end; rackPosition += step) {
    if (isRangeAvailable({
      ranges: args.ranges,
      start: rackPosition,
      unitHeight: args.unitHeight,
      rackHeight: args.rackHeight,
    })) {
      return rackPosition
    }
  }

  return undefined
}

function reserveRackPosition(args: {
  occupancyByRack: Map<string, Array<{ start: number, end: number }>>
  rackName: string
  rackPosition: number
  unitHeight: number
}) {
  const ranges = args.occupancyByRack.get(args.rackName) ?? []
  ranges.push({
    start: args.rackPosition,
    end: args.rackPosition + args.unitHeight - 1,
  })
  args.occupancyByRack.set(args.rackName, ranges)
}

function clearPlacement(device: MutableDevice) {
  device.rackName = undefined
  device.rackPosition = undefined
}

function hasEmptyAdjacentRack(args: {
  rack: MutableRack
  occupancyByRack: Map<string, Array<{ start: number, end: number }>>
}): boolean {
  const adjacentRackNames = [...args.rack.adjacentRackNames, ...args.rack.adjacentColumnRackNames]
  return adjacentRackNames.some((rackName) => (args.occupancyByRack.get(rackName)?.length ?? 0) === 0)
}

function chooseRackCandidate(args: {
  state: TemplateAdapterState
  device: MutableDevice
  preferredRackName?: string
  occupancyByRack: Map<string, Array<{ start: number, end: number }>>
  powerByRack: Map<string, number>
}): { rack: MutableRack, rackPosition: number } | undefined {
  const veryHighPower = typeof args.device.powerWatts === "number" && args.device.powerWatts >= 5000
  const safeRackCandidates = [...args.state.racks.values()].filter((rack) => {
    const thresholdWatts = typeof rack.maxPowerKw === "number" ? rack.maxPowerKw * 1000 * 0.8 : Number.POSITIVE_INFINITY
    const projectedPower = (args.powerByRack.get(rack.name) ?? 0) + (args.device.powerWatts ?? 0)
    return projectedPower <= thresholdWatts
  })
  const rackCandidates = safeRackCandidates.length > 0
    ? safeRackCandidates
    : [...args.state.racks.values()]
  const prioritizedRackCandidates = veryHighPower
    ? rackCandidates.filter((rack) => hasEmptyAdjacentRack({ rack, occupancyByRack: args.occupancyByRack }))
    : []
  const candidatePool = prioritizedRackCandidates.length > 0 ? prioritizedRackCandidates : rackCandidates

  const scoredCandidates = candidatePool
    .map((rack) => {
      const rackPosition = findAvailableRackPosition({
        rackHeight: rack.uHeight ?? 48,
        unitHeight: args.device.rackUnitHeight ?? 1,
        ranges: args.occupancyByRack.get(rack.name) ?? [],
        role: args.device.role,
      })

      if (typeof rackPosition !== "number") {
        return undefined
      }

      let score = 0
      if (args.preferredRackName && rack.name === args.preferredRackName) {
        score += 100
      } else if (args.preferredRackName && areRackNamesAdjacent(rack.name, args.preferredRackName)) {
        score += 80
      }

      score += Math.max(0, 20 - (args.powerByRack.get(rack.name) ?? 0) / 500)

      return { rack, rackPosition, score }
    })
    .filter((candidate): candidate is { rack: MutableRack, rackPosition: number, score: number } => !!candidate)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return left.rack.name.localeCompare(right.rack.name)
    })

  return scoredCandidates[0] ? { rack: scoredCandidates[0].rack, rackPosition: scoredCandidates[0].rackPosition } : undefined
}

function chooseAdjacentRackPair(args: {
  state: TemplateAdapterState
  firstDevice: MutableDevice
  secondDevice: MutableDevice
  occupancyByRack: Map<string, Array<{ start: number, end: number }>>
  powerByRack: Map<string, number>
}): { firstRack: MutableRack, secondRack: MutableRack, firstPosition: number, secondPosition: number } | undefined {
  const adjacentRackPairs: Array<[MutableRack, MutableRack]> = []

  const preferredFirstRack = chooseRackCandidate({
    state: args.state,
    device: args.firstDevice,
    preferredRackName: args.firstDevice.rackName,
    occupancyByRack: args.occupancyByRack,
    powerByRack: args.powerByRack,
  })
  const preferredSecondRack = chooseRackCandidate({
    state: args.state,
    device: args.secondDevice,
    preferredRackName: args.secondDevice.rackName,
    occupancyByRack: args.occupancyByRack,
    powerByRack: args.powerByRack,
  })

  if (
    preferredFirstRack
    && preferredSecondRack
    && preferredFirstRack.rack.name !== preferredSecondRack.rack.name
    && areRackNamesAdjacent(preferredFirstRack.rack.name, preferredSecondRack.rack.name)
  ) {
    return {
      firstRack: preferredFirstRack.rack,
      secondRack: preferredSecondRack.rack,
      firstPosition: preferredFirstRack.rackPosition,
      secondPosition: preferredSecondRack.rackPosition,
    }
  }

  for (const firstRack of args.state.racks.values()) {
    const adjacentCandidates = [...firstRack.adjacentRackNames, ...firstRack.adjacentColumnRackNames]
      .map((rackName) => args.state.racks.get(rackName))
      .filter((rack): rack is MutableRack => !!rack)
      .filter((rack) => rack.name !== firstRack.name)

    for (const secondRack of adjacentCandidates) {
      adjacentRackPairs.push([firstRack, secondRack])
    }
  }

  const candidatePairs = adjacentRackPairs.map(([firstRack, secondRack]) => {
      const firstPosition = findAvailableRackPosition({
        rackHeight: firstRack.uHeight ?? 48,
        unitHeight: args.firstDevice.rackUnitHeight ?? 1,
        ranges: args.occupancyByRack.get(firstRack.name) ?? [],
        role: args.firstDevice.role,
      })
      const secondPosition = findAvailableRackPosition({
        rackHeight: secondRack.uHeight ?? 48,
        unitHeight: args.secondDevice.rackUnitHeight ?? 1,
        ranges: args.occupancyByRack.get(secondRack.name) ?? [],
        role: args.secondDevice.role,
      })

      if (typeof firstPosition !== "number" || typeof secondPosition !== "number") {
        return undefined
      }

      let score = 0
      if (args.firstDevice.rackName && firstRack.name === args.firstDevice.rackName) {
        score += 100
      }
      if (args.secondDevice.rackName && secondRack.name === args.secondDevice.rackName) {
        score += 100
      }
      if (args.firstDevice.rackName && areRackNamesAdjacent(firstRack.name, args.firstDevice.rackName)) {
        score += 40
      }
      if (args.secondDevice.rackName && areRackNamesAdjacent(secondRack.name, args.secondDevice.rackName)) {
        score += 40
      }

      const firstThresholdWatts = typeof firstRack.maxPowerKw === "number" ? firstRack.maxPowerKw * 1000 * 0.8 : Number.POSITIVE_INFINITY
      const firstProjectedPower = (args.powerByRack.get(firstRack.name) ?? 0) + (args.firstDevice.powerWatts ?? 0)
      const secondThresholdWatts = typeof secondRack.maxPowerKw === "number" ? secondRack.maxPowerKw * 1000 * 0.8 : Number.POSITIVE_INFINITY
      const secondProjectedPower = (args.powerByRack.get(secondRack.name) ?? 0) + (args.secondDevice.powerWatts ?? 0)
      const safe = firstProjectedPower <= firstThresholdWatts && secondProjectedPower <= secondThresholdWatts

      return {
        firstRack,
        secondRack,
        firstPosition,
        secondPosition,
        safe,
        score,
      }
    })
    .filter((candidate): candidate is {
      firstRack: MutableRack
      secondRack: MutableRack
      firstPosition: number
      secondPosition: number
      safe: boolean
      score: number
    } => !!candidate)

  const safeCandidatePairs = candidatePairs.filter((candidate) => candidate.safe)
  const candidatePool = safeCandidatePairs.length > 0 ? safeCandidatePairs : candidatePairs
  candidatePool.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }
    const leftKey = `${left.firstRack.name}:${left.secondRack.name}`
    const rightKey = `${right.firstRack.name}:${right.secondRack.name}`
    return leftKey.localeCompare(rightKey)
  })

  const selectedPair = candidatePool[0]
  return selectedPair
    ? {
        firstRack: selectedPair.firstRack,
        secondRack: selectedPair.secondRack,
        firstPosition: selectedPair.firstPosition,
        secondPosition: selectedPair.secondPosition,
      }
    : undefined
}

function synthesizeGeneratedPlacements(state: TemplateAdapterState) {
  synthesizeRackAdjacency(state)

  for (const device of state.devices.values()) {
    device.rackUnitHeight = defaultRackUnitHeightForRole(device)
    state.devices.set(device.name, device)
  }

  const { occupancyByRack, powerByRack } = buildRackOccupancy(state)
  const devicesByAffinityKey = new Map<string, MutableDevice[]>()
  for (const device of state.devices.values()) {
    const affinityKey = inferPlacementAffinityKey(device.name)
    const groupedDevices = devicesByAffinityKey.get(affinityKey) ?? []
    groupedDevices.push(device)
    devicesByAffinityKey.set(affinityKey, groupedDevices)
  }

  const groupedDeviceEntries = [...devicesByAffinityKey.entries()].sort((left, right) => {
    const leftPower = Math.max(...left[1].map((device) => device.powerWatts ?? 0))
    const rightPower = Math.max(...right[1].map((device) => device.powerWatts ?? 0))
    if (rightPower !== leftPower) {
      return rightPower - leftPower
    }
    return left[0].localeCompare(right[0])
  })

  for (const [, groupedDevices] of groupedDeviceEntries) {
    const pairDevices = isRedundantPairCandidate(groupedDevices)
      ? groupedDevices.slice().sort((left, right) => left.name.localeCompare(right.name))
      : undefined
    if (pairDevices) {
      const selectedRackPair = chooseAdjacentRackPair({
        state,
        firstDevice: pairDevices[0]!,
        secondDevice: pairDevices[1]!,
        occupancyByRack,
        powerByRack,
      })

      if (selectedRackPair) {
        pairDevices[0]!.rackName = selectedRackPair.firstRack.name
        pairDevices[0]!.rackPosition = selectedRackPair.firstPosition
        reserveRackPosition({ occupancyByRack, rackName: selectedRackPair.firstRack.name, rackPosition: selectedRackPair.firstPosition, unitHeight: pairDevices[0]!.rackUnitHeight ?? 1 })
        powerByRack.set(selectedRackPair.firstRack.name, (powerByRack.get(selectedRackPair.firstRack.name) ?? 0) + (pairDevices[0]!.powerWatts ?? 0))
        state.devices.set(pairDevices[0]!.name, pairDevices[0]!)

        pairDevices[1]!.rackName = selectedRackPair.secondRack.name
        pairDevices[1]!.rackPosition = selectedRackPair.secondPosition
        reserveRackPosition({ occupancyByRack, rackName: selectedRackPair.secondRack.name, rackPosition: selectedRackPair.secondPosition, unitHeight: pairDevices[1]!.rackUnitHeight ?? 1 })
        powerByRack.set(selectedRackPair.secondRack.name, (powerByRack.get(selectedRackPair.secondRack.name) ?? 0) + (pairDevices[1]!.powerWatts ?? 0))
        state.devices.set(pairDevices[1]!.name, pairDevices[1]!)
        continue
      }

      state.warnings.push(
        `No adjacent rack or adjacent-column candidate satisfied deterministic placement constraints for redundant pair ${pairDevices[0]?.name} / ${pairDevices[1]?.name}; rack positions remain unresolved and require user confirmation.`,
      )
      pairDevices.forEach((device) => {
        clearPlacement(device)
        state.devices.set(device.name, device)
      })
      continue
    }

    for (const device of groupedDevices.slice().sort((left, right) => {
      const powerDelta = (right.powerWatts ?? 0) - (left.powerWatts ?? 0)
      if (powerDelta !== 0) {
        return powerDelta
      }
      return left.name.localeCompare(right.name)
    })) {

      const rackCandidate = chooseRackCandidate({
        state,
        device,
        preferredRackName: device.rackName,
        occupancyByRack,
        powerByRack,
      })
      if (!rackCandidate) {
        state.warnings.push(
          `No rack candidate satisfied deterministic placement constraints for ${device.name}; rack position remains unresolved and requires user confirmation.`,
        )
        clearPlacement(device)
        state.devices.set(device.name, device)
        continue
      }

      device.rackName = rackCandidate.rack.name
      device.rackPosition = rackCandidate.rackPosition
      state.devices.set(device.name, device)
      reserveRackPosition({ occupancyByRack, rackName: rackCandidate.rack.name, rackPosition: rackCandidate.rackPosition, unitHeight: device.rackUnitHeight ?? 1 })
      powerByRack.set(rackCandidate.rack.name, (powerByRack.get(rackCandidate.rack.name) ?? 0) + (device.powerWatts ?? 0))
    }
  }
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
    adjacentRackNames: mergeStringValues(existing?.adjacentRackNames ?? [], patch.adjacentRackNames ?? []),
    adjacentColumnRackNames: mergeStringValues(existing?.adjacentColumnRackNames ?? [], patch.adjacentColumnRackNames ?? []),
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
    redundancyIntent: patch.redundancyIntent ?? existing?.redundancyIntent,
    rackName: patch.rackName ?? existing?.rackName,
    rackPosition: patch.rackPosition ?? existing?.rackPosition,
    rackUnitHeight: patch.rackUnitHeight ?? existing?.rackUnitHeight,
    highAvailabilityGroup: patch.highAvailabilityGroup ?? existing?.highAvailabilityGroup,
    highAvailabilityRole: patch.highAvailabilityRole ?? existing?.highAvailabilityRole,
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
    let currentColumnIndexes: PortPlanColumnIndexes | undefined

    for (const row of rows) {
      if (looksLikeProfileTitleRow(row)) {
        currentProfileTitle = row.find((cell) => cell.length > 0) ?? section.title
        insideTable = false
        currentBoardNumber = ""
        currentBoardType = ""
        currentColumnIndexes = undefined
        continue
      }

      if (looksLikeTableHeaderRow(row)) {
        currentColumnIndexes = findPortPlanColumnIndexes(row)
        insideTable = !!currentColumnIndexes
        currentBoardNumber = ""
        currentBoardType = ""
        continue
      }

      if (!insideTable || !currentColumnIndexes) {
        continue
      }

      const portIndexes = parsePortNumberSpec(row[currentColumnIndexes.portNumber])
      if (portIndexes.length === 0) {
        continue
      }

      currentBoardNumber = cleanCell(row[currentColumnIndexes.boardNumber]) || currentBoardNumber
      currentBoardType = cleanCell(row[currentColumnIndexes.boardType]) || currentBoardType
      if (!currentBoardNumber) {
        continue
      }

      const classification = classifyPortPlanAssignment({
        sectionTitle: section.title,
        profileTitle: currentProfileTitle,
        boardType: currentBoardType,
        connectTo: row[currentColumnIndexes.connectTo],
        direction: row[currentColumnIndexes.direction],
        purpose: row[currentColumnIndexes.purpose],
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

function findPortPlanColumnIndexes(row: string[]): PortPlanColumnIndexes | undefined {
  const boardNumber = row.findIndex((cell) => cell.includes("板卡编号"))
  const boardType = row.findIndex((cell) => cell.includes("板卡类型"))
  const portNumber = row.findIndex((cell) => cell.includes("端口编号"))
  const connectTo = row.findIndex((cell) => cell.includes("接至"))
  const direction = row.findIndex((cell) => cell.includes("电路开通方向"))
  const purpose = row.findIndex((cell) => cell.includes("主要用途"))

  if (
    boardNumber < 0
    || boardType < 0
    || portNumber < 0
    || connectTo < 0
    || direction < 0
    || purpose < 0
  ) {
    return undefined
  }

  return {
    boardNumber,
    boardType,
    portNumber,
    connectTo,
    direction,
    purpose,
  }
}

function findMatchingPortPlanProfiles(args: {
  state: TemplateAdapterState
  deviceName: string
}): Array<{ profile: PortPlanProfile, score: number }> {
  const normalizedDeviceName = normalizeMatchText(args.deviceName)
  const relaxedDeviceName = relaxPortFamilyKey(normalizedDeviceName)
  const deviceParity = inferDeviceParity(args.deviceName)
  const deviceModelKey = extractModelKey(args.deviceName)

  const candidates = args.state.portPlanProfiles
    .map((profile: PortPlanProfile) => {
      const profileContext = `${profile.sectionTitle} ${profile.title}`
      const profileMatchesDevice = !!profile.matchKey && (
        normalizedDeviceName.includes(profile.matchKey)
        || profile.matchKey.includes(normalizedDeviceName)
      )
      const relaxedProfileKey = relaxPortFamilyKey(profile.matchKey)
      const relaxedMatchesDevice = !profileMatchesDevice && !!relaxedProfileKey && (
        relaxedDeviceName.includes(relaxedProfileKey)
        || relaxedProfileKey.includes(relaxedDeviceName)
      )
      const exactModelMatch = !!profile.modelKey && !!deviceModelKey && profile.modelKey === deviceModelKey
      const partialModelMatch = !exactModelMatch
        && !!profile.modelKey
        && !!deviceModelKey
        && (deviceModelKey.includes(profile.modelKey) || profile.modelKey.includes(deviceModelKey))

      if (!profileMatchesDevice && !relaxedMatchesDevice && !exactModelMatch && !partialModelMatch) {
        return undefined
      }

      if (profile.parity && deviceParity && profile.parity !== deviceParity) {
        return undefined
      }

      let score = 0
      if (profileMatchesDevice) {
        score += 120
      } else if (relaxedMatchesDevice) {
        score += 60
      }

      if (exactModelMatch) {
        score += 220
      } else if (partialModelMatch) {
        score += 110
      }

      if (profile.parity && deviceParity && profile.parity === deviceParity) {
        score += 20
      }

      score += scoreProfileContextMatch({
        deviceName: args.deviceName,
        profileContext,
      })

      return {
        profile,
        score,
      }
    })
    .filter((candidate): candidate is { profile: PortPlanProfile, score: number } => !!candidate)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      const modelLengthDelta = (right.profile.modelKey?.length ?? 0) - (left.profile.modelKey?.length ?? 0)
      if (modelLengthDelta !== 0) {
        return modelLengthDelta
      }

      return right.profile.matchKey.length - left.profile.matchKey.length
    })

  return candidates
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

  const selectedMatch = matches[0]
  const selectedProfile = selectedMatch.profile
  if (
    matches.length > 1
    && matches[1]
    && !shouldSuppressEquivalentAliasWarning({
      deviceName,
      strongestProfile: selectedProfile,
      secondProfile: matches[1].profile,
    })
    && matches[1].score === selectedMatch.score
    && matches[1].profile.matchKey.length === selectedProfile.matchKey.length
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
        adjacentRackIds: rack.adjacentRackNames,
        adjacentColumnRackIds: rack.adjacentColumnRackNames,
        sourceRefs: rack.sourceRefs,
        statusConfidence: rack.statusConfidence,
      }
    })

  const devices = [...state.devices.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((device) => ({
      name: device.name,
      role: device.role,
      redundancyIntent: device.redundancyIntent,
      rackName: device.rackName,
      rackPosition: device.rackPosition,
      rackUnitHeight: device.rackUnitHeight,
      highAvailabilityGroup: device.highAvailabilityGroup,
      highAvailabilityRole: device.highAvailabilityRole,
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
  runtime?: WorkerRuntimeContext
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
  const supportSourceDiscovery = discoverParameterResponseSupportSources({
    rootDirectory: args.rootDirectory,
    documentSources: normalizedDocumentSources,
  })
  const requestedDocumentSourceKeys = new Set(
    normalizedDocumentSources.map((sourceRef) => `${sourceRef.kind}:${sourceRef.ref}`),
  )

  const markdownPreparation = await prepareDocumentSourcesAsMarkdown({
    documentSources: supportSourceDiscovery.documentSources,
    runtime: args.runtime,
    worktree: args.rootDirectory,
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

  if (state.devices.size > 0 && state.inventoryProfiles.length === 0 && state.parameterPowerProfiles.length === 0) {
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

  pruneResolvedPowerWarnings(state)
  synthesizeGeneratedPlacements(state)

  const structuredInput = buildStructuredInput(state)

  return {
    requirement: parsedInput.requirement,
    draftInput: {
      requirement: parsedInput.requirement,
      structuredInput,
    },
    warnings: uniqueStrings([
      ...supportSourceDiscovery.warnings,
      ...markdownPreparation.conversionWarnings,
      ...state.warnings,
    ]),
    summary: {
      parsedSourceCount: markdownPreparation.convertedDocuments.filter((document) => requestedDocumentSourceKeys.has(`${document.sourceRef.kind}:${document.sourceRef.ref}`)).length,
      rackCount: structuredInput.racks.length,
      deviceCount: structuredInput.devices.length,
      linkCount: structuredInput.links.length,
    },
    nextAction: "draft_topology_model" as const,
  }
}

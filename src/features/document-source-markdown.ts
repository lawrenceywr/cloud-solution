import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import type { SourceReference } from "../domain"
import type { WorkerRuntimeContext } from "../coordinator/types"
import {
  runDocumentSourceMarkdownInChildSession,
  type ConvertedDocumentSource,
} from "../agents/document-source-markdown"

type DocumentSource = SourceReference & {
  kind: "document" | "diagram" | "image"
}

type ConvertedDocumentManifest = {
  convertedDocuments: Array<{
    kind: DocumentSource["kind"]
    ref: string
    note?: string
    markdownRef?: string
    markdownFile?: string
    markdownFileRef?: string
  }>
}

function isParameterResponseSupportRef(ref: string): boolean {
  return ref.includes("test/设备参数应答表/") && isSpreadsheetSource(ref)
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function isSpreadsheetSource(ref: string): boolean {
  return /\.(xlsx|xlsm|xls)$/i.test(ref)
}

function hasWorkbookSheetBoundaries(markdown: string): boolean {
  return /^##\s+\S+/m.test(markdown)
}

function resolveMarkdownPathFromManifest(args: {
  manifestPath: string
  markdownRef: string
  worktree: string
}): string | undefined {
  const workspacePath = path.isAbsolute(args.markdownRef)
    ? args.markdownRef
    : path.resolve(args.worktree, args.markdownRef)
  if (existsSync(workspacePath)) {
    return workspacePath
  }

  const manifestSiblingPath = path.join(path.dirname(args.manifestPath), path.basename(args.markdownRef))
  if (existsSync(manifestSiblingPath)) {
    return manifestSiblingPath
  }

  return undefined
}

function loadConvertedMarkdownBundleFromManifest(args: {
  documentSources: DocumentSource[]
  manifestPath: string
  worktree: string
}): {
  convertedDocuments: ConvertedDocumentSource[]
  conversionWarnings: string[]
} | undefined {
  if (!existsSync(args.manifestPath)) {
    return undefined
  }

  const manifest = JSON.parse(readFileSync(args.manifestPath, "utf8")) as ConvertedDocumentManifest
  const manifestByPrimaryKey = new Map<string, ConvertedDocumentManifest["convertedDocuments"][number]>()
  const manifestByExactKey = new Map<string, ConvertedDocumentManifest["convertedDocuments"][number]>()
  for (const entry of manifest.convertedDocuments) {
    manifestByPrimaryKey.set(`${entry.kind}:${entry.ref}`, entry)
    manifestByExactKey.set(`${entry.kind}:${entry.ref}:${entry.note ?? ""}`, entry)
  }

  const convertedDocuments: ConvertedDocumentSource[] = []
  const conversionWarnings: string[] = []
  const loadedSourceKeys = new Set<string>()

  function loadManifestEntry(entryArgs: {
    sourceRef: DocumentSource
    manifestEntry: ConvertedDocumentManifest["convertedDocuments"][number]
  }) {
    const markdownRef = entryArgs.manifestEntry.markdownRef ?? entryArgs.manifestEntry.markdownFile ?? entryArgs.manifestEntry.markdownFileRef
    if (!markdownRef) {
      conversionWarnings.push(
        `Recovered converted-markdown manifest entry for ${entryArgs.sourceRef.ref}, but it did not include a readable markdown file reference.`,
      )
      return
    }

    const markdownPath = resolveMarkdownPathFromManifest({
      manifestPath: args.manifestPath,
      markdownRef,
      worktree: args.worktree,
    })
    if (!markdownPath) {
      conversionWarnings.push(
        `Recovered converted-markdown manifest entry for ${entryArgs.sourceRef.ref}, but ${markdownRef} was missing from the current workspace and packaged runtime assets.`,
      )
      return
    }

    convertedDocuments.push({
      sourceRef: entryArgs.sourceRef,
      markdown: readFileSync(markdownPath, "utf8"),
    })
    loadedSourceKeys.add(`${entryArgs.sourceRef.kind}:${entryArgs.sourceRef.ref}`)
  }

  for (const sourceRef of args.documentSources) {
    const manifestEntry = manifestByExactKey.get(`${sourceRef.kind}:${sourceRef.ref}:${sourceRef.note ?? ""}`)
      ?? manifestByPrimaryKey.get(`${sourceRef.kind}:${sourceRef.ref}`)
    if (!manifestEntry) {
      continue
    }
    loadManifestEntry({
      sourceRef,
      manifestEntry,
    })
  }

  const supplementalSupportEntries = manifest.convertedDocuments.filter((entry) => {
    const parameterSupportDirectory = path.join(args.worktree, "test", "设备参数应答表")
    if (existsSync(parameterSupportDirectory)) {
      return false
    }
    if (!isParameterResponseSupportRef(entry.ref)) {
      return false
    }
    return !loadedSourceKeys.has(`${entry.kind}:${entry.ref}`)
  })
  for (const manifestEntry of supplementalSupportEntries) {
    loadManifestEntry({
      sourceRef: {
        kind: manifestEntry.kind,
        ref: manifestEntry.ref,
        note: manifestEntry.note,
      },
      manifestEntry,
    })
  }
  if (supplementalSupportEntries.length > 0) {
    conversionWarnings.push(
      `Recovered ${supplementalSupportEntries.length} parameter-response support workbook reference(s) from the deterministic converted-markdown bundle.`,
    )
  }

  if (convertedDocuments.length === 0 && conversionWarnings.length === 0) {
    return undefined
  }

  return {
    convertedDocuments,
    conversionWarnings,
  }
}

function loadConvertedMarkdownBundle(args: {
  documentSources: DocumentSource[]
  worktree: string
}): {
  convertedDocuments: ConvertedDocumentSource[]
  conversionWarnings: string[]
} | undefined {
  const manifestCandidates = [
    path.join(args.worktree, "test", "converted-markdown", "convertedDocuments.json"),
    path.join(args.worktree, "dist", "runtime-assets", "converted-markdown", "convertedDocuments.json"),
  ]

  for (const manifestPath of manifestCandidates) {
    const bundle = loadConvertedMarkdownBundleFromManifest({
      documentSources: args.documentSources,
      manifestPath,
      worktree: args.worktree,
    })
    if (bundle) {
      return bundle
    }
  }

  return undefined
}

function bundleCoversAllDocumentSources(args: {
  documentSources: DocumentSource[]
  bundle: {
    convertedDocuments: ConvertedDocumentSource[]
    conversionWarnings: string[]
  }
}): boolean {
  const recoveredKeys = new Set(
    args.bundle.convertedDocuments.map((document) => `${document.sourceRef.kind}:${document.sourceRef.ref}`),
  )

  return args.documentSources.every((sourceRef) => recoveredKeys.has(`${sourceRef.kind}:${sourceRef.ref}`))
}

export async function prepareDocumentSourcesAsMarkdown(args: {
  documentSources: DocumentSource[]
  runtime?: WorkerRuntimeContext
  worktree: string
}): Promise<{
  convertedDocuments: ConvertedDocumentSource[]
  conversionWarnings: string[]
}> {
  const preloadedBundle = loadConvertedMarkdownBundle({
    documentSources: args.documentSources,
    worktree: args.worktree,
  })
  if (preloadedBundle && bundleCoversAllDocumentSources({
    documentSources: args.documentSources,
    bundle: preloadedBundle,
  })) {
    return {
        convertedDocuments: preloadedBundle.convertedDocuments,
        conversionWarnings: uniqueStrings([
          ...preloadedBundle.conversionWarnings,
          "Used the deterministic converted-markdown bundle for workbook preprocessing.",
        ]),
      }
  }

  if (!args.runtime) {
    return {
      convertedDocuments: [],
      conversionWarnings: [
        "No runtime client was available for document-source-markdown preprocessing, and no complete deterministic converted-markdown bundle covered the requested sources.",
      ],
    }
  }

  const result = await runDocumentSourceMarkdownInChildSession({
    documentSources: args.documentSources,
    runtime: args.runtime,
  })

  if (!result.success) {
    const recoveredBundle = loadConvertedMarkdownBundle({
      documentSources: args.documentSources,
      worktree: args.worktree,
    })
    if (recoveredBundle) {
      return {
        convertedDocuments: recoveredBundle.convertedDocuments,
        conversionWarnings: uniqueStrings([
          ...(result.result.errors ?? []),
          ...recoveredBundle.conversionWarnings,
          "Recovered converted workbook markdown from the deterministic converted-markdown bundle after child-session preprocessing failed.",
        ]),
      }
    }

    return {
      convertedDocuments: [],
      conversionWarnings: uniqueStrings(
        result.result.errors ?? [
          "MarkItDown preprocessing failed; extraction will continue with original document sources only.",
        ],
      ),
    }
  }

  const allowedSourceKeys = new Set(
    args.documentSources.map((sourceRef) => `${sourceRef.kind}:${sourceRef.ref}:${sourceRef.note ?? ""}`),
  )
  const convertedDocuments = result.result.output.convertedDocuments.filter((document) => {
    const key = `${document.sourceRef.kind}:${document.sourceRef.ref}:${document.sourceRef.note ?? ""}`
    return allowedSourceKeys.has(key)
  })
  const droppedDocumentCount = result.result.output.convertedDocuments.length - convertedDocuments.length
  const workbookBoundaryWarnings: string[] = []
  const validatedDocuments = convertedDocuments.filter((document) => {
    if (!isSpreadsheetSource(document.sourceRef.ref) || hasWorkbookSheetBoundaries(document.markdown)) {
      return true
    }

    workbookBoundaryWarnings.push(
      `Dropped converted workbook markdown for ${document.sourceRef.ref} because no sheet boundaries like '## SheetName' were preserved.`,
    )
    return false
  })

  return {
    convertedDocuments: validatedDocuments,
    conversionWarnings: uniqueStrings([
      ...result.result.output.conversionWarnings,
      ...workbookBoundaryWarnings,
      ...(droppedDocumentCount > 0
        ? [
            `Dropped ${droppedDocumentCount} converted markdown result(s) whose sourceRef did not match the supplied documentSources.`,
          ]
        : []),
    ]),
  }
}

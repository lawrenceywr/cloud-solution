import type { ToolsRecord } from "../plugin/types"

export function filterDisabledTools(
  tools: ToolsRecord,
  disabledTools: readonly string[] = [],
): ToolsRecord {
  const disabled = new Set(disabledTools.map((name) => name.toLowerCase()))

  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => !disabled.has(name.toLowerCase())),
  )
}

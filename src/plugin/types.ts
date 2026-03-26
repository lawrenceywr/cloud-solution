import type { Plugin, ToolDefinition } from "@opencode-ai/plugin"

type PluginInstance = Awaited<ReturnType<Plugin>>

export type PluginContext = Parameters<Plugin>[0]

export type RuntimeContext = {
  directory: string
}

export type MinimalPluginInterface = Pick<
  PluginInstance,
  "tool" | "tool.execute.before"
>

export type ToolExecuteBeforeHandler = NonNullable<
  PluginInstance["tool.execute.before"]
>

export type ToolExecuteBeforeInput = Parameters<ToolExecuteBeforeHandler>[0]
export type ToolExecuteBeforeOutput = Parameters<ToolExecuteBeforeHandler>[1]

export type ToolsRecord = Record<string, ToolDefinition>

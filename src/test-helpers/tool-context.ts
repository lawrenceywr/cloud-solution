import type { ToolContext } from "@opencode-ai/plugin/tool"

export function createTestToolContext(args?: {
  sessionID?: string
  directory?: string
}): ToolContext {
  const sessionID = args?.sessionID ?? "test-session"
  const directory = args?.directory ?? process.cwd()

  return {
    sessionID,
    messageID: "cloud-solution-test-message",
    agent: "cloud-solution-test",
    directory,
    worktree: directory,
    abort: new AbortController().signal,
    metadata(): void {},
    async ask(): Promise<void> {},
  }
}

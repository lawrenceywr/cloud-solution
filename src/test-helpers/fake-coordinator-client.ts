import type { WorkerRuntimeContext } from "../coordinator/types"
import type { CoordinatorClient } from "../plugin/types"

type FakeCoordinatorClientOptions = {
  promptTexts?: string[]
  createError?: Error
  promptError?: Error
}

export function createFakeCoordinatorClient(
  options: FakeCoordinatorClientOptions = {},
): {
  client: CoordinatorClient
  createCalls: unknown[]
  promptCalls: unknown[]
  abortCalls: unknown[]
} {
  const createCalls: unknown[] = []
  const promptCalls: unknown[] = []
  const abortCalls: unknown[] = []
  let promptIndex = 0

  const create = ((input) => {
    createCalls.push(input)

    if (options.createError) {
      throw options.createError
    }

    const callNumber = createCalls.length
    const directory = input?.query?.directory ?? process.cwd()
    const session = {
      id: `child-session-${callNumber}`,
      projectID: "project-test",
      directory,
      parentID: input?.body?.parentID,
      title: input?.body?.title ?? `Child Session ${callNumber}`,
      version: "1",
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
    }

    return Promise.resolve({
      data: session,
      request: new Request("http://localhost/session"),
      response: new Response(),
    })
  }) as CoordinatorClient["session"]["create"]

  const prompt = ((input) => {
    promptCalls.push(input)

    if (options.promptError) {
      throw options.promptError
    }

    promptIndex += 1
    const text =
      options.promptTexts?.[promptIndex - 1] ??
      options.promptTexts?.at(-1) ??
      JSON.stringify({
        workerId: "test-worker",
        status: "success",
        output: {},
        recommendations: [],
      })

    const directory = input.query?.directory ?? process.cwd()
    const message = {
      info: {
        id: `assistant-message-${promptIndex}`,
        sessionID: input.path.id,
        role: "assistant",
        time: {
          created: Date.now(),
          completed: Date.now(),
        },
        parentID: input.body?.messageID ?? `user-message-${promptIndex}`,
        modelID: "test-model",
        providerID: "test-provider",
        mode: input.body?.agent ?? "test-agent",
        path: {
          cwd: directory,
          root: directory,
        },
        cost: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: {
            read: 0,
            write: 0,
          },
        },
      },
      parts: [
        {
          id: `text-part-${promptIndex}`,
          sessionID: input.path.id,
          messageID: `assistant-message-${promptIndex}`,
          type: "text",
          text,
        },
      ],
    }

    return Promise.resolve({
      data: message,
      request: new Request("http://localhost/session/message"),
      response: new Response(),
    })
  }) as CoordinatorClient["session"]["prompt"]

  const abort = ((input) => {
    abortCalls.push(input)
    return Promise.resolve({
      data: true,
      request: new Request("http://localhost/session/abort"),
      response: new Response(),
    })
  }) as CoordinatorClient["session"]["abort"]

  const client: CoordinatorClient = {
    session: {
      create,
      prompt,
      abort,
    },
  }

  return {
    client,
    createCalls,
    promptCalls,
    abortCalls,
  }
}

export function createWorkerRuntimeContext(
  client: CoordinatorClient,
  overrides?: Partial<WorkerRuntimeContext>,
): WorkerRuntimeContext {
  return {
    client,
    parentSessionID: overrides?.parentSessionID ?? "parent-session",
    agent: overrides?.agent ?? "general",
    directory: overrides?.directory ?? process.cwd(),
    worktree: overrides?.worktree ?? process.cwd(),
    abort: overrides?.abort ?? new AbortController().signal,
  }
}

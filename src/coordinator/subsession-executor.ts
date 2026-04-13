import { WorkerResultSchema } from "./types"
import type { WorkerResult, WorkerRuntimeContext } from "./types"

type DataEnvelope<T> = {
  data: T
}

type ExecuteWorkerSubsessionArgs = {
  workerId: string
  workerName: string
  systemPrompt: string
  userPrompt: string
  tools?: Record<string, boolean>
  runtime: WorkerRuntimeContext
}

function hasDataEnvelope<T>(value: T | DataEnvelope<T>): value is DataEnvelope<T> {
  return typeof value === "object" && value !== null && "data" in value
}

function unwrapResponse<T>(value: T | DataEnvelope<T>): T {
  return hasDataEnvelope(value) ? value.data : value
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

function buildFailureResult(args: {
  workerId: string
  error: string
}): WorkerResult {
  return {
    workerId: args.workerId,
    status: "failed",
    output: {},
    recommendations: [],
    errors: [args.error],
  }
}

export async function executeWorkerSubsession(
  args: ExecuteWorkerSubsessionArgs,
): Promise<WorkerResult> {
  if (args.runtime.abort.aborted) {
    return buildFailureResult({
      workerId: args.workerId,
      error: `Worker ${args.workerId} aborted before child session creation`,
    })
  }

  try {
    const createResponse = await args.runtime.client.session.create({
      query: {
        directory: args.runtime.worktree,
      },
      body: {
        parentID: args.runtime.parentSessionID,
        title: args.workerName,
      },
    })

    const childSession = unwrapResponse(createResponse)
    if (!childSession) {
      return buildFailureResult({
        workerId: args.workerId,
        error: `Worker ${args.workerId} failed to create a child session`,
      })
    }

    const abortChildSession = async () => {
      try {
        await args.runtime.client.session.abort({
          path: {
            id: childSession.id,
          },
          query: {
            directory: args.runtime.worktree,
          },
        })
      } catch {
        return
      }
    }

    const handleAbort = () => {
      void abortChildSession()
    }

    args.runtime.abort.addEventListener("abort", handleAbort, { once: true })

    try {
      const promptResponse = await args.runtime.client.session.prompt({
        path: {
          id: childSession.id,
        },
        query: {
          directory: args.runtime.worktree,
        },
        body: {
          agent: args.runtime.agent,
          system: args.systemPrompt,
          tools: args.tools ?? {},
          parts: [
            {
              type: "text",
              text: args.userPrompt,
            },
          ],
        },
      })

      const promptResult = unwrapResponse(promptResponse)
      if (!promptResult) {
        return buildFailureResult({
          workerId: args.workerId,
          error: `Worker ${args.workerId} failed to receive a child session response`,
        })
      }

      const assistantText = promptResult.parts.reduce((text, part) => {
        if (part.type === "text" && "text" in part) {
          return text + part.text
        }
        return text
      }, "")

      if (!assistantText.trim()) {
        return buildFailureResult({
          workerId: args.workerId,
          error: `Worker ${args.workerId} returned no text output`,
        })
      }

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(stripJsonFence(assistantText))
      } catch {
        return buildFailureResult({
          workerId: args.workerId,
          error: `Worker ${args.workerId} returned invalid JSON result`,
        })
      }

      const parsedResult = WorkerResultSchema.safeParse(parsedJson)

      if (!parsedResult.success) {
        return buildFailureResult({
          workerId: args.workerId,
          error: `Worker ${args.workerId} returned invalid JSON result`,
        })
      }

      return parsedResult.data
    } finally {
      args.runtime.abort.removeEventListener("abort", handleAbort)
    }
  } catch (error) {
    return buildFailureResult({
      workerId: args.workerId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

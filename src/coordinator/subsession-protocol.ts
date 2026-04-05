import { z } from "zod"

import { executeWorkerSubsession } from "./subsession-executor"
import type { WorkerResult, WorkerRuntimeContext } from "./types"

export type SubsessionProtocolSpec<TOutputSchema extends z.ZodType> = {
  workerId: string
  sessionTitle: string
  systemPrompt: string
  userPrompt: string
  outputSchema: TOutputSchema
}

type SuccessfulWorkerResult<TOutputSchema extends z.ZodType> = Omit<
  WorkerResult,
  "output" | "status"
> & {
  status: "success" | "partial"
  output: z.infer<TOutputSchema>
}

export type SubsessionProtocolSuccess<TOutputSchema extends z.ZodType> = {
  success: true
  result: SuccessfulWorkerResult<TOutputSchema>
}

export type SubsessionProtocolFailure = {
  success: false
  result: WorkerResult & {
    status: "failed"
  }
}

export type SubsessionProtocolResult<TOutputSchema extends z.ZodType> =
  | SubsessionProtocolSuccess<TOutputSchema>
  | SubsessionProtocolFailure

function buildFailureWorkerResult(args: {
  workerId: string
  error: string
}): WorkerResult & {
  status: "failed"
} {
  return {
    workerId: args.workerId,
    status: "failed",
    output: {},
    recommendations: [],
    errors: [args.error],
  }
}

export async function executeSubsessionProtocol<TOutputSchema extends z.ZodType>(
  spec: SubsessionProtocolSpec<TOutputSchema>,
  runtime: WorkerRuntimeContext,
): Promise<SubsessionProtocolResult<TOutputSchema>> {
  const workerResult = await executeWorkerSubsession({
    workerId: spec.workerId,
    workerName: spec.sessionTitle,
    systemPrompt: spec.systemPrompt,
    userPrompt: spec.userPrompt,
    runtime,
  })

  if (workerResult.workerId !== spec.workerId) {
    return {
      success: false,
      result: buildFailureWorkerResult({
        workerId: spec.workerId,
        error: `Worker ${spec.workerId} returned unexpected workerId '${workerResult.workerId}'`,
      }),
    }
  }

  if (workerResult.status === "failed") {
    return {
      success: false,
      result: {
        ...workerResult,
        status: "failed",
      },
    }
  }

  const parsedOutput = spec.outputSchema.safeParse(workerResult.output)
  if (!parsedOutput.success) {
    return {
      success: false,
      result: buildFailureWorkerResult({
        workerId: spec.workerId,
        error: `Worker ${spec.workerId} returned invalid output result`,
      }),
    }
  }

  const successfulWorkerResult: SuccessfulWorkerResult<TOutputSchema> = {
    ...workerResult,
    status: workerResult.status === "partial" ? "partial" : "success",
    output: parsedOutput.data,
  }

  return {
    success: true,
    result: successfulWorkerResult,
  }
}

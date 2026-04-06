import type {
  CoordinatorInput,
  CoordinatorResult,
  WorkerDefinition,
  WorkerInput,
  WorkerResult,
  WorkerRuntimeContext,
} from "./types"
import { getTriggeredWorkers, validateWorkerDependencies } from "./trigger-engine"
import { resolveExecutionOrder } from "./registry"
import { validateCloudSolutionModel } from "../validators/validate-cloud-solution-model"
import type { DesignGapSummary } from "../domain"

type RunDispatcherArgs = {
  input: CoordinatorInput
  workers: WorkerDefinition[]
  runtime: WorkerRuntimeContext
  reviewSummary?: DesignGapSummary
}

function normalizeWorkerResult(args: {
  worker: WorkerDefinition
  result: WorkerResult
}): WorkerResult {
  const { worker, result } = args

  if (result.workerId === worker.id) {
    return result
  }

  return {
    workerId: worker.id,
    status: "failed",
    output: {},
    recommendations: [],
    errors: [`Worker ${worker.id} returned unexpected workerId '${result.workerId}'`],
  }
}

export async function runCoordinatorDispatcher(
  args: RunDispatcherArgs,
): Promise<CoordinatorResult> {
  const triggeredWorkers = getTriggeredWorkers(args.workers, args.input)

  const dependencyErrors = validateWorkerDependencies(triggeredWorkers)
  if (dependencyErrors.length > 0) {
    throw new Error(`Dependency validation failed: ${dependencyErrors.join(', ')}`)
  }

  const orderedWorkers = resolveExecutionOrder(triggeredWorkers)

  const validationIssues = validateCloudSolutionModel({ ...args.input })
  let workerInput: WorkerInput = {
    requirement: args.input.requirement,
    devices: args.input.devices,
    racks: args.input.racks,
    ports: args.input.ports,
    links: args.input.links,
    segments: args.input.segments,
    allocations: args.input.allocations,
    validationIssues,
    reviewSummary: args.reviewSummary,
    context: args.input.context,
    workerMessages: {},
  }

  const workerResults: WorkerResult[] = []
  const aggregatedOutput: Record<string, WorkerResult> = {}

  for (const worker of orderedWorkers) {
    try {
      const result = normalizeWorkerResult({
        worker,
        result: await worker.execute(workerInput, args.runtime),
      })
      workerResults.push(result)
      aggregatedOutput[worker.id] = result
      workerInput = {
        ...workerInput,
        workerMessages: {
          ...aggregatedOutput,
        },
      }
    } catch (error) {
      const failedResult: WorkerResult = {
        workerId: worker.id,
        status: 'failed',
        output: {},
        recommendations: [],
        errors: [error instanceof Error ? error.message : String(error)],
      }

      workerResults.push(failedResult)
      aggregatedOutput[worker.id] = failedResult
      workerInput = {
        ...workerInput,
        workerMessages: {
          ...aggregatedOutput,
        },
      }
    }
  }

  const workersInvoked = orderedWorkers.map(w => w.id)
  const executionOrder = [...workersInvoked]

  const finalResponse = workerResults.map(result => {
    const workerOutput = JSON.stringify(result.output, null, 2)
    return `Worker ${result.workerId} (${result.status}): ${workerOutput}\n${(result.errors || []).map(err => `  Error: ${err}`).join('\n')}`
  }).join('\n')

  const allRecommendations: string[] = []
  for (const result of workerResults) {
    allRecommendations.push(...result.recommendations)
  }

  const nextActions = Array.from(new Set(allRecommendations))

  return {
    workersInvoked,
    executionOrder,
    aggregatedOutput,
    finalResponse,
    nextActions,
  }
}

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
  const workerInput: WorkerInput = {
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
  }

  const workerResults: WorkerResult[] = []
  for (const worker of orderedWorkers) {
    try {
      const result = await worker.execute(workerInput, args.runtime)
      workerResults.push(result)
    } catch (error) {
      workerResults.push({
        workerId: worker.id,
        status: 'failed',
        output: {},
        recommendations: [],
        errors: [error instanceof Error ? error.message : String(error)],
      })
    }
  }

  const workersInvoked = orderedWorkers.map(w => w.id)
  const executionOrder = [...workersInvoked]
  const aggregatedOutput: Record<string, WorkerResult> = {}

  for (const result of workerResults) {
    aggregatedOutput[result.workerId] = result
  }

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

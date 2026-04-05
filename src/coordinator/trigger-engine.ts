import { CoordinatorInput, WorkerDefinition } from './types'

export type TriggerEvaluationResult = {
  workerId: string
  triggered: boolean
  reason: string
}

/**
 * Evaluates trigger conditions for ALL workers regardless of whether they are triggered
 * Returns an array of TriggerEvaluationResult objects indicating the trigger status for each worker
 */
export function evaluateAllTriggers(
  workers: WorkerDefinition[],
  input: CoordinatorInput
): TriggerEvaluationResult[] {
  return workers.map(worker => {
    try {
      const triggered = worker.triggerCondition(input)
      const reason = triggered ? 'Trigger condition matched' : 'Trigger condition did not match'
      return {
        workerId: worker.id,
        triggered,
        reason
      }
    } catch (error) {
      return {
        workerId: worker.id,
        triggered: false,
        reason: `Trigger condition threw error: ${(error as Error).message}`
      }
    }
  })
}

/**
 * Returns only the workers whose trigger conditions evaluate to true
 * Results are sorted by priority (lower number = higher priority)
 */
export function getTriggeredWorkers(
  workers: WorkerDefinition[],
  input: CoordinatorInput
): WorkerDefinition[] {
  const triggeredWorkers = workers.filter(worker => {
    try {
      return worker.triggerCondition(input)
    } catch {
      // If trigger condition throws, assume it doesn't match
      return false
    }
  })

  // Sort by priority (lower number = higher priority)
  return triggeredWorkers.sort((a, b) => a.priority - b.priority)
}

/**
 * Validates that all dependencies of the triggered workers are also triggered
 * Returns an array of error messages for each missing dependency
 */
export function validateWorkerDependencies(
  triggeredWorkers: WorkerDefinition[]
): string[] {
  const errors: string[] = []
  const triggeredWorkerIds = new Set(triggeredWorkers.map(worker => worker.id))

  for (const worker of triggeredWorkers) {
    for (const dependencyId of worker.dependencies) {
      if (!triggeredWorkerIds.has(dependencyId)) {
        errors.push(`Worker "${worker.id}" requires dependency "${dependencyId}" which is not triggered`)
      }
    }
  }

  return errors
}
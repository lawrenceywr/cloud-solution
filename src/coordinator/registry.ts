import { CoordinatorInput, WorkerDefinition } from './types'

export type WorkerRegistry = {
  workers: Map<string, WorkerDefinition>
}

export function createWorkerRegistry(workers: WorkerDefinition[]): WorkerRegistry {
  const workerMap = new Map<string, WorkerDefinition>()
  for (const worker of workers) {
    workerMap.set(worker.id, worker)
  }
  return { workers: workerMap }
}

export function getWorker(registry: WorkerRegistry, workerId: string): WorkerDefinition | undefined {
  return registry.workers.get(workerId)
}

export function getAllWorkers(registry: WorkerRegistry): WorkerDefinition[] {
  return Array.from(registry.workers.values())
}

export function evaluateTriggers(
  registry: WorkerRegistry,
  input: CoordinatorInput
): WorkerDefinition[] {
  const triggeredWorkers = getAllWorkers(registry).filter(worker => {
    try {
      return worker.triggerCondition(input)
    } catch {
      return false
    }
  })

  return triggeredWorkers.sort((a, b) => a.priority - b.priority)
}

export function resolveExecutionOrder(triggeredWorkers: WorkerDefinition[]): WorkerDefinition[] {
  const dependencyMap = new Map<string, Set<string>>()
  const allWorkerIds = new Set<string>()

  for (const worker of triggeredWorkers) {
    allWorkerIds.add(worker.id)
    dependencyMap.set(worker.id, new Set(worker.dependencies))
  }

  const result: WorkerDefinition[] = []
  const workersById = new Map(triggeredWorkers.map(w => [w.id, w]))

  const queue: string[] = []
  for (const workerId of allWorkerIds) {
    const deps = dependencyMap.get(workerId)
    if (deps && deps.size === 0) {
      queue.push(workerId)
    }
  }

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const currentWorker = workersById.get(currentId)!
    result.push(currentWorker)

    for (const [workerId, deps] of dependencyMap.entries()) {
      if (deps.has(currentId)) {
        deps.delete(currentId)
        if (deps.size === 0) {
          queue.push(workerId)
        }
      }
    }
  }

  if (result.length !== triggeredWorkers.length) {
    throw new Error('Circular dependency detected in worker dependencies')
  }

  return result
}

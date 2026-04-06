import { describe, expect, test } from "bun:test"

import { createCompleteCoordinatorInput, createIncompleteCoordinatorInput } from "./__fixtures__"
import { runCoordinatorDispatcher } from "./dispatcher"
import type { CoordinatorInput, WorkerDefinition } from "./types"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"

function createRuntime() {
  const { client } = createFakeCoordinatorClient()
  return createWorkerRuntimeContext(client)
}

function createClarificationWorker(output: {
  missingFields: string[]
  clarificationQuestions: unknown[]
  suggestions: string[]
  recommendation: string
}): WorkerDefinition {
  return {
    id: "requirements-clarification",
    name: "Requirements Clarification",
    description: "Analyzes input and identifies missing fields",
    triggerCondition: (_input: CoordinatorInput) => true,
    priority: 100,
    dependencies: [],
    execute: async () => ({
      workerId: "requirements-clarification",
      status: "success",
      output: {
        missingFields: output.missingFields,
        clarificationQuestions: output.clarificationQuestions,
        suggestions: output.suggestions,
      },
      recommendations: [output.recommendation],
    }),
  }
}

function createFollowupWorker(workflowState: string): WorkerDefinition {
  return {
    id: "followup-worker",
    name: "Follow-up Worker",
    description: "Produces a second-stage worker result for dispatcher coverage",
    triggerCondition: (_input: CoordinatorInput) => true,
    priority: 200,
    dependencies: [],
    execute: async () => ({
      workerId: "followup-worker",
      status: "success",
      output: { workflowState },
      recommendations:
        workflowState === "export_ready"
          ? ["方案已就绪，可以导出制品"]
          : ["Review assumptions和gaps before exporting"],
    }),
  }
}

describe("runCoordinatorDispatcher", () => {
  test("complete input → clarification worker returns no questions, review worker returns export_ready", async () => {
    const result = await runCoordinatorDispatcher({
      input: createCompleteCoordinatorInput(),
      workers: [
        createClarificationWorker({
          missingFields: [],
          clarificationQuestions: [],
          suggestions: [],
          recommendation: "输入完整，无需澄清",
        }),
        createFollowupWorker("export_ready"),
      ],
      runtime: createRuntime(),
    })

    expect(result.workersInvoked).toEqual([
      "requirements-clarification",
      "followup-worker",
    ])
    expect(result.executionOrder).toEqual([
      "requirements-clarification",
      "followup-worker",
    ])
    expect(result.aggregatedOutput["requirements-clarification"].output).toEqual({
      missingFields: [],
      clarificationQuestions: [],
      suggestions: [],
    })
    expect(result.aggregatedOutput["followup-worker"].output).toEqual({
      workflowState: "export_ready",
    })
    expect(result.nextActions).toContain("输入完整，无需澄清")
    expect(result.nextActions).toContain("方案已就绪，可以导出制品")
  })

  test("incomplete input → clarification worker returns questions, review worker still runs", async () => {
    const result = await runCoordinatorDispatcher({
      input: createIncompleteCoordinatorInput(),
      workers: [
        createClarificationWorker({
          missingFields: ["devices", "racks"],
          clarificationQuestions: [
            {
              field: "devices",
              question: "请提供设备清单，包括设备名称、角色、厂商、型号",
              severity: "blocking",
            },
          ],
          suggestions: [],
          recommendation: "请补充以下信息后再继续方案评审",
        }),
        createFollowupWorker("review_required"),
      ],
      runtime: createRuntime(),
    })

    expect(result.workersInvoked).toEqual([
      "requirements-clarification",
      "followup-worker",
    ])
    expect(result.aggregatedOutput["requirements-clarification"].output).toEqual({
      missingFields: ["devices", "racks"],
      clarificationQuestions: [
        {
          field: "devices",
          question: "请提供设备清单，包括设备名称、角色、厂商、型号",
          severity: "blocking",
        },
      ],
      suggestions: [],
    })
    expect(result.aggregatedOutput["followup-worker"].output).toEqual({
      workflowState: "review_required",
    })
    expect(result.nextActions).toContain("请补充以下信息后再继续方案评审")
  })

  test("dispatcher with no workers → empty result", async () => {
    const result = await runCoordinatorDispatcher({
      input: createCompleteCoordinatorInput(),
      workers: [],
      runtime: createRuntime(),
    })

    expect(result.workersInvoked).toEqual([])
    expect(result.executionOrder).toEqual([])
    expect(result.aggregatedOutput).toEqual({})
    expect(result.finalResponse).toBe("")
    expect(result.nextActions).toEqual([])
  })

  test("dispatcher with circular dependency → throws error", async () => {
    const workers: WorkerDefinition[] = [
      {
        id: "worker-a",
        name: "Worker A",
        description: "Worker with dependency cycle",
        triggerCondition: (_input: CoordinatorInput) => true,
        priority: 100,
        dependencies: ["worker-b"],
        execute: async () => ({
          workerId: "worker-a",
          status: "success",
          output: {},
          recommendations: [],
        }),
      },
      {
        id: "worker-b",
        name: "Worker B",
        description: "Worker with dependency cycle",
        triggerCondition: (_input: CoordinatorInput) => true,
        priority: 100,
        dependencies: ["worker-a"],
        execute: async () => ({
          workerId: "worker-b",
          status: "success",
          output: {},
          recommendations: [],
        }),
      },
    ]

    await expect(
      runCoordinatorDispatcher({
        input: createCompleteCoordinatorInput(),
        workers,
        runtime: createRuntime(),
      }),
    ).rejects.toThrow("Circular dependency detected in worker dependencies")
  })

  test("dispatcher with worker that throws → captures error in result", async () => {
    const workers: WorkerDefinition[] = [
      {
        id: "throwing-worker",
        name: "Throwing Worker",
        description: "Worker that always throws an error",
        triggerCondition: (_input: CoordinatorInput) => true,
        priority: 100,
        dependencies: [],
        execute: async () => {
          throw new Error("Something went wrong in the worker")
        },
      },
    ]

    const result = await runCoordinatorDispatcher({
      input: createCompleteCoordinatorInput(),
      workers,
      runtime: createRuntime(),
    })

    expect(result.workersInvoked).toEqual(["throwing-worker"])
    expect(result.executionOrder).toEqual(["throwing-worker"])
    expect(result.aggregatedOutput["throwing-worker"]).toEqual({
      workerId: "throwing-worker",
      status: "failed",
      output: {},
      recommendations: [],
      errors: ["Something went wrong in the worker"],
    })
  })

  test("dispatcher passes prior worker results into downstream workerMessages", async () => {
    const workers: WorkerDefinition[] = [
      createClarificationWorker({
        missingFields: [],
        clarificationQuestions: [],
        suggestions: [],
        recommendation: "输入完整，无需澄清",
      }),
      {
        id: "message-aware-worker",
        name: "Message Aware Worker",
        description: "Reads upstream worker messages before executing.",
        triggerCondition: (_input: CoordinatorInput) => true,
        priority: 200,
        dependencies: ["requirements-clarification"],
        execute: async (input) => ({
          workerId: "message-aware-worker",
          status: "success",
          output: {
            seenWorkerIds: Object.keys(input.workerMessages).sort(),
            upstreamStatus: input.workerMessages["requirements-clarification"]?.status,
          },
          recommendations: [],
        }),
      },
    ]

    const result = await runCoordinatorDispatcher({
      input: createCompleteCoordinatorInput(),
      workers,
      runtime: createRuntime(),
    })

    expect(result.executionOrder).toEqual([
      "requirements-clarification",
      "message-aware-worker",
    ])
    expect(result.aggregatedOutput["message-aware-worker"].output).toEqual({
      seenWorkerIds: ["requirements-clarification"],
      upstreamStatus: "success",
    })
  })

  test("dispatcher normalizes a mismatched returned workerId into a failed dependency-safe result", async () => {
    const workers: WorkerDefinition[] = [
      {
        id: "requirements-clarification",
        name: "Requirements Clarification",
        description: "Returns the wrong worker id.",
        triggerCondition: (_input: CoordinatorInput) => true,
        priority: 100,
        dependencies: [],
        execute: async () => ({
          workerId: "different-worker-id",
          status: "success",
          output: { foo: "bar" },
          recommendations: ["bad-output"],
        }),
      },
      {
        id: "message-aware-worker",
        name: "Message Aware Worker",
        description: "Reads upstream worker messages before executing.",
        triggerCondition: (_input: CoordinatorInput) => true,
        priority: 200,
        dependencies: ["requirements-clarification"],
        execute: async (input) => ({
          workerId: "message-aware-worker",
          status: "success",
          output: {
            upstreamStatus: input.workerMessages["requirements-clarification"]?.status,
            upstreamErrors: input.workerMessages["requirements-clarification"]?.errors ?? [],
          },
          recommendations: [],
        }),
      },
    ]

    const result = await runCoordinatorDispatcher({
      input: createCompleteCoordinatorInput(),
      workers,
      runtime: createRuntime(),
    })

    expect(result.aggregatedOutput["requirements-clarification"]).toEqual({
      workerId: "requirements-clarification",
      status: "failed",
      output: {},
      recommendations: [],
      errors: ["Worker requirements-clarification returned unexpected workerId 'different-worker-id'"],
    })
    expect(result.aggregatedOutput["message-aware-worker"].output).toEqual({
      upstreamStatus: "failed",
      upstreamErrors: ["Worker requirements-clarification returned unexpected workerId 'different-worker-id'"],
    })
  })
})

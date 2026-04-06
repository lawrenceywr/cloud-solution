import { z } from "zod"

import { CloudSolutionSliceInputSchema, ValidationIssueSchema, DesignGapSummarySchema } from "../domain"
import type { CoordinatorClient } from "../plugin/types"

const WorkerMessageSchema = z.object({
  workerId: z.string(),
  status: z.enum(["success", "partial", "failed"]),
  output: z.record(z.string(), z.unknown()),
  recommendations: z.array(z.string()),
  errors: z.array(z.string()).optional(),
})

export const CoordinatorInputSchema = CloudSolutionSliceInputSchema.extend({
  context: z.record(z.string(), z.unknown()).optional(),
})

export const WorkerInputSchema = CloudSolutionSliceInputSchema.extend({
  validationIssues: z.array(ValidationIssueSchema),
  reviewSummary: DesignGapSummarySchema.optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  workerMessages: z.record(z.string(), WorkerMessageSchema).default({}),
})

export const WorkerResultSchema = WorkerMessageSchema

export const WorkerDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  triggerCondition: z.any(),
  priority: z.number(),
  dependencies: z.array(z.string()),
  execute: z.any(),
})

export const CoordinatorResultSchema = z.object({
  workersInvoked: z.array(z.string()),
  executionOrder: z.array(z.string()),
  aggregatedOutput: z.record(z.string(), WorkerResultSchema),
  finalResponse: z.string(),
  nextActions: z.array(z.string()),
})

export const ClarificationQuestionSchema = z.object({
  field: z.string(),
  question: z.string(),
  severity: z.enum(["blocking", "warning", "informational"]),
  suggestion: z.string().optional(),
})

export type CoordinatorInput = z.infer<typeof CoordinatorInputSchema>
export type WorkerInput = z.infer<typeof WorkerInputSchema>
export type WorkerResult = z.infer<typeof WorkerResultSchema>
export type CoordinatorResult = z.infer<typeof CoordinatorResultSchema>
export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>

export type WorkerRuntimeContext = {
  client: CoordinatorClient
  parentSessionID: string
  agent: string
  directory: string
  worktree: string
  abort: AbortSignal
}

export type WorkerTriggerCondition = (input: CoordinatorInput) => boolean

export type WorkerExecute = (
  input: WorkerInput,
  runtime: WorkerRuntimeContext,
) => Promise<WorkerResult>

export type WorkerDefinition = {
  id: string
  name: string
  description: string
  triggerCondition: WorkerTriggerCondition
  priority: number
  dependencies: string[]
  execute: WorkerExecute
}

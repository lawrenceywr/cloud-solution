import { z } from 'zod'

import { WorkerInputSchema, ClarificationQuestionSchema } from '../../coordinator/types'
import { QuestionTemplate } from './question-templates'

export const ClarificationWorkerInputSchema = WorkerInputSchema.extend({
  questionTemplates: z.array(z.lazy(() => z.object({
    id: z.string(),
    trigger: z.function(),
    field: z.string(),
    question: z.string(),
    severity: z.union([z.literal('blocking'), z.literal('warning'), z.literal('informational')]),
    suggestion: z.string().optional()
  })))
})

export const ClarificationWorkerOutputSchema = z.object({
  missingFields: z.array(z.string()),
  clarificationQuestions: z.array(ClarificationQuestionSchema),
  suggestions: z.array(z.string())
})

export type ClarificationWorkerInput = z.infer<typeof ClarificationWorkerInputSchema>
export type ClarificationWorkerOutput = z.infer<typeof ClarificationWorkerOutputSchema>
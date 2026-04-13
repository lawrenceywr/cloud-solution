import { z } from 'zod'

import { WorkerInputSchema } from '../../coordinator/types'
import { ConflictSchema } from '../../domain/schema/cloud-domain-schema'

export const EvidenceReconciliationWorkerInputSchema = WorkerInputSchema

export const EvidenceReconciliationWorkerOutputSchema = z.object({
  conflicts: z.array(ConflictSchema).default([]),
  reconciliationWarnings: z.array(z.string()).default([]),
})

export type EvidenceReconciliationWorkerOutput = z.infer<typeof EvidenceReconciliationWorkerOutputSchema>
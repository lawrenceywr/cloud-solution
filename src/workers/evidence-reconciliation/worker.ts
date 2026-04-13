import {
  executeSubsessionProtocol,
  type SubsessionProtocolResult,
} from "../../coordinator/subsession-protocol"
import type { WorkerInput, WorkerResult, WorkerRuntimeContext } from "../../coordinator/types"
import { CONFLICT_TEMPLATES } from "./question-templates"
import { EvidenceReconciliationWorkerOutputSchema } from "./types"

const conflictTemplateCatalog = CONFLICT_TEMPLATES.map((template) => ({
  id: template.id,
  conflictType: template.conflictType,
  field: template.field,
  question: template.question,
  severity: template.severity,
  suggestion: template.suggestion,
}))

const reconciliationSystemPrompt = [
  "You are the evidence reconciliation child agent for a cloud/data-center solution workflow.",
  "Analyze only the provided JSON input.",
  "Use only the provided conflict templates.",
  "Return every applicable conflict item in one pass.",
  "Preserve each template severity exactly as provided.",
  "Do not invent new fields, new questions, or extra recommendations.",
  "Return exactly one JSON object and nothing else.",
  "If no conflicts are found, return a success result with empty arrays and recommendation ['未发现证据冲突，可以继续方案评审'].",
  "If conflicts are found, return a success result with output { conflicts, reconciliationWarnings } and recommendation ['检测到以下证据冲突，请解决后再继续方案评审'].",
  "The JSON object must match this shape: { workerId, status, output, recommendations, errors? }.",
].join("\n")

function buildReconciliationPrompt(input: WorkerInput): string {
  return [
    "Conflict templates:",
    JSON.stringify(conflictTemplateCatalog, null, 2),
    "",
    "Worker input:",
    JSON.stringify(input, null, 2),
  ].join("\n")
}

export async function executeEvidenceReconciliationWorker(
  input: WorkerInput,
  runtime: WorkerRuntimeContext,
): Promise<WorkerResult> {
  const result = await executeEvidenceReconciliationWorkerSubsession(input, runtime)

  return result.result
}

export async function executeEvidenceReconciliationWorkerSubsession(
  input: WorkerInput,
  runtime: WorkerRuntimeContext,
): Promise<SubsessionProtocolResult<typeof EvidenceReconciliationWorkerOutputSchema>> {
  return executeSubsessionProtocol({
    workerId: "evidence-reconciliation",
    sessionTitle: "Evidence Reconciliation",
    systemPrompt: reconciliationSystemPrompt,
    userPrompt: buildReconciliationPrompt(input),
    outputSchema: EvidenceReconciliationWorkerOutputSchema,
  }, runtime)
}

export default executeEvidenceReconciliationWorker
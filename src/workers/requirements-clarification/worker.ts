import {
  executeSubsessionProtocol,
  type SubsessionProtocolResult,
} from "../../coordinator/subsession-protocol"
import type { WorkerInput, WorkerResult, WorkerRuntimeContext } from "../../coordinator/types"
import { QUESTION_TEMPLATES } from "./question-templates"
import { ClarificationWorkerOutputSchema } from "./types"

const clarificationTemplateCatalog = QUESTION_TEMPLATES.map((template) => ({
  id: template.id,
  field: template.field,
  question: template.question,
  severity: template.severity,
  suggestion: template.suggestion,
}))

const clarificationSystemPrompt = [
  "You are the requirements clarification child agent for a cloud/data-center solution workflow.",
  "Analyze only the provided JSON input.",
  "Use only the provided clarification templates.",
  "Return every applicable clarification item in one pass.",
  "Preserve each template severity exactly as provided.",
  "Do not invent new fields, new questions, or extra recommendations.",
  "Return exactly one JSON object and nothing else.",
  "If no clarification is needed, return a success result with empty arrays and recommendation ['输入完整，无需澄清'].",
  "If clarification is needed, return a success result with output { missingFields, clarificationQuestions, suggestions } and recommendation ['请补充以下信息后再继续方案评审'].",
  "The JSON object must match this shape: { workerId, status, output, recommendations, errors? }.",
].join("\n")

function buildClarificationPrompt(input: WorkerInput): string {
  return [
    "Clarification templates:",
    JSON.stringify(clarificationTemplateCatalog, null, 2),
    "",
    "Worker input:",
    JSON.stringify(input, null, 2),
  ].join("\n")
}

export async function executeClarificationWorker(
  input: WorkerInput,
  runtime: WorkerRuntimeContext,
): Promise<WorkerResult> {
  const result = await executeClarificationWorkerSubsession(input, runtime)

  return result.result
}

export async function executeClarificationWorkerSubsession(
  input: WorkerInput,
  runtime: WorkerRuntimeContext,
): Promise<SubsessionProtocolResult<typeof ClarificationWorkerOutputSchema>> {
  return executeSubsessionProtocol({
    workerId: "requirements-clarification",
    sessionTitle: "Requirements Clarification",
    systemPrompt: clarificationSystemPrompt,
    userPrompt: buildClarificationPrompt(input),
    outputSchema: ClarificationWorkerOutputSchema,
  }, runtime)
}

export default executeClarificationWorker

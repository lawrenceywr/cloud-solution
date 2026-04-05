import type { ClarificationQuestion } from "../../coordinator/types"
import type { CloudSolutionSliceInput } from "../../domain"

export interface QuestionTemplate {
  id: string
  trigger: (input: CloudSolutionSliceInput) => boolean
  field: string
  question: string
  severity: "blocking" | "warning" | "informational"
  suggestion?: string
}

export type ClarificationSummary = {
  missingFields: string[]
  clarificationQuestions: ClarificationQuestion[]
  blockingQuestions: ClarificationQuestion[]
  nonBlockingQuestions: ClarificationQuestion[]
  suggestions: string[]
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function countDeviceLinks(input: CloudSolutionSliceInput): Record<string, number> {
  const deviceLinkCounts: Record<string, number> = {}

  input.links.forEach((link) => {
    const portA = input.ports.find((port) => port.id === link.endpointA.portId)
    const portB = input.ports.find((port) => port.id === link.endpointB.portId)

    if (portA?.deviceId) {
      deviceLinkCounts[portA.deviceId] = (deviceLinkCounts[portA.deviceId] || 0) + 1
    }

    if (portB?.deviceId) {
      deviceLinkCounts[portB.deviceId] = (deviceLinkCounts[portB.deviceId] || 0) + 1
    }
  })

  return deviceLinkCounts
}

function hasInsufficientLinksForRedundancyIntent(
  input: CloudSolutionSliceInput,
  redundancyIntent: "dual-homed-required" | "dual-homed-preferred",
): boolean {
  const matchingDevices = input.devices.filter(
    (device) => device.redundancyIntent === redundancyIntent,
  )

  if (matchingDevices.length === 0) {
    return false
  }

  const deviceLinkCounts = countDeviceLinks(input)

  return matchingDevices.some(
    (device) => (deviceLinkCounts[device.id] || 0) < 2,
  )
}

export const QUESTION_TEMPLATES: QuestionTemplate[] = [
  {
    id: "devices-missing",
    trigger: (input) => input.devices.length === 0,
    field: "devices",
    question: "请提供设备清单，包括设备名称、角色、厂商、型号",
    severity: "blocking",
  },
  {
    id: "racks-missing-for-data-center",
    trigger: (input) =>
      input.requirement.scopeType === "data-center" && input.racks.length === 0,
    field: "racks",
    question: "请提供机柜信息，包括机柜名称、位置",
    severity: "blocking",
  },
  {
    id: "devices-missing-rack-id",
    trigger: (input) =>
      input.devices.some((device) => !device.rackId),
    field: "devices[].rackId",
    question: "部分设备未关联机柜，请补充 rackId",
    severity: "blocking",
  },
  {
    id: "network-segments-missing",
    trigger: (input) =>
      input.requirement.scopeType === "data-center" &&
      input.segments.length === 0,
    field: "segments",
    question: "请定义网络段，包括网段类型、CIDR、用途",
    severity: "blocking",
  },
  {
    id: "ip-allocations-missing",
    trigger: (input) =>
      input.segments.length > 0 && input.allocations.length === 0,
    field: "allocations",
    question: "已定义网段但未分配 IP，请补充 IP 分配信息",
    severity: "blocking",
  },
  {
    id: "ports-missing",
    trigger: (input) =>
      input.devices.length > 0 && input.ports.length === 0,
    field: "ports",
    question: "请为设备定义端口信息",
    severity: "blocking",
  },
  {
    id: "links-missing",
    trigger: (input) =>
      input.ports.length > 0 && input.links.length === 0,
    field: "links",
    question: "请定义端口之间的连接关系",
    severity: "blocking",
  },
  {
    id: "device-redundancy-links-required-insufficient",
    trigger: (input) => hasInsufficientLinksForRedundancyIntent(input, "dual-homed-required"),
    field: "links",
    question: "设备要求双归属但链路不足",
    severity: "blocking",
  },
  {
    id: "device-redundancy-links-preferred-insufficient",
    trigger: (input) => hasInsufficientLinksForRedundancyIntent(input, "dual-homed-preferred"),
    field: "links",
    question: "设备建议双归属，但当前链路不足，建议补充或确认这是可接受的降级设计",
    severity: "warning",
    suggestion: "确认是否接受当前冗余不足，或补充第二条独立链路",
  },
]

export function assessClarificationQuestions(
  input: CloudSolutionSliceInput,
): ClarificationSummary {
  const clarificationQuestions = QUESTION_TEMPLATES.flatMap((template) => {
    if (!template.trigger(input)) {
      return []
    }

    return [{
      field: template.field,
      question: template.question,
      severity: template.severity,
      ...(template.suggestion ? { suggestion: template.suggestion } : {}),
    } satisfies ClarificationQuestion]
  })

  const blockingQuestions = clarificationQuestions.filter(
    (question) => question.severity === "blocking",
  )
  const nonBlockingQuestions = clarificationQuestions.filter(
    (question) => question.severity !== "blocking",
  )

  return {
    missingFields: uniqueStrings(clarificationQuestions.map((question) => question.field)),
    clarificationQuestions,
    blockingQuestions,
    nonBlockingQuestions,
    suggestions: uniqueStrings(
      clarificationQuestions.flatMap((question) =>
        question.suggestion ? [question.suggestion] : [],
      ),
    ),
  }
}

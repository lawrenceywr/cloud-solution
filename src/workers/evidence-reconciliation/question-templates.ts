export type ConflictQuestionTemplate = {
  id: string
  conflictType: string
  field: string
  question: string
  severity: 'blocking' | 'warning' | 'informational'
  suggestion: string
}

export const CONFLICT_TEMPLATES: ConflictQuestionTemplate[] = [
  {
    id: "duplicate-device-name",
    conflictType: "duplicate_device",
    field: "devices[].name",
    question: "发现重复的设备名称，请确认设备标识是否唯一",
    severity: "blocking",
    suggestion: "为每个设备分配唯一的名称或添加前缀/后缀以区分"
  },
  {
    id: "contradictory-device-attributes",
    conflictType: "contradictory_device_attribute",
    field: "devices[].role",
    question: "同一设备在不同来源中具有矛盾的角色定义",
    severity: "blocking",
    suggestion: "确认设备的正确角色并统一所有来源中的定义"
  },
  {
    id: "duplicate-port-id",
    conflictType: "duplicate_port_id",
    field: "ports[].id",
    question: "发现重复的端口ID，请确保每个端口有唯一标识",
    severity: "blocking",
    suggestion: "为端口ID添加设备前缀或使用全局唯一标识符"
  },
  {
    id: "impossible-link-connection",
    conflictType: "impossible_link_connection",
    field: "links",
    question: "检测到不可能的连接（如设备自连或连接不存在的端口）",
    severity: "blocking",
    suggestion: "验证所有连接端点的有效性，确保两端设备和端口都存在"
  },
  {
    id: "segment-address-overlap",
    conflictType: "segment_address_overlap",
    field: "segments[].cidr",
    question: "发现网段地址重叠，可能导致路由冲突",
    severity: "warning",
    suggestion: "重新规划网段划分，确保各网段CIDR不重叠"
  },
]
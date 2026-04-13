import { describe, expect, test } from "bun:test"

import type { Conflict } from "../domain/schema/cloud-domain-schema"
import { renderConflictReport } from "./render-conflict-report"

describe("renderConflictReport", () => {
  test("renders empty conflict report when no conflicts", () => {
    const result = renderConflictReport({
      projectName: "Test Project",
      conflicts: [],
      blockingConflictCount: 0,
      warningConflictCount: 0,
    })

    expect(result.name).toBe("conflict-report.md")
    expect(result.mimeType).toBe("text/markdown")
    expect(result.content).toContain("# Conflict Report")
    expect(result.content).toContain("Project: Test Project")
    expect(result.content).toContain("Total Conflicts: 0")
    expect(result.content).toContain("Blocking Conflicts: 0")
    expect(result.content).toContain("Warning Conflicts: 0")
    expect(result.content).toContain("No blocking conflicts detected")
  })

  test("renders blocking and warning conflicts correctly", () => {
    const conflicts: Conflict[] = [
      {
        id: "conflict-1",
        conflictType: "duplicate_device",
        severity: "blocking",
        message: "Duplicate device ID detected",
        entityRefs: ["device-1", "device-2"],
        sourceRefs: [{ kind: "user-input", ref: "structured-input" }],
        suggestedResolution: "Remove or rename duplicate devices",
      },
      {
        id: "conflict-2",
        conflictType: "impossible_port",
        severity: "warning",
        message: "Port configuration mismatch",
        entityRefs: ["port-1"],
        sourceRefs: [{ kind: "diagram", ref: "topology-diagram" }],
      },
    ]

    const result = renderConflictReport({
      projectName: "Test Project",
      conflicts,
      blockingConflictCount: 1,
      warningConflictCount: 1,
    })

    expect(result.content).toContain("Blocking Conflicts: 1")
    expect(result.content).toContain("Warning Conflicts: 1")
    expect(result.content).toContain("1 blocking conflict(s) must be resolved")
    expect(result.content).toContain("## Blocking Conflicts")
    expect(result.content).toContain("## Warning Conflicts")
    expect(result.content).toContain("Duplicate device ID detected")
    expect(result.content).toContain("Port configuration mismatch")
  })

  test("includes suggested resolution when provided", () => {
    const conflicts: Conflict[] = [
      {
        id: "conflict-1",
        conflictType: "duplicate_device",
        severity: "blocking",
        message: "Duplicate device ID detected",
        entityRefs: ["device-1"],
        sourceRefs: [],
        suggestedResolution: "Remove or rename one of the duplicate devices",
      },
    ]

    const result = renderConflictReport({
      projectName: "Test Project",
      conflicts,
      blockingConflictCount: 1,
      warningConflictCount: 0,
    })

    expect(result.content).toContain("Remove or rename one of the duplicate devices")
  })

  test("renders all conflicts section with all conflicts", () => {
    const conflicts: Conflict[] = [
      {
        id: "conflict-1",
        conflictType: "duplicate_device",
        severity: "blocking",
        message: "First conflict",
        entityRefs: ["device-1"],
        sourceRefs: [],
      },
      {
        id: "conflict-2",
        conflictType: "impossible_port",
        severity: "warning",
        message: "Second conflict",
        entityRefs: ["port-1"],
        sourceRefs: [],
      },
    ]

    const result = renderConflictReport({
      projectName: "Test Project",
      conflicts,
      blockingConflictCount: 1,
      warningConflictCount: 1,
    })

    expect(result.content).toContain("## All Conflicts")
    expect(result.content).toContain("First conflict")
    expect(result.content).toContain("Second conflict")
  })

  test("escapes markdown special characters in conflict messages", () => {
    const conflicts: Conflict[] = [
      {
        id: "conflict-1",
        conflictType: "duplicate_device",
        severity: "blocking",
        message: "Message with | pipe and\nnewline",
        entityRefs: ["device-1"],
        sourceRefs: [],
      },
    ]

    const result = renderConflictReport({
      projectName: "Test Project",
      conflicts,
      blockingConflictCount: 1,
      warningConflictCount: 0,
    })

    expect(result.content).toContain("Message with \\| pipe")
    expect(result.content).toContain(" <br> ")
  })
})

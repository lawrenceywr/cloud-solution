import { describe, expect, test } from "bun:test"

import { renderAssumptionReport } from "./assumption-report-renderer"

describe("renderAssumptionReport", () => {
  test("renders deterministic sections for assumptions, gaps, and unresolved items", () => {
    const artifact = renderAssumptionReport({
      projectName: "Review Example",
      reviewRequired: true,
      assumptions: [
        {
          kind: "assumption",
          severity: "warning",
          subjectType: "device",
          subjectId: "device-a",
          title: "Assumed device fact",
          detail: "device device-a is currently inferred and should be reviewed before export.",
          confidenceState: "inferred",
          entityRefs: ["device:device-a"],
          sourceRefs: [],
        },
      ],
      gaps: [
        {
          kind: "gap",
          severity: "blocking",
          subjectType: "segment",
          subjectId: "segment-a",
          title: "Blocking validation gap",
          detail: "Segment segment-a is missing required CIDR information.",
          entityRefs: ["segment:segment-a"],
          sourceRefs: [],
        },
      ],
      unresolvedItems: [
        {
          kind: "unresolved-item",
          severity: "warning",
          subjectType: "link",
          subjectId: "link-a",
          title: "Review warning",
          detail: "Link link-a should be reviewed.",
          entityRefs: ["link:link-a"],
          sourceRefs: [],
        },
      ],
    })

    expect(artifact.name).toBe("design-assumptions-and-gaps.md")
    expect(artifact.content).toContain("Review Required: yes")
    expect(artifact.content).toContain("## Assumptions")
    expect(artifact.content).toContain("## Blocking Gaps")
    expect(artifact.content).toContain("## Unresolved Review Items")
  })

  test("escapes markdown table delimiters and flattens multiline values", () => {
    const artifact = renderAssumptionReport({
      projectName: "Escaping Example",
      reviewRequired: true,
      assumptions: [
        {
          kind: "assumption",
          severity: "warning",
          subjectType: "device",
          subjectId: "device|a",
          title: "Assumed | fact",
          detail: "line one\nline two | pipe",
          confidenceState: "inferred",
          entityRefs: ["device:device|a"],
          sourceRefs: [
            {
              kind: "document",
              ref: "rack|sheet\npage-1",
            },
          ],
        },
      ],
      gaps: [],
      unresolvedItems: [],
    })

    expect(artifact.content).toContain("device:device\\|a")
    expect(artifact.content).toContain("Assumed \\| fact")
    expect(artifact.content).toContain("line one <br> line two \\| pipe")
    expect(artifact.content).toContain("document:rack\\|sheet <br> page-1")
  })
})

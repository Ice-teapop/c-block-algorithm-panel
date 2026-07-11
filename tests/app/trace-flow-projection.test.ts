import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectTraceEventsToFlow } from "../../src/app/trace-flow-projection.js";
import type { CParser } from "../../src/core/index.js";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import type { TraceEvent } from "../../src/shared/trace.js";
import { createTestParser } from "../core/parser-fixture.js";
import { analyzeFlowFixture } from "../flow/fixture.js";

const SOURCE = [
  "int main(void) {",
  "  int x = 1;",
  "  if (x) {",
  "    x++;",
  "  }",
  "  else {",
  "    x--;",
  "  }",
  "  return x;",
  "}",
].join("\n");

describe("trace to flow projection", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => parser.dispose());

  it("maps observed lines and the actual branch kind without merging the opposite edge", () => {
    const { projection } = analyzeFlowFixture(parser, SOURCE);
    const events: readonly TraceEvent[] = [
      event(1, "line", 2),
      event(2, "branch", 3, true),
      event(3, "line", 4),
      event(4, "line", 9),
    ];

    const result = projectTraceEventsToFlow(SOURCE, projection, events);
    const trueEdge = projection.edges.find((edge) => edge.kind === "branch-true");
    const falseEdge = projection.edges.find((edge) => edge.kind === "branch-false");

    expect(result.matchedEventCount).toBe(4);
    expect(result.unmatchedEventCount).toBe(0);
    expect(result.discontinuityCount).toBe(0);
    expect(result.path.edgeIds).toContain(trueEdge?.id);
    expect(result.path.edgeIds).not.toContain(falseEdge?.id);
    expect(result.path.mode).toBe("real");
    expect(Object.values(result.nodeVisitCounts).reduce((sum, count) => sum + count, 0)).toBe(4);
  });

  it("maps the instrumented function header to Start before following continuous CFG edges", () => {
    const { projection } = analyzeFlowFixture(parser, SOURCE);
    const events: readonly TraceEvent[] = [
      event(1, "line", 1),
      event(2, "line", 2),
      event(3, "branch", 3, true),
      event(4, "line", 4),
      event(5, "line", 9),
    ];

    const result = projectTraceEventsToFlow(SOURCE, projection, events);
    const start = projection.nodes.find((node) => node.kind === "start");
    const declaration = projection.nodes.find((node) => node.kind === "declaration");
    const entry = projection.edges.find(
      (edge) => edge.from.nodeId === start?.id && edge.to.nodeId === declaration?.id,
    );

    expect(result.matchedEventCount).toBe(5);
    expect(result.unmatchedEventCount).toBe(0);
    expect(result.discontinuityCount).toBe(0);
    expect(result.path.nodeIds[0]).toBe(start?.id);
    expect(result.path.edgeIds).toContain(entry?.id);
  });

  it("maps a closing-brace line event to the matching End boundary", () => {
    const { projection } = analyzeFlowFixture(parser, SOURCE);
    const result = projectTraceEventsToFlow(SOURCE, projection, [event(1, "line", 10)]);
    const end = projection.nodes.find((node) => node.kind === "end");

    expect(result.matchedEventCount).toBe(1);
    expect(result.unmatchedEventCount).toBe(0);
    expect(result.path.currentNodeId).toBe(end?.id);
  });

  it("omits an unmappable line instead of guessing a node", () => {
    const { projection } = analyzeFlowFixture(parser, SOURCE);
    const result = projectTraceEventsToFlow(SOURCE, projection, [event(1, "line", 100)]);

    expect(result.matchedEventCount).toBe(0);
    expect(result.unmatchedEventCount).toBe(1);
    expect(result.path.nodeIds).toEqual([]);
    expect(result.discontinuityCount).toBe(0);
  });

  it("maps the actual switch case and a fallthrough label without selecting default", () => {
    const source = [
      "int main(void) {",
      "  int x = 1;",
      "  switch (x) {",
      "  case 1:",
      "    x++;",
      "  case 2:",
      "    x--;",
      "    break;",
      "  default:",
      "    x = 0;",
      "  }",
      "  return 0;",
      "}",
    ].join("\n");
    const { projection } = analyzeFlowFixture(parser, source);
    const result = projectTraceEventsToFlow(source, projection, [
      event(1, "line", 3),
      event(2, "line", 4),
      event(3, "line", 5),
      event(4, "line", 6),
      event(5, "line", 7),
      event(6, "line", 8),
      event(7, "line", 12),
    ]);
    const caseOneNode = projection.nodes.find(
      (node) =>
        node.nodeType === "case_statement" && node.sourceText.trimStart().startsWith("case 1:"),
    );
    const caseTwoNode = projection.nodes.find(
      (node) =>
        node.nodeType === "case_statement" && node.sourceText.trimStart().startsWith("case 2:"),
    );
    const caseOneEdge = projection.edges.find(
      (edge) => edge.kind === "switch-case" && edge.to.nodeId === caseOneNode?.id,
    );
    const caseTwoDispatch = projection.edges.find(
      (edge) => edge.kind === "switch-case" && edge.to.nodeId === caseTwoNode?.id,
    );
    const defaultEdge = projection.edges.find((edge) => edge.kind === "switch-default");

    expect(result.unmatchedEventCount).toBe(0);
    expect(result.discontinuityCount).toBe(0);
    expect(result.path.edgeIds).toContain(caseOneEdge?.id);
    expect(result.path.edgeIds).not.toContain(caseTwoDispatch?.id);
    expect(result.path.edgeIds).not.toContain(defaultEdge?.id);
  });

  it("maps an actually entered default label to the switch-default edge", () => {
    const source = [
      "int main(void) {",
      "  int x = 7;",
      "  switch (x) {",
      "  case 1:",
      "    x++;",
      "    break;",
      "  default:",
      "    x = 0;",
      "  }",
      "  return 0;",
      "}",
    ].join("\n");
    const { projection } = analyzeFlowFixture(parser, source);
    const result = projectTraceEventsToFlow(source, projection, [
      event(1, "line", 3),
      event(2, "line", 7),
      event(3, "line", 8),
      event(4, "line", 10),
    ]);
    const defaultEdge = projection.edges.find((edge) => edge.kind === "switch-default");
    const caseEdge = projection.edges.find((edge) => edge.kind === "switch-case");

    expect(result.unmatchedEventCount).toBe(0);
    expect(result.discontinuityCount).toBe(0);
    expect(result.path.edgeIds).toContain(defaultEdge?.id);
    expect(result.path.edgeIds).not.toContain(caseEdge?.id);
  });

  it("fails closed when two mapped trace events have no direct CFG edge", () => {
    const { projection } = analyzeFlowFixture(parser, SOURCE);
    const result = projectTraceEventsToFlow(SOURCE, projection, [
      event(1, "line", 2),
      event(2, "line", 9),
    ]);

    expect(result.matchedEventCount).toBe(2);
    expect(result.unmatchedEventCount).toBe(0);
    expect(result.discontinuityCount).toBe(1);
  });

  it("invalidates events when the source fingerprint is stale", () => {
    const { projection } = analyzeFlowFixture(parser, SOURCE);
    expect(fingerprintSource(`${SOURCE}\n`)).not.toBe(projection.sourceFingerprint);
    expect(() =>
      projectTraceEventsToFlow(`${SOURCE}\n`, projection, [event(1, "line", 2)]),
    ).toThrow(/指纹不一致/u);
  });

  it("rejects duplicate or invalid sequence numbers", () => {
    const { projection } = analyzeFlowFixture(parser, SOURCE);
    expect(() =>
      projectTraceEventsToFlow(SOURCE, projection, [event(1, "line", 2), event(1, "line", 3)]),
    ).toThrow(/严格递增/u);
  });
});

function event(
  sequence: number,
  kind: TraceEvent["kind"],
  line: number,
  branchTaken: boolean | null = null,
): TraceEvent {
  return Object.freeze({ sequence, kind, line, branchTaken, elapsedMs: sequence });
}

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CParser } from "../../src/core/index.js";
import {
  planFlowConnection,
  type ConnectionIntent,
  type FlowEdge,
  type FlowNode,
  type FlowProjection,
} from "../../src/flow/index.js";
import { createTestParser } from "../core/parser-fixture.js";
import { analyzeFlowFixture, deeplyFrozen } from "./fixture.js";

describe("conservative flow connection planning", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => {
    parser.dispose();
  });

  it("plans a typed replacement without fabricating or applying a C patch", () => {
    const fixture = analyzeFlowFixture(parser, "int f(void) { int x = 0; x++; x += 2; return x; }");
    const increment = nodeBySource(fixture.projection, "x++;");
    const returnNode = nodeBySource(fixture.projection, "return x;");
    const existing = outgoingEdge(fixture.projection, increment, "next");
    const sourceBefore = fixture.document.source;
    const plan = planFlowConnection(
      fixture.projection,
      intent(fixture.projection, increment, returnNode, "next", existing),
    );

    expect(plan.status).toBe("accepted");
    if (plan.status !== "accepted") throw new Error(plan.message);
    expect(plan.operation).toBe("replace");
    expect(plan.cSourcePatch).toBeNull();
    expect(plan.displacedEdgeIds).toEqual([existing.id]);
    expect(plan.candidateEdge).toMatchObject({
      kind: "next",
      from: { nodeId: increment.id },
      to: { nodeId: returnNode.id },
    });
    expect(plan.requiredPostconditions).toEqual([
      "exact-source-diff",
      "source-reparse",
      "source-roundtrip",
      "cfg-edge-match",
      "no-new-partial-cfg",
    ]);
    expect(fixture.document.source).toBe(sourceBefore);
    expect(deeplyFrozen(plan)).toBe(true);
  });

  it("rejects fan-out from an ordinary sequence node", () => {
    const { projection } = analyzeFlowFixture(parser, "int f(void) { int x = 0; x++; return x; }");
    const increment = nodeBySource(projection, "x++;");
    const declaration = nodeBySource(projection, "int x = 0;");
    const plan = planFlowConnection(
      projection,
      intent(projection, increment, declaration, "next", null),
    );

    expect(plan).toEqual(
      expect.objectContaining({ status: "rejected", code: "fan-out-not-supported" }),
    );
  });

  it("keeps if ports independent and requires replacement for an occupied branch", () => {
    const { projection } = analyzeFlowFixture(
      parser,
      "int f(int x) { if (x) x++; else x--; return x; }",
    );
    const branch = nodeBySource(projection, "if (x) x++; else x--;");
    const returnNode = nodeBySource(projection, "return x;");
    const trueEdge = outgoingEdge(projection, branch, "branch-true");
    const falseEdge = outgoingEdge(projection, branch, "branch-false");

    expect(trueEdge.from.portId).not.toBe(falseEdge.from.portId);
    expect(
      planFlowConnection(projection, intent(projection, branch, returnNode, "branch-true", null)),
    ).toEqual(expect.objectContaining({ status: "rejected", code: "port-capacity" }));
    expect(
      planFlowConnection(
        projection,
        intent(projection, branch, returnNode, "branch-true", trueEdge),
      ),
    ).toEqual(
      expect.objectContaining({
        status: "accepted",
        operation: "replace",
        candidateEdge: expect.objectContaining({ kind: "branch-true" }),
      }),
    );
  });

  it("rejects arbitrary cycles while leaving structured loop ports represented", () => {
    const { projection } = analyzeFlowFixture(parser, "int f(void) { int x = 0; x++; return x; }");
    const declaration = nodeBySource(projection, "int x = 0;");
    const increment = nodeBySource(projection, "x++;");
    const incrementNext = outgoingEdge(projection, increment, "next");
    const plan = planFlowConnection(
      projection,
      intent(projection, increment, declaration, "next", incrementNext),
    );

    expect(plan).toEqual(expect.objectContaining({ status: "rejected", code: "unsafe-cycle" }));

    const loopProjection = analyzeFlowFixture(
      parser,
      "int g(int x) { while (x) x--; return x; }",
    ).projection;
    const loop = loopProjection.nodes.find((node) => node.kind === "loop");
    expect(loop?.ports.map((port) => port.edgeKind)).toEqual(
      expect.arrayContaining(["branch-true", "branch-false"]),
    );
  });

  it("fails closed for stale, invalid-port, cross-function and locked-node requests", () => {
    const complete = analyzeFlowFixture(
      parser,
      "#define VALUE 1\nint first(void) { return VALUE; } int second(void) { return 2; }",
    ).projection;
    const firstStart = complete.nodes.find(
      (node) => node.kind === "start" && node.label.includes("first"),
    );
    const secondReturn = nodeBySource(complete, "return 2;");
    if (firstStart === undefined) throw new Error("fixture 缺少 first Start");

    expect(
      planFlowConnection(complete, {
        ...intent(complete, firstStart, secondReturn, "entry", null),
        sourceFingerprint: "stale",
      }),
    ).toEqual(expect.objectContaining({ status: "rejected", code: "stale-source" }));
    expect(
      planFlowConnection(complete, {
        ...intent(complete, firstStart, secondReturn, "entry", null),
        fromPortId: "wrong-port",
      }),
    ).toEqual(expect.objectContaining({ status: "rejected", code: "cross-function" }));

    const sameFunctionReturn = nodeBySource(complete, "return VALUE;");
    expect(
      planFlowConnection(complete, {
        ...intent(complete, firstStart, sameFunctionReturn, "entry", null),
        fromPortId: "wrong-port",
      }),
    ).toEqual(expect.objectContaining({ status: "rejected", code: "unsupported-kind" }));

    const moduleNode = complete.nodes.find((node) => node.kind === "module");
    if (moduleNode === undefined) throw new Error("fixture 缺少 Translation Unit module");
    expect(
      planFlowConnection(complete, intent(complete, moduleNode, sameFunctionReturn, "next", null)),
    ).toEqual(expect.objectContaining({ status: "rejected", code: "locked-node" }));
    expect(
      planFlowConnection(complete, intent(complete, firstStart, moduleNode, "entry", null)),
    ).toEqual(expect.objectContaining({ status: "rejected", code: "locked-node" }));

    const partial = analyzeFlowFixture(
      parser,
      "int broken(void) { goto missing; return 0; }",
    ).projection;
    const start = partial.nodes.find((node) => node.kind === "start");
    const gotoNode = nodeBySource(partial, "goto missing;");
    if (start === undefined) throw new Error("fixture 缺少 partial Start");
    expect(planFlowConnection(partial, intent(partial, start, gotoNode, "entry", null))).toEqual(
      expect.objectContaining({ status: "rejected", code: "locked-node" }),
    );
  });
});

function nodeBySource(projection: FlowProjection, sourceText: string): FlowNode {
  const node = projection.nodes.find((candidate) => candidate.sourceText.trim() === sourceText);
  if (node === undefined) throw new Error(`fixture 找不到节点：${sourceText}`);
  return node;
}

function outgoingEdge(
  projection: FlowProjection,
  node: FlowNode,
  kind: FlowEdge["kind"],
): FlowEdge {
  const edge = projection.edges.find(
    (candidate) => candidate.from.nodeId === node.id && candidate.kind === kind,
  );
  if (edge === undefined) throw new Error(`fixture 找不到边：${node.label} -> ${kind}`);
  return edge;
}

function intent(
  projection: FlowProjection,
  from: FlowNode,
  to: FlowNode,
  kind: FlowEdge["kind"],
  replacement: FlowEdge | null,
): ConnectionIntent {
  const sourcePort = from.ports.find(
    (port) => port.direction === "output" && port.edgeKind === kind,
  );
  const targetPort = to.ports.find((port) => port.direction === "input");
  return {
    sourceFingerprint: projection.sourceFingerprint,
    fromNodeId: from.id,
    fromPortId: sourcePort?.id ?? null,
    toNodeId: to.id,
    toPortId: targetPort?.id ?? null,
    kind,
    replaceEdgeId: replacement?.id ?? null,
  };
}

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeProgramCst, type ProgramAnalysisSnapshot } from "../../src/analysis/index.js";
import { applyTextPatches, type CAnalysisSnapshot, type CParser } from "../../src/core/index.js";
import { createFlowProjection, type FlowNode, type FlowProjection } from "../../src/flow/index.js";
import {
  MAX_FLOW_DRAFT_SOURCE_LENGTH,
  planFlowDraftConnection,
  type FlowDraftConnectionPlanningInput,
} from "../../src/app/flow-draft-connection.js";
import {
  createFlowCanvasDraftConnectionIntent,
  type FlowCanvasDraftConnectionIntent,
  type FlowCanvasDraftNode,
} from "../../src/ui/flow-canvas.js";
import { createTestParser } from "../core/parser-fixture.js";

describe("flow draft safe connection planning", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => {
    parser.dispose();
  });

  it("produces one exact insertion patch before a complete statement-list target", () => {
    const source = "int f(void) {\n  return 0;\n}\n";
    const fixture = analyzeFixture(parser, source);
    const target = nodeBySource(fixture.projection, "return 0;");
    const intent = draftIntent(fixture.projection, target, 'puts("draft");');
    const plan = planFlowDraftConnection({ ...fixture, intent });

    expect(plan.status).toBe("accepted");
    if (plan.status !== "accepted") throw new Error(plan.message);
    expect(plan.patches).toHaveLength(1);
    expect(plan.patches[0]).toEqual({
      range: { from: source.indexOf("  return 0;"), to: source.indexOf("  return 0;") },
      newText: '  puts("draft");\n',
    });
    expect(applyTextPatches(source, plan.patches).source).toBe(
      'int f(void) {\n  puts("draft");\n  return 0;\n}\n',
    );
    expect(plan.requiredPostconditions).toEqual([
      "source-reparse",
      "source-roundtrip",
      "cfg-complete",
      "cfg-draft-before-target",
      "no-new-partial-cfg",
    ]);
    expect(plan.requiresConfirmation).toBe(true);
    expect(fixture.analysis.document.source).toBe(source);
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it("rejects required-body and auxiliary CFG targets instead of guessing an insertion slot", () => {
    const requiredBody = analyzeFixture(
      parser,
      "int f(int x) {\n  if (x) return 1;\n  return 0;\n}\n",
    );
    const bodyReturn = nodeBySource(requiredBody.projection, "return 1;");
    expect(
      planFlowDraftConnection({
        ...requiredBody,
        intent: draftIntent(requiredBody.projection, bodyReturn, "x++;"),
      }),
    ).toEqual(expect.objectContaining({ status: "rejected", code: "unsafe-insertion-slot" }));

    const auxiliary = analyzeFixture(
      parser,
      "int g(int x) {\n  for (int i = 0; i < x; i++) x--;\n  return x;\n}\n",
    );
    const update = auxiliary.projection.nodes.find((node) => node.nodeType === "for_update");
    if (update === undefined) throw new Error("fixture 缺少 for_update 节点");
    expect(
      planFlowDraftConnection({
        ...auxiliary,
        intent: manualIntent(auxiliary.projection, update, "next", "x++;"),
      }),
    ).toEqual(expect.objectContaining({ status: "rejected", code: "invalid-target-port" }));
  });

  it("fails closed for partial CFG, stale source and non-next draft semantics", () => {
    const partial = analyzeFixture(parser, "int broken(void) {\n  goto missing;\n  return 0;\n}\n");
    const target = nodeBySource(partial.projection, "return 0;");
    const partialIntent = manualIntent(partial.projection, target, "next", 'puts("x");');
    expect(planFlowDraftConnection({ ...partial, intent: partialIntent })).toEqual(
      expect.objectContaining({ status: "rejected", code: "locked-target" }),
    );

    const translationUnit = analyzeFixture(
      parser,
      "#include <stdio.h>\nint f(void) {\n  return 0;\n}\n",
    );
    const moduleTarget = translationUnit.projection.nodes.find((node) => node.kind === "module");
    if (moduleTarget === undefined) throw new Error("fixture 缺少 Translation Unit module");
    expect(
      planFlowDraftConnection({
        ...translationUnit,
        intent: manualIntent(translationUnit.projection, moduleTarget, "next", 'puts("x");'),
      }),
    ).toEqual(expect.objectContaining({ status: "rejected", code: "locked-target" }));

    const complete = analyzeFixture(parser, "int f(void) {\n  return 0;\n}\n");
    const completeTarget = nodeBySource(complete.projection, "return 0;");
    const valid = draftIntent(complete.projection, completeTarget, 'puts("x");');
    expect(
      planFlowDraftConnection({
        ...complete,
        intent: Object.freeze({ ...valid, sourceFingerprint: "stale" }),
      }),
    ).toEqual(expect.objectContaining({ status: "rejected", code: "stale-source" }));
    expect(
      planFlowDraftConnection({
        ...complete,
        intent: Object.freeze({ ...valid, edgeKind: "branch-true" }),
      }),
    ).toEqual(expect.objectContaining({ status: "rejected", code: "unsupported-draft-edge" }));
  });

  it("rejects empty or NUL-bearing draft source before patch planning", () => {
    const fixture = analyzeFixture(parser, "int f(void) {\n  return 0;\n}\n");
    const target = nodeBySource(fixture.projection, "return 0;");

    for (const sourceText of [
      "   ",
      'puts("x");\0',
      "x".repeat(MAX_FLOW_DRAFT_SOURCE_LENGTH + 1),
    ]) {
      const plan = planFlowDraftConnection({
        ...fixture,
        intent: manualIntent(fixture.projection, target, "next", sourceText),
      });
      expect(plan).toEqual(expect.objectContaining({ status: "rejected", code: "invalid-draft" }));
    }
  });
});

interface Fixture extends Omit<FlowDraftConnectionPlanningInput, "intent"> {}

function analyzeFixture(parser: CParser, source: string): Fixture {
  const inspected = parser.inspect(source, 4, ({ rootNode, document }) =>
    analyzeProgramCst({ source, revision: 4, rootNode, document }),
  );
  return Object.freeze({
    source,
    analysis: inspected.analysis as CAnalysisSnapshot,
    programAnalysis: inspected.result as ProgramAnalysisSnapshot,
    projection: createFlowProjection(inspected.result, inspected.analysis.document),
  });
}

function nodeBySource(projection: FlowProjection, sourceText: string): FlowNode {
  const node = projection.nodes.find((candidate) => candidate.sourceText.trim() === sourceText);
  if (node === undefined) throw new Error(`fixture 找不到节点：${sourceText}`);
  return node;
}

function draftIntent(
  projection: FlowProjection,
  target: FlowNode,
  sourceText: string,
): FlowCanvasDraftConnectionIntent {
  const draft = draftNode(sourceText);
  const output = draft.ports?.[0];
  const input = target.ports.find((port) => port.direction === "input");
  if (output === undefined || input === undefined) throw new Error("fixture 缺少连接端口");
  const intent = createFlowCanvasDraftConnectionIntent(projection, draft, output, target, input);
  if (intent === null) throw new Error("fixture 草稿 intent 被拒绝");
  return intent;
}

function manualIntent(
  projection: FlowProjection,
  target: FlowNode,
  edgeKind: FlowCanvasDraftConnectionIntent["edgeKind"],
  sourceText: string,
): FlowCanvasDraftConnectionIntent {
  const input = target.ports.find((port) => port.direction === "input");
  return Object.freeze({
    sourceFingerprint: projection.sourceFingerprint,
    draftNodeId: "draft:test",
    draftPortId: "draft:test:out",
    presetId: null,
    sourceText,
    toNodeId: target.id,
    toPortId: input?.id ?? "missing-input",
    edgeKind,
  });
}

function draftNode(sourceText: string): FlowCanvasDraftNode {
  return Object.freeze({
    id: "draft:test",
    label: "测试草稿",
    position: Object.freeze({ x: 40, y: 40 }),
    status: "detached",
    sourceText,
    ports: Object.freeze([
      Object.freeze({
        id: "draft:test:out",
        direction: "output",
        channel: "control",
        edgeKind: "next",
        label: "下一步",
        editable: true,
      }),
    ]),
  });
}

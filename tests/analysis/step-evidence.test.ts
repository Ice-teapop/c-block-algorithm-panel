import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  analyzeProgramCst,
  type DefUseDefinitionEffect,
  type FunctionDefUse,
  type ProgramAnalysisSnapshot,
} from "../../src/analysis/index.js";
import type { CParser } from "../../src/core/index.js";
import { createTestParser } from "../core/parser-fixture.js";

describe("M5a normalized step evidence", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => {
    parser.dispose();
  });

  it("normalizes exact increment, decrement, compound and self-assignment forms", () => {
    const analysis = inspectOne(
      parser,
      [
        "int f(int a, int b, int c, int d, int e, int g, int h, int i, int j) {",
        "  a++; ++b; c--; --d;",
        "  e += 2; g -= 0x2u;",
        "  h = h + 3; i = 04 + i; j = j - 5L;",
        "  return a + b + c + d + e + g + h + i + j;",
        "}",
      ].join("\n"),
    );

    expect(stepForNode(analysis, "a++;", "a")).toMatchObject({
      operator: "add",
      delta: 1,
      form: "postfix",
    });
    expect(stepForNode(analysis, "++b;", "b")).toMatchObject({
      operator: "add",
      delta: 1,
      form: "prefix",
    });
    expect(stepForNode(analysis, "c--;", "c")).toMatchObject({
      operator: "subtract",
      delta: 1,
      form: "postfix",
    });
    expect(stepForNode(analysis, "--d;", "d")).toMatchObject({
      operator: "subtract",
      delta: 1,
      form: "prefix",
    });
    expect(stepForNode(analysis, "e += 2;", "e")).toMatchObject({
      operator: "add",
      delta: 2,
      form: "compound",
    });
    expect(stepForNode(analysis, "g -= 0x2u;", "g")).toMatchObject({
      operator: "subtract",
      delta: 2,
      form: "compound",
    });
    expect(stepForNode(analysis, "h = h + 3;", "h")).toMatchObject({
      operator: "add",
      delta: 3,
      form: "self-assignment",
    });
    expect(stepForNode(analysis, "i = 04 + i;", "i")).toMatchObject({
      operator: "add",
      delta: 4,
      form: "self-assignment",
    });
    expect(stepForNode(analysis, "j = j - 5L;", "j")).toMatchObject({
      operator: "subtract",
      delta: 5,
      form: "self-assignment",
    });
  });

  it.each([
    "int f(int i) { i += 0; return i; }",
    "int f(int i) { i *= 2; return i; }",
    "int f(int i, int j) { i = j + 1; return i; }",
    "int f(int i) { i = 1 - i; return i; }",
    "int f(int i, int stride) { i += stride; return i; }",
    "int f(int i) { i += (int)2; return i; }",
    "int f(int i) { i += 9007199254740992ULL; return i; }",
    "int f(void) { float i = 0; i++; return 0; }",
    "typedef int Index; int f(Index i) { i++; return i; }",
    "int f(void) { const int i = 0; i++; return i; }",
    "int f(void) { volatile int i = 0; i++; return i; }",
  ])("refuses non-canonical or non-clean step evidence: %s", (source) => {
    const analysis = inspectOne(parser, source);
    expect(
      allWrittenDefinitions(analysis.defUse).some((definition) => definition.step !== undefined),
    ).toBe(false);
  });

  it("binds self-assignment evidence to the same variable id", () => {
    const analysis = inspectOne(
      parser,
      "int f(int i) { { int j = 0; i = j + 1; j = j + 1; } return i; }",
    );

    expect(definitionForNode(analysis, "i = j + 1;", "i").step).toBeUndefined();
    expect(stepForNode(analysis, "j = j + 1;", "j")).toMatchObject({
      operator: "add",
      delta: 1,
    });
  });

  it("publishes exact frozen expression evidence without changing other definitions", () => {
    const analysis = inspectOne(parser, "int f(int i) { int x = i; i += 2; return i + x; }");
    const definition = definitionForNode(analysis, "i += 2;", "i");

    expect(
      analysis.source.slice(
        definition.step!.expressionRange.from,
        definition.step!.expressionRange.to,
      ),
    ).toBe("i += 2");
    expect(Object.isFrozen(definition.step)).toBe(true);
    expect(
      analysis.defUse.facts
        .flatMap((fact) => fact.effects)
        .filter((effect): effect is DefUseDefinitionEffect => effect.kind === "def")
        .filter((effect) => effect.id !== definition.id)
        .every((effect) => effect.step === undefined),
    ).toBe(true);
  });
});

interface InspectedFunction {
  readonly source: string;
  readonly snapshot: ProgramAnalysisSnapshot;
  readonly defUse: FunctionDefUse;
}

function inspectOne(parser: CParser, source: string): InspectedFunction {
  return parser.inspect(source, 1, ({ rootNode, document }) => {
    const snapshot = analyzeProgramCst({ source, revision: 1, rootNode, document });
    const defUse = snapshot.defUse[0];
    if (defUse === undefined) throw new Error("fixture 缺少函数 def-use");
    return Object.freeze({ source, snapshot, defUse });
  }).result;
}

function stepForNode(analysis: InspectedFunction, text: string, variableName: string) {
  return definitionForNode(analysis, text, variableName).step;
}

function definitionForNode(
  analysis: InspectedFunction,
  text: string,
  variableName: string,
): DefUseDefinitionEffect {
  const cfg = analysis.snapshot.functions[0];
  const variable = analysis.defUse.variables.find((candidate) => candidate.name === variableName);
  if (cfg === undefined || variable === undefined) throw new Error("fixture 缺少 CFG 或变量");
  const node = cfg.nodes.find(
    (candidate) => analysis.source.slice(candidate.range.from, candidate.range.to).trim() === text,
  );
  if (node === undefined) throw new Error(`找不到 CFG 节点：${text}`);
  const definition = analysis.defUse.facts
    .find((fact) => fact.nodeId === node.id)
    ?.effects.find(
      (effect): effect is DefUseDefinitionEffect =>
        effect.kind === "def" && effect.variableId === variable.id,
    );
  if (definition === undefined) throw new Error(`节点 ${text} 缺少 ${variableName} definition`);
  return definition;
}

function allWrittenDefinitions(defUse: FunctionDefUse): readonly DefUseDefinitionEffect[] {
  return defUse.facts.flatMap((fact) =>
    fact.effects.filter(
      (effect): effect is DefUseDefinitionEffect =>
        effect.kind === "def" && effect.valueState === "written",
    ),
  );
}

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  analyzeProgramCst,
  type FunctionCfg,
  type FunctionDefUse,
  type LoopPredicateFact,
  type LoopVariablePredicateFact,
} from "../../src/analysis/index.js";
import type { CParser } from "../../src/core/index.js";
import { createTestParser } from "../core/parser-fixture.js";

describe("M5a loop predicates", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => {
    parser.dispose();
  });

  it("classifies invariance, single definitions and a canonical for induction variable", () => {
    const analysis = inspectOne(
      parser,
      "int f(int n) { int sum = 0; for (int i = 0; i < n; i++) { sum += i; } return sum; }",
    );

    expect(predicateFor(analysis, 0, "n").isLoopInvariant).toMatchObject({
      verdict: "yes",
      reason: "no-definitions",
      definitionEffectIds: [],
      nodeIds: [],
    });
    expect(predicateFor(analysis, 0, "i").singleDefIn).toMatchObject({
      verdict: "yes",
      reason: "single-definition",
    });
    expect(predicateFor(analysis, 0, "i").isInductionVar).toMatchObject({
      verdict: "yes",
      reason: "induction-variable",
      delta: 1,
    });
    expect(predicateFor(analysis, 0, "sum").isLoopInvariant.verdict).toBe("no");
    expect(predicateFor(analysis, 0, "sum").singleDefIn.verdict).toBe("yes");
  });

  it.each([
    {
      source: "int f(int n) { int i = 0; while (i < n) { i += 2; } return i; }",
      delta: 2,
    },
    {
      source: "int f(int n) { int i = n; do { i = i - 2; } while (i > 0); return i; }",
      delta: -2,
    },
    {
      source: "int f(int n) { int i = 0; do { n--; } while (i++ < n); return i; }",
      delta: 1,
    },
    {
      source: "int f(int n) { for (int i = 0; i < n; i++) { if (i == 2) continue; } return n; }",
      delta: 1,
    },
  ])("accepts a constant step on every continuation path: $source", ({ source, delta }) => {
    const analysis = inspectOne(parser, source);
    const induction = predicateFor(analysis, 0, "i").isInductionVar;

    expect(induction).toMatchObject({
      verdict: "yes",
      reason: "induction-variable",
      delta,
    });
    expect(induction.stepDefinitionEffectId).toBe(induction.definitionEffectIds[0]);
  });

  it.each([
    "int f(int n, int flag) { int i = 0; while (i < n) { if (flag) i++; } return i; }",
    "int f(int n, int flag) { int i = 0; while (i < n) { if (flag) continue; i++; } return i; }",
  ])("rejects a step that can be bypassed before a back-edge: %s", (source) => {
    const induction = predicateFor(inspectOne(parser, source), 0, "i").isInductionVar;

    expect(induction).toMatchObject({
      verdict: "no",
      reason: "step-not-on-every-backedge",
      delta: 1,
    });
  });

  it("counts weak call writes as loop definitions without calling them induction steps", () => {
    const analysis = inspectOne(
      parser,
      "int f(int c, int x) { while (c) { sink(&x); c--; } return x; }",
    );
    const x = predicateFor(analysis, 0, "x");

    expect(x.isLoopInvariant).toMatchObject({ verdict: "no", reason: "has-definitions" });
    expect(x.singleDefIn).toMatchObject({ verdict: "yes", reason: "single-definition" });
    expect(x.isInductionVar).toMatchObject({ verdict: "no", reason: "weak-step" });
  });

  it("returns unknown after a stored-address escape before or inside the loop", () => {
    const before = inspectOne(
      parser,
      "int f(int c, int x) { int *p = &x; while (c && x) c--; return p == 0 ? x : x; }",
    );
    const inside = inspectOne(
      parser,
      "int f(int c, int x) { while (c) { int *p = &x; c--; sink(p); } return x; }",
    );

    for (const analysis of [before, inside]) {
      const fact = predicateFor(analysis, 0, "x");
      expect(fact.isLoopInvariant).toMatchObject({ verdict: "unknown", reason: "escaped" });
      expect(fact.singleDefIn).toMatchObject({ verdict: "unknown", reason: "escaped" });
      expect(fact.isInductionVar).toMatchObject({ verdict: "unknown", reason: "escaped" });
    }
  });

  it("omits arrays and untracked pointers from the scalar predicate domain", () => {
    const analysis = inspectOne(
      parser,
      "int f(int n, int a[4]) { int *p = a; while (n) { a[0] = n; p = a; n--; } return a[0]; }",
    );

    const loop = analysis.defUse.loopPredicates[0];
    const excludedIds = analysis.defUse.variables
      .filter((variable) => variable.name === "a" || variable.name === "p")
      .map((variable) => variable.id);
    if (loop === undefined || excludedIds.length !== 2) throw new Error("fixture 变量异常");

    expect(loop.variables.every((fact) => !excludedIds.includes(fact.variableId))).toBe(true);
  });

  it.each([
    {
      source: "int f(int n) { int i; while (i < n) { i++; } return i; }",
      reason: "uninitialized-entry",
    },
    {
      source: "int f(int n) { int i = 1; while (i < n) { i *= 2; } return i; }",
      reason: "not-constant-step",
    },
    {
      source: "int f(int n) { int i = 0; while (i < n) { i++; i += 2; } return i; }",
      reason: "multiple-definitions",
    },
    {
      source: "int f(int n) { int i = 0; while (i < n) { i++; break; } return i; }",
      reason: "no-backedge",
    },
    {
      source:
        "int f(int n) { int i = 0; while (i < n) { i++; return i; int unreachable = 0; } return i; }",
      reason: "no-backedge",
    },
  ])(
    "rejects incomplete induction evidence with a stable reason: $reason",
    ({ source, reason }) => {
      expect(predicateFor(inspectOne(parser, source), 0, "i").isInductionVar).toMatchObject({
        verdict: "no",
        reason,
      });
    },
  );

  it("does not promote a nested loop step to the outer loop's induction variable", () => {
    const analysis = inspectOne(
      parser,
      "int f(int n) { int i = 0; int c = n; while (c) { for (; i < n; i++) { } c--; } return i; }",
    );

    expect(predicateFor(analysis, 0, "i").isInductionVar).toMatchObject({
      verdict: "no",
      reason: "nested-step",
      delta: 1,
    });
    expect(predicateFor(analysis, 1, "i").isInductionVar).toMatchObject({
      verdict: "yes",
      reason: "induction-variable",
      delta: 1,
    });
  });

  it("publishes no variable conclusions for goto-touched or unreachable loops", () => {
    const touched = inspectOne(
      parser,
      "int f(int n) { int i = 0; while (i < n) { i++; if (i == 2) goto done; } done: return i; }",
    );
    const unreachable = inspectOne(
      parser,
      "int f(int n) { int i = 0; return i; while (i < n) i++; }",
    );

    expect(touched.defUse.loopPredicates[0]?.variables).toEqual([]);
    expect(unreachable.defUse.loopPredicates[0]?.variables).toEqual([]);
  });

  it("keeps shadowed bindings isolated across nested loops", () => {
    const analysis = inspectOne(
      parser,
      "int f(int n) { int i = 0; while (i < n) { for (int i = 0; i < n; i++) { } i++; } return i; }",
    );
    const outerLoop = analysis.defUse.loopPredicates[0];
    const innerLoop = analysis.defUse.loopPredicates[1];
    const outerRegion = analysis.defUse.loopRegions[0];
    const bindings = analysis.defUse.variables.filter((variable) => variable.name === "i");
    if (
      outerLoop === undefined ||
      innerLoop === undefined ||
      outerRegion === undefined ||
      bindings.length !== 2
    ) {
      throw new Error("fixture 缺少 shadowed loop binding");
    }
    const outerBinding = bindings.find((variable) => {
      const declaration = variable.declarationRanges[0];
      return (
        variable.kind === "local" &&
        declaration !== undefined &&
        declaration.from < outerRegion.range.from
      );
    });
    const innerBinding = bindings.find((variable) => variable.id !== outerBinding?.id);
    if (outerBinding === undefined || innerBinding === undefined)
      throw new Error("fixture binding 异常");

    expect(predicateById(outerLoop, outerBinding.id).isInductionVar.verdict).toBe("yes");
    expect(predicateById(innerLoop, innerBinding.id).isInductionVar.verdict).toBe("yes");
    expect(innerLoop.variables.some((fact) => fact.variableId === outerBinding.id)).toBe(false);
  });

  it("does not leak stale or unused entry variables into a loop summary", () => {
    const analysis = inspectOne(
      parser,
      "int f(int n, int x) { { int stale = 1; } int *p = &x; while (n) n--; return p == 0 ? x : x; }",
    );
    const loop = analysis.defUse.loopPredicates[0];
    const excludedIds = analysis.defUse.variables
      .filter((variable) => variable.name === "stale" || variable.name === "x")
      .map((variable) => variable.id);
    if (loop === undefined || excludedIds.length !== 2) throw new Error("fixture 变量异常");

    expect(loop.variables.every((fact) => !excludedIds.includes(fact.variableId))).toBe(true);
    expect(loop.variables.map((fact) => fact.variableId)).toEqual([
      variableId(analysis.defUse, "n"),
    ]);
  });

  it("is aligned with regions, deterministic and deeply frozen", () => {
    const source =
      "int f(int n) { int i = 0; while (i < n) { for (int j = 0; j < n; j++) { } i++; } return i; }";
    const first = inspectOne(parser, source).defUse;
    const second = inspectOne(parser, source).defUse;

    expect(first.loopPredicates).toEqual(second.loopPredicates);
    expect(first.loopPredicates.map((fact) => fact.loopId)).toEqual(
      first.loopRegions.map((loop) => loop.id),
    );
    expect(deeplyFrozen(first.loopPredicates)).toBe(true);
  });

  it("publishes no partial predicates for a disabled function", () => {
    const analysis = inspectOne(
      parser,
      "#define STEP(v) ((v)++)\nint f(int n) { int i = 0; while (i < n) STEP(i); return i; }",
    );

    expect(analysis.defUse.status).toBe("disabled");
    expect(analysis.defUse.loopPredicates).toEqual([]);
  });
});

interface InspectedFunction {
  readonly source: string;
  readonly cfg: FunctionCfg;
  readonly defUse: FunctionDefUse;
}

function inspectOne(parser: CParser, source: string): InspectedFunction {
  return parser.inspect(source, 1, ({ rootNode, document }) => {
    const snapshot = analyzeProgramCst({ source, revision: 1, rootNode, document });
    const cfg = snapshot.functions[0];
    const defUse = snapshot.defUse[0];
    if (cfg === undefined || defUse === undefined) throw new Error("fixture 缺少函数分析");
    return Object.freeze({ source, cfg, defUse });
  }).result;
}

function predicateFor(
  analysis: InspectedFunction,
  loopIndex: number,
  variableName: string,
): LoopVariablePredicateFact {
  const variable = analysis.defUse.variables.find((candidate) => candidate.name === variableName);
  const loop = analysis.defUse.loopPredicates[loopIndex];
  if (variable === undefined || loop === undefined) throw new Error("fixture 缺少 loop 或变量");
  return predicateById(loop, variable.id);
}

function predicateById(loop: LoopPredicateFact, variableId: string): LoopVariablePredicateFact {
  const fact = loop.variables.find((candidate) => candidate.variableId === variableId);
  if (fact === undefined) throw new Error(`loop 缺少变量 predicate：${variableId}`);
  return fact;
}

function variableId(defUse: FunctionDefUse, name: string): string {
  const variable = defUse.variables.find((candidate) => candidate.name === name);
  if (variable === undefined) throw new Error(`fixture 缺少变量：${name}`);
  return variable.id;
}

function deeplyFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((child) => deeplyFrozen(child, seen));
}

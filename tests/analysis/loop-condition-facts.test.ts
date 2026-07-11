import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  analyzeProgramCst,
  type FunctionDefUse,
  type LoopConditionFact,
} from "../../src/analysis/index.js";
import type { CParser } from "../../src/core/index.js";
import { createTestParser } from "../core/parser-fixture.js";

describe("M5a loop condition facts", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => {
    parser.dispose();
  });

  it("publishes exact bare and top-level conjunction comparisons with binding identity", () => {
    const analysis = inspectOne(
      parser,
      [
        "int f(int n) {",
        "  int i = 0;",
        "  while ((i <= 3) && n > -1) { i++; }",
        "  { int i = 0; for (; i < n; i++) { } }",
        "  return i;",
        "}",
      ].join("\n"),
    );
    const [outer, inner] = analysis.defUse.loopConditions;
    if (outer === undefined || inner === undefined) throw new Error("fixture 缺少 loop fact");

    expect(text(analysis, outer.conditionRange)).toBe("((i <= 3) && n > -1)");
    expect(outer.comparisons.map((comparison) => text(analysis, comparison.range))).toEqual([
      "i <= 3",
      "n > -1",
    ]);
    expect(outer.comparisons.map((comparison) => comparison.operator)).toEqual(["<=", ">"]);
    expect(outer.comparisons.map((comparison) => text(analysis, comparison.operatorRange))).toEqual(
      ["<=", ">"],
    );
    expect(outer.comparisons[0]?.right).toMatchObject({ kind: "literal", value: 3 });
    expect(outer.comparisons[1]?.right).toMatchObject({ kind: "literal", value: -1 });
    expect(text(analysis, outer.comparisons[1]?.right.range ?? null)).toBe("-1");
    expect(outer.zeroInitializers).toHaveLength(1);
    expect(text(analysis, outer.zeroInitializers[0]?.valueRange ?? null)).toBe("0");
    expect(outer.comparisons[0]?.left).toMatchObject({
      kind: "variable",
      variableId: outer.zeroInitializers[0]?.variableId,
    });

    expect(text(analysis, inner.conditionRange)).toBe("i < n");
    expect(inner.comparisons[0]).toMatchObject({
      operator: "<",
      left: { kind: "variable" },
      right: { kind: "variable" },
    });
    expect(inner.zeroInitializers).toHaveLength(1);
    expect(inner.zeroInitializers[0]?.variableId).not.toBe(outer.zeroInitializers[0]?.variableId);
    expect(outer.bodyControl).toBe("straight-line");
    expect(inner.bodyControl).toBe("straight-line");
  });

  it("keeps only direct comparisons from a bare comparison or top-level &&", () => {
    const analysis = inspectOne(
      parser,
      [
        "int f(int i, int n) {",
        "  while (i < 3 || n > 0) { i++; }",
        "  while (i + 1 < 3) { i++; }",
        "  while ((i < 3) && n >= 0 && 1 < 2) { i++; }",
        "  return i;",
        "}",
      ].join("\n"),
    );

    expect(analysis.defUse.loopConditions.map((fact) => fact.comparisons.length)).toEqual([
      0, 0, 2,
    ]);
    expect(
      analysis.defUse.loopConditions[2]?.comparisons.map((comparison) =>
        text(analysis, comparison.range),
      ),
    ).toEqual(["i < 3", "n >= 0"]);
  });

  it.each([
    {
      label: "declaration",
      source: "int f(void) { int i = 0; while (i < 3) i++; return i; }",
      expected: 1,
    },
    {
      label: "parenthesized declaration",
      source: "int f(void) { int i = (0); while (i < 3) i++; return i; }",
      expected: 1,
    },
    {
      label: "assignment",
      source: "int f(int i) { i = 0; while (i < 3) i++; return i; }",
      expected: 1,
    },
    {
      label: "non-plain int",
      source: "int f(void) { unsigned int i = 0; while (i < 3) i++; return (int)i; }",
      expected: 0,
    },
    {
      label: "non-decimal zero",
      source: "int f(void) { int i = 00; while (i < 3) i++; return i; }",
      expected: 0,
    },
    {
      label: "multiple reaching definitions",
      source: "int f(int c) { int i; if (c) i = 0; else i = 0; while (i < 3) i++; return i; }",
      expected: 0,
    },
  ])(
    "publishes only a unique external plain-int decimal-zero initializer: $label",
    ({ source, expected }) => {
      const fact = onlyLoop(inspectOne(parser, source).defUse);
      expect(fact.zeroInitializers).toHaveLength(expected);
    },
  );

  it.each([
    {
      label: "simple statements",
      source: "int f(int i) { while (i < 3) { int x = i; i = x + 1; } return i; }",
      expected: "straight-line",
    },
    {
      label: "call only in condition",
      source: "int ready(int); int f(int i) { while (ready(i)) { i++; } return i; }",
      expected: "straight-line",
    },
    {
      label: "nested conditional",
      source: "int f(int i) { while (i < 3) { if (i) i++; } return i; }",
      expected: "complex",
    },
    {
      label: "transfer",
      source: "int f(int i) { while (i < 3) { break; } return i; }",
      expected: "complex",
    },
    {
      label: "call",
      source: "int step(int); int f(int i) { while (i < 3) { i = step(i); } return i; }",
      expected: "complex",
    },
    {
      label: "nested loop",
      source: "int f(int i) { while (i < 3) { while (i < 2) i++; i++; } return i; }",
      expected: "complex",
    },
  ] as const)("classifies loop-body control conservatively: $label", ({ source, expected }) => {
    const fact = inspectOne(parser, source).defUse.loopConditions[0];
    expect(fact?.bodyControl).toBe(expected);
  });

  it("keeps conditionless loops honest and publishes aligned deterministic frozen facts", () => {
    const source =
      "int f(int i) { for (;;) { break; } do { i++; } while (i < 3); while (i > +0) i--; return i; }";
    const first = inspectOne(parser, source).defUse;
    const second = inspectOne(parser, source).defUse;

    expect(first.loopConditions).toEqual(second.loopConditions);
    expect(first.loopConditions.map((fact) => fact.loopId)).toEqual(
      first.loopRegions.map((loop) => loop.id),
    );
    expect(first.loopConditions[0]).toMatchObject({
      conditionRange: null,
      comparisons: [],
      bodyControl: "complex",
    });
    expect(text({ source, defUse: first }, first.loopConditions[1]?.conditionRange ?? null)).toBe(
      "(i < 3)",
    );
    expect(first.loopConditions[2]?.comparisons[0]?.right).toMatchObject({
      kind: "literal",
      value: 0,
    });
    expect(deeplyFrozen(first.loopConditions)).toBe(true);
  });

  it("publishes no partial condition facts for a disabled function", () => {
    const analysis = inspectOne(
      parser,
      "#define STEP(v) ((v)++)\nint f(int i) { while (i < 3) STEP(i); return i; }",
    );

    expect(analysis.defUse.status).toBe("disabled");
    expect(analysis.defUse.loopConditions).toEqual([]);
  });
});

interface InspectedFunction {
  readonly source: string;
  readonly defUse: FunctionDefUse;
}

function inspectOne(parser: CParser, source: string): InspectedFunction {
  return parser.inspect(source, 1, ({ rootNode, document }) => {
    const snapshot = analyzeProgramCst({ source, revision: 1, rootNode, document });
    const defUse = snapshot.defUse[0];
    if (defUse === undefined || snapshot.defUse.length !== 1) {
      throw new Error("fixture 函数数量异常");
    }
    return Object.freeze({ source, defUse });
  }).result;
}

function onlyLoop(defUse: FunctionDefUse): LoopConditionFact {
  const fact = defUse.loopConditions[0];
  if (fact === undefined || defUse.loopConditions.length !== 1) {
    throw new Error("fixture loop 数量异常");
  }
  return fact;
}

function text(
  analysis: InspectedFunction,
  range: { readonly from: number; readonly to: number } | null,
): string {
  return range === null ? "" : analysis.source.slice(range.from, range.to);
}

function deeplyFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((child) => deeplyFrozen(child, seen));
}

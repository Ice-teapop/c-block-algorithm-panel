import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CParser } from "../../../src/core/parser.js";
import {
  planStructuredEdit,
  StructuredEditError,
  type StructuredEditContext,
} from "../../../src/core/editing/engine.js";
import { applyTextPatches } from "../../../src/core/editing/patch.js";
import type {
  BinaryExpressionEditTarget,
  ForStatementEditTarget,
  IfStatementEditTarget,
  LiteralEditTarget,
} from "../../../src/core/editing/targets.js";
import { createTestParser } from "../parser-fixture.js";

const MAX_TEST_BYTES = 4096;
let parser: CParser;

beforeAll(async () => {
  parser = await createTestParser();
});

afterAll(() => {
  parser.dispose();
});

describe("M3a structured edit transaction engine", () => {
  it("replaces exactly one Unicode string literal while preserving BOM and CRLF", () => {
    const source = [
      "\uFEFFint main(void) {",
      '  const char *message = "é😀";',
      "  return 0;",
      "}",
      "",
    ].join("\r\n");
    const context = makeContext(source, 7);
    const target = requireLiteral(context, '"é😀"');
    const plan = planStructuredEdit(context, {
      kind: "literal",
      baseRevision: 7,
      targetId: target.id,
      expectedTargetText: target.text,
      newText: '"中😀"',
    });

    expect(plan.patches).toEqual([{ range: target.range, newText: '"中😀"' }]);
    expect(plan.candidateSource).toBe(source.replace('"é😀"', '"中😀"'));
    expect(plan.candidateSource.startsWith("\uFEFF")).toBe(true);
    expect(plan.candidateSource.match(/\r\n/gu)?.length).toBe(4);
    expect(plan.candidateAnalysis.document.parse.hasError).toBe(false);
    expect(applyTextPatches(plan.candidateSource, plan.inversePatches).source).toBe(source);
    expectDeepFrozen(plan);
  });

  it("rejects stale revisions, ids, expected text and source snapshots", () => {
    const source = "int main(void) { return 1; }\n";
    const context = makeContext(source, 10);
    const target = requireLiteral(context, "1");
    const base = {
      kind: "literal",
      baseRevision: 10,
      targetId: target.id,
      expectedTargetText: target.text,
      newText: "2",
    } as const;

    expectEditCode(() => planStructuredEdit(context, { ...base, baseRevision: 9 }), "STALE_EDIT");
    expectEditCode(
      () => planStructuredEdit(context, { ...base, targetId: "missing" }),
      "STALE_EDIT",
    );
    expectEditCode(
      () => planStructuredEdit(context, { ...base, expectedTargetText: "stale" }),
      "STALE_EDIT",
    );
    expectEditCode(
      () => planStructuredEdit({ ...context, source: source.replace("1", "9") }, base),
      "STALE_EDIT",
    );
  });

  it("rejects no-ops before candidate analysis", () => {
    const source = "int main(void) { return 1; }\n";
    let candidateCalls = 0;
    const baseContext = makeContext(source, 2);
    const target = requireLiteral(baseContext, "1");
    const context: StructuredEditContext = {
      ...baseContext,
      analyzer: {
        analyze(candidate, revision) {
          candidateCalls += 1;
          return parser.analyze(candidate, revision);
        },
      },
    };

    expectEditCode(
      () =>
        planStructuredEdit(context, {
          kind: "literal",
          baseRevision: 2,
          targetId: target.id,
          expectedTargetText: target.text,
          newText: target.text,
        }),
      "NO_OP_EDIT",
    );
    expect(candidateCalls).toBe(0);
  });

  it("rejects a syntax-valid statement injection that no longer forms one literal node", () => {
    const source = "int main(void) { return 1; }\n";
    const context = makeContext(source, 3);
    const target = requireLiteral(context, "1");

    expectEditCode(
      () =>
        planStructuredEdit(context, {
          kind: "literal",
          baseRevision: 3,
          targetId: target.id,
          expectedTargetText: target.text,
          newText: "1; injected(); return 2",
        }),
      "CANDIDATE_SHAPE_CHANGED",
    );
  });

  it("rejects candidate ERROR or MISSING before returning a plan", () => {
    const source = "int main(void) { if (x) return 1; return 0; }\n";
    const context = makeContext(source, 4);
    const target = requireIf(context, "if (x) return 1;");

    expect(() =>
      planStructuredEdit(context, {
        kind: "if-condition",
        baseRevision: 4,
        targetId: target.id,
        expectedTargetText: target.text,
        newCondition: "x +",
      }),
    ).toThrow(/CANDIDATE_(?:PARSE_ERROR|ANALYSIS_FAILED)/u);
  });

  it("edits all for header fields minimally and preserves the body byte-for-byte", () => {
    const source = [
      "int main(void) {",
      "  int sum = 0;",
      "  for (int i = 0; i < 3; i++) { sum += i; }",
      "  return sum;",
      "}",
      "",
    ].join("\r\n");
    const context = makeContext(source, 5);
    const target = requireFor(context);
    const plan = planStructuredEdit(context, {
      kind: "for-fields",
      baseRevision: 5,
      targetId: target.id,
      expectedTargetText: target.text,
      newInitializer: "int i = 1",
      newCondition: " i <= 4",
      newUpdate: " i += 2",
    });

    expect(plan.candidateSource).toContain("for (int i = 1; i <= 4; i += 2)");
    expect(plan.patches.every((patch) => patch.range.to <= target.bodyRange.from)).toBe(true);
    const candidate = plan.candidateAnalysis.editTargets.forStatements.find(
      (item) => item.bodyText === target.bodyText,
    );
    expect(candidate?.bodyText).toBe("{ sum += i; }");
    expect(candidate?.initializerText).toBe("int i = 1");
    expect(candidate?.conditionText).toBe(" i <= 4");
    expect(candidate?.updateText).toBe(" i += 2");
    expect(source.slice(target.bodyRange.from, target.bodyRange.to)).toBe(target.bodyText);
  });

  it("edits an if condition while preserving consequence and alternative exactly", () => {
    const source = "int main(void) { if (x < 2) { yes(); } else { no(); } return 0; }\n";
    const context = makeContext(source, 6);
    const target = requireIf(context, "if (x < 2) { yes(); } else { no(); }");
    const plan = planStructuredEdit(context, {
      kind: "if-condition",
      baseRevision: 6,
      targetId: target.id,
      expectedTargetText: target.text,
      newCondition: "x <= 3",
    });

    expect(plan.candidateSource).toContain("if (x <= 3) { yes(); } else { no(); }");
    const candidate = plan.candidateAnalysis.editTargets.ifStatements.find(
      (item) => item.consequenceText === target.consequenceText,
    );
    expect(candidate?.consequenceText).toBe("{ yes(); }");
    expect(candidate?.alternativeText).toBe("else { no(); }");
    expect(plan.patches.every((patch) => patch.range.to <= target.consequenceRange.from)).toBe(
      true,
    );
  });

  it("uses the binary planner to preserve grouping with minimal parentheses", () => {
    const source = "int main(void) { return a + b + c; }\n";
    const context = makeContext(source, 8);
    const target = requireBinary(context, "a + b + c");
    const plan = planStructuredEdit(context, {
      kind: "binary-operator",
      baseRevision: 8,
      targetId: target.id,
      expectedTargetText: target.text,
      newOperator: "*",
    });

    expect(plan.candidateSource).toBe("int main(void) { return (a + b) * c; }\n");
    expect(plan.patches).toContainEqual({ range: target.operatorRange, newText: "*" });
    expect(plan.candidateAnalysis.document.parse.hasError).toBe(false);
  });

  it("delegates NUL, UTF-8 and maximum-size policy to the required context validator", () => {
    const source = "int main(void) { return 1; }\n";
    const context = makeContext(source, 9);
    const target = requireLiteral(context, "1");

    expectEditCode(
      () =>
        planStructuredEdit(context, {
          kind: "literal",
          baseRevision: 9,
          targetId: target.id,
          expectedTargetText: target.text,
          newText: `"bad\0value"`,
        }),
      "CANDIDATE_SOURCE_REJECTED",
    );
    expectEditCode(
      () =>
        planStructuredEdit(context, {
          kind: "literal",
          baseRevision: 9,
          targetId: target.id,
          expectedTargetText: target.text,
          newText: `"${"x".repeat(MAX_TEST_BYTES)}"`,
        }),
      "CANDIDATE_SOURCE_REJECTED",
    );
  });
});

function makeContext(source: string, revision: number): StructuredEditContext {
  return Object.freeze({
    source,
    analysis: parser.analyze(source, revision),
    analyzer: parser,
    validateSource: strictTestSourceValidator,
  });
}

function strictTestSourceValidator(source: string): void {
  if (source.includes("\0")) throw new Error("NUL");
  if (new TextEncoder().encode(source).length > MAX_TEST_BYTES) throw new Error("too large");
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = source.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new Error("lone high surrogate");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error("lone low surrogate");
    }
  }
}

function requireLiteral(context: StructuredEditContext, text: string): LiteralEditTarget {
  const target = context.analysis.editTargets.literals.find((item) => item.text === text);
  if (target === undefined) throw new Error(`缺少 literal ${JSON.stringify(text)}`);
  return target;
}

function requireBinary(context: StructuredEditContext, text: string): BinaryExpressionEditTarget {
  const target = context.analysis.editTargets.binaryExpressions.find((item) => item.text === text);
  if (target === undefined) throw new Error(`缺少 binary ${JSON.stringify(text)}`);
  return target;
}

function requireFor(context: StructuredEditContext): ForStatementEditTarget {
  const target = context.analysis.editTargets.forStatements[0];
  if (target === undefined) throw new Error("缺少 for target");
  return target;
}

function requireIf(context: StructuredEditContext, text: string): IfStatementEditTarget {
  const target = context.analysis.editTargets.ifStatements.find((item) => item.text === text);
  if (target === undefined) throw new Error(`缺少 if target ${JSON.stringify(text)}`);
  return target;
}

function expectEditCode(operation: () => unknown, code: StructuredEditError["code"]): void {
  try {
    operation();
    throw new Error(`预期 ${code}，但操作成功`);
  } catch (error) {
    expect(error).toBeInstanceOf(StructuredEditError);
    expect((error as StructuredEditError).code).toBe(code);
  }
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeepFrozen(nested, seen);
}

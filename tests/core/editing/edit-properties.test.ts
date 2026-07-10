import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TextRange } from "../../../src/core/model.js";
import type { CParser } from "../../../src/core/parser.js";
import {
  planStructuredEdit,
  type StructuredEditContext,
  type StructuredEditPlan,
  type StructuredEditRequest,
} from "../../../src/core/editing/engine.js";
import { BINARY_OPERATORS, type BinaryOperator } from "../../../src/core/editing/operators.js";
import { applyTextPatches } from "../../../src/core/editing/patch.js";
import type {
  BinaryExpressionEditTarget,
  EditTargetSnapshot,
  ForStatementEditTarget,
  IfStatementEditTarget,
  LiteralEditTarget,
} from "../../../src/core/editing/targets.js";
import { createTestParser } from "../parser-fixture.js";

const projectRoot = resolve(import.meta.dirname, "../../..");
const samplesRoot = resolve(projectRoot, "samples");
const sourceByteLimit = 512 * 1024;
const propertyRuns = 100;
const propertySeed = 0x3a_2026;
const newlineArbitrary = fc.constantFrom("\n", "\r\n");
const revisionArbitrary = fc.integer({ min: 0, max: 10_000 });
const replacementOperators = BINARY_OPERATORS.filter((operator) => operator !== "+");
const replacementNumberArbitrary = fc
  .integer({ min: 0, max: 100_000 })
  .filter((value) => value !== 31_415);

let parser: CParser;

beforeAll(async () => {
  parser = await createTestParser();
});

afterAll(() => {
  parser.dispose();
});

describe("M3a P3/P4 structured-edit properties", () => {
  it("preserves every character outside generated literal patches", () => {
    fc.assert(
      fc.property(
        newlineArbitrary,
        revisionArbitrary,
        replacementNumberArbitrary,
        (newline, revision, replacement) => {
          const source = withUnicodePreamble(
            ["int value(void) {", "  return 31415;", "}", ""],
            newline,
          );
          const context = makeContext(source, revision);
          const target = requireLiteral(context.analysis.editTargets, "31415");
          const plan = planStructuredEdit(context, {
            kind: "literal",
            baseRevision: revision,
            targetId: target.id,
            expectedTargetText: target.text,
            newText: String(replacement),
          });

          assertP3P4(source, plan, [target.range], newline);
          expect(plan.patches).toEqual([{ range: target.range, newText: String(replacement) }]);
        },
      ),
      { numRuns: propertyRuns, seed: propertySeed },
    );
  });

  it("preserves grouping and P3/P4 for generated binary operator edits", () => {
    fc.assert(
      fc.property(
        newlineArbitrary,
        revisionArbitrary,
        fc.constantFrom(...replacementOperators),
        (newline, revision, newOperator) => {
          const source = withUnicodePreamble(
            ["int value(int a, int b, int c) {", "  return a + b + c;", "}", ""],
            newline,
          );
          const context = makeContext(source, revision);
          const target = requireBinary(context.analysis.editTargets, "a + b + c");
          const plan = planStructuredEdit(context, {
            kind: "binary-operator",
            baseRevision: revision,
            targetId: target.id,
            expectedTargetText: target.text,
            newOperator,
          });

          assertP3P4(source, plan, [target.range], newline);
          expect(plan.patches).toContainEqual({
            range: target.operatorRange,
            newText: newOperator,
          });
        },
      ),
      { numRuns: propertyRuns, seed: propertySeed + 1 },
    );
  });

  it("keeps for bodies untouched across generated three-field edits", () => {
    fc.assert(
      fc.property(
        newlineArbitrary,
        revisionArbitrary,
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 4, max: 99 }),
        fc.integer({ min: 2, max: 9 }),
        (newline, revision, initial, bound, step) => {
          const source = withUnicodePreamble(
            [
              "int value(void) {",
              "  int sum = 0;",
              "  for (int i = 0; i < 3; i++) { sum += i; }",
              "  return sum;",
              "}",
              "",
            ],
            newline,
          );
          const context = makeContext(source, revision);
          const target = requireFor(context.analysis.editTargets);
          const plan = planStructuredEdit(context, {
            kind: "for-fields",
            baseRevision: revision,
            targetId: target.id,
            expectedTargetText: target.text,
            newInitializer: `int i = ${String(initial)}`,
            newCondition: ` i < ${String(bound)}`,
            newUpdate: ` i += ${String(step)}`,
          });

          assertP3P4(
            source,
            plan,
            [target.initializerRange, target.conditionRange, target.updateRange],
            newline,
          );
          expect(plan.patches.every((patch) => patch.range.to <= target.bodyRange.from)).toBe(true);
          expect(source.slice(target.bodyRange.from, target.bodyRange.to)).toBe(target.bodyText);
        },
      ),
      { numRuns: propertyRuns, seed: propertySeed + 2 },
    );
  });

  it("keeps if branches untouched across generated condition edits", () => {
    fc.assert(
      fc.property(
        newlineArbitrary,
        revisionArbitrary,
        fc.constantFrom("<=", ">", ">=", "==", "!="),
        fc.integer({ min: 3, max: 999 }),
        (newline, revision, operator, limit) => {
          const source = withUnicodePreamble(
            ["int value(int x) {", "  if (x < 2) { return 1; } else { return 0; }", "}", ""],
            newline,
          );
          const context = makeContext(source, revision);
          const target = requireIf(context.analysis.editTargets);
          const plan = planStructuredEdit(context, {
            kind: "if-condition",
            baseRevision: revision,
            targetId: target.id,
            expectedTargetText: target.text,
            newCondition: `x ${operator} ${String(limit)}`,
          });

          assertP3P4(source, plan, [target.conditionRange], newline);
          expect(
            plan.patches.every((patch) => patch.range.to <= target.consequenceRange.from),
          ).toBe(true);
          expect(source.slice(target.bodyRange.from, target.bodyRange.to)).toBe(target.bodyText);
        },
      ),
      { numRuns: propertyRuns, seed: propertySeed + 3 },
    );
  });

  it("covers all 18 operator replacements with a real parser", () => {
    for (const newOperator of BINARY_OPERATORS) {
      const oldOperator: BinaryOperator = newOperator === "+" ? "-" : "+";
      const expression = `a ${oldOperator} b ${oldOperator} c`;
      const source = withUnicodePreamble(
        ["int value(int a, int b, int c) {", `  return ${expression};`, "}", ""],
        "\r\n",
      );
      const context = makeContext(source, 20_000 + BINARY_OPERATORS.indexOf(newOperator));
      const target = requireBinary(context.analysis.editTargets, expression);
      const plan = planStructuredEdit(context, {
        kind: "binary-operator",
        baseRevision: context.analysis.editTargets.revision,
        targetId: target.id,
        expectedTargetText: target.text,
        newOperator,
      });

      assertP3P4(source, plan, [target.range], "\r\n");
      expect(plan.patches).toContainEqual({
        range: target.operatorRange,
        newText: newOperator,
      });
    }
  });
});

describe("M3a sample corpus edit round-trip", () => {
  it("plans, reparses and exactly reverses every target-bearing sample it edits", () => {
    const samplePaths = readdirSync(samplesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(samplesRoot, entry.name, "main.c"))
      .sort();
    const totals = {
      files: samplePaths.length,
      targetFiles: 0,
      editedFiles: 0,
      commentSeamRejections: 0,
      conservativeRefusalFiles: 0,
      literals: 0,
      binaries: 0,
      fors: 0,
      ifs: 0,
    };

    for (const [index, samplePath] of samplePaths.entries()) {
      const source = readFileSync(samplePath, "utf8");
      const revision = 30_000 + index;
      const context = makeContext(source, revision);
      const snapshot = context.analysis.editTargets;
      totals.literals += snapshot.literals.length;
      totals.binaries += snapshot.binaryExpressions.length;
      totals.fors += snapshot.forStatements.length;
      totals.ifs += snapshot.ifStatements.length;
      if (targetCount(snapshot) === 0) continue;
      totals.targetFiles += 1;

      const attempts = safeSampleRequests(snapshot, revision);
      let completed = false;
      for (const attempt of attempts) {
        try {
          const plan = planStructuredEdit(context, attempt.request);
          assertP3P4(source, plan, attempt.allowedRanges, detectNewline(source));
          totals.editedFiles += 1;
          completed = true;
          break;
        } catch (error) {
          if (error instanceof Error && error.message.includes("AMBIGUOUS_COMMENT_SEAM")) {
            totals.commentSeamRejections += 1;
            continue;
          }
          throw new Error(`样本 ${samplePath} 编辑验收失败`, { cause: error });
        }
      }
      if (!completed && attempts.length > 0) {
        // Every attempted operation was the one explicitly permitted conservative refusal.
        totals.conservativeRefusalFiles += 1;
        continue;
      }
      if (attempts.length === 0) {
        throw new Error(`样本 ${samplePath} 有 edit target，但没有安全验收操作`);
      }
    }

    console.info(
      `[M3a samples] files=${String(totals.files)} targetFiles=${String(totals.targetFiles)} ` +
        `editedFiles=${String(totals.editedFiles)} commentSeamRejections=${String(totals.commentSeamRejections)} ` +
        `conservativeRefusalFiles=${String(totals.conservativeRefusalFiles)} ` +
        `targets(literal=${String(totals.literals)},binary=${String(totals.binaries)},for=${String(totals.fors)},if=${String(totals.ifs)})`,
    );
    expect(totals.files).toBeGreaterThanOrEqual(20);
    expect(totals.targetFiles).toBeGreaterThan(0);
    expect(totals.editedFiles + totals.conservativeRefusalFiles).toBe(totals.targetFiles);
  });
});

interface SampleAttempt {
  readonly request: StructuredEditRequest;
  readonly allowedRanges: readonly TextRange[];
}

function safeSampleRequests(
  snapshot: EditTargetSnapshot,
  revision: number,
): readonly SampleAttempt[] {
  const attempts: SampleAttempt[] = [];
  for (const target of snapshot.literals) {
    attempts.push({
      request: {
        kind: "literal",
        baseRevision: revision,
        targetId: target.id,
        expectedTargetText: target.text,
        newText: safeLiteralReplacement(target),
      },
      allowedRanges: [target.range],
    });
  }
  for (const target of snapshot.binaryExpressions) {
    attempts.push({
      request: {
        kind: "binary-operator",
        baseRevision: revision,
        targetId: target.id,
        expectedTargetText: target.text,
        newOperator: siblingOperator(target.operatorText),
      },
      allowedRanges: [target.range],
    });
  }
  for (const target of snapshot.forStatements) {
    const nextCondition = target.conditionEmpty ? "1" : parenthesizeField(target.conditionText);
    attempts.push({
      request: {
        kind: "for-fields",
        baseRevision: revision,
        targetId: target.id,
        expectedTargetText: target.text,
        newInitializer: target.initializerText,
        newCondition: nextCondition,
        newUpdate: target.updateText,
      },
      allowedRanges: [target.conditionRange],
    });
  }
  for (const target of snapshot.ifStatements) {
    attempts.push({
      request: {
        kind: "if-condition",
        baseRevision: revision,
        targetId: target.id,
        expectedTargetText: target.text,
        newCondition: parenthesizeField(target.conditionText),
      },
      allowedRanges: [target.conditionRange],
    });
  }
  return attempts;
}

function safeLiteralReplacement(target: LiteralEditTarget): string {
  if (target.literalKind === "number") return target.text === "0" ? "1" : "0";
  if (target.literalKind === "char") return target.text === "'x'" ? "'y'" : "'x'";
  return target.text === '"m3a"' ? '"m3b"' : '"m3a"';
}

function siblingOperator(operator: string): BinaryOperator {
  const siblings: Readonly<Record<string, BinaryOperator>> = Object.freeze({
    "*": "/",
    "/": "*",
    "%": "*",
    "+": "-",
    "-": "+",
    "<<": ">>",
    ">>": "<<",
    "<": ">",
    "<=": ">=",
    ">": "<",
    ">=": "<=",
    "==": "!=",
    "!=": "==",
    "&": "^",
    "^": "&",
    "|": "^",
    "&&": "||",
    "||": "&&",
  });
  const replacement = siblings[operator];
  if (replacement === undefined)
    throw new Error(`未知 binary operator ${JSON.stringify(operator)}`);
  return replacement;
}

function parenthesizeField(text: string): string {
  const leading = text.match(/^\s*/u)?.[0] ?? "";
  const trailing = text.match(/\s*$/u)?.[0] ?? "";
  const interior = text.slice(leading.length, text.length - trailing.length);
  return `${leading}(${interior})${trailing}`;
}

function assertP3P4(
  source: string,
  plan: StructuredEditPlan,
  allowedRanges: readonly TextRange[],
  newline: "\n" | "\r\n",
): void {
  for (const patch of plan.patches) {
    expect(allowedRanges.some((allowed) => rangeWithin(patch.range, allowed))).toBe(true);
  }
  assertUntouchedFragments(source, plan);
  expect(plan.candidateAnalysis.document.parse.hasError).toBe(false);
  expect(plan.candidateAnalysis.document.parse.errorRanges).toEqual([]);
  expect(plan.candidateAnalysis.document.parse.missingOffsets).toEqual([]);
  expect(applyTextPatches(plan.candidateSource, plan.inversePatches).source).toBe(source);

  if (source.startsWith("\uFEFF")) {
    expect(plan.candidateSource.startsWith("\uFEFF")).toBe(true);
    expect(plan.candidateSource).toContain("中😀");
  }
  expect(countOccurrences(plan.candidateSource, newline)).toBe(countOccurrences(source, newline));
}

function assertUntouchedFragments(source: string, plan: StructuredEditPlan): void {
  let beforeCursor = 0;
  let afterCursor = 0;
  for (const diff of plan.diffs) {
    expect(source.slice(diff.beforeRange.from, diff.beforeRange.to)).toBe(diff.beforeText);
    expect(plan.candidateSource.slice(diff.afterRange.from, diff.afterRange.to)).toBe(
      diff.afterText,
    );
    expect(source.slice(beforeCursor, diff.beforeRange.from)).toBe(
      plan.candidateSource.slice(afterCursor, diff.afterRange.from),
    );
    beforeCursor = diff.beforeRange.to;
    afterCursor = diff.afterRange.to;
  }
  expect(source.slice(beforeCursor)).toBe(plan.candidateSource.slice(afterCursor));
}

function rangeWithin(inner: TextRange, outer: TextRange): boolean {
  return outer.from <= inner.from && inner.to <= outer.to;
}

function withUnicodePreamble(lines: readonly string[], newline: "\n" | "\r\n"): string {
  return `\uFEFF// 中😀${newline}${lines.join(newline)}`;
}

function makeContext(source: string, revision: number): StructuredEditContext {
  return Object.freeze({
    source,
    analysis: parser.analyze(source, revision),
    analyzer: parser,
    validateSource,
  });
}

function validateSource(source: string): void {
  if (source.includes("\0")) throw new Error("NUL");
  if (new TextEncoder().encode(source).length > sourceByteLimit)
    throw new Error("source too large");
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

function requireLiteral(snapshot: EditTargetSnapshot, text: string): LiteralEditTarget {
  const target = snapshot.literals.find((candidate) => candidate.text === text);
  if (target === undefined) throw new Error(`缺少 literal ${JSON.stringify(text)}`);
  return target;
}

function requireBinary(snapshot: EditTargetSnapshot, text: string): BinaryExpressionEditTarget {
  const target = snapshot.binaryExpressions.find((candidate) => candidate.text === text);
  if (target === undefined) throw new Error(`缺少 binary ${JSON.stringify(text)}`);
  return target;
}

function requireFor(snapshot: EditTargetSnapshot): ForStatementEditTarget {
  const target = snapshot.forStatements[0];
  if (target === undefined) throw new Error("缺少 for target");
  return target;
}

function requireIf(snapshot: EditTargetSnapshot): IfStatementEditTarget {
  const target = snapshot.ifStatements[0];
  if (target === undefined) throw new Error("缺少 if target");
  return target;
}

function targetCount(snapshot: EditTargetSnapshot): number {
  return (
    snapshot.literals.length +
    snapshot.binaryExpressions.length +
    snapshot.forStatements.length +
    snapshot.ifStatements.length
  );
}

function detectNewline(source: string): "\n" | "\r\n" {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

function countOccurrences(source: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let position = 0;
  while (position <= source.length - needle.length) {
    const found = source.indexOf(needle, position);
    if (found < 0) break;
    count += 1;
    position = found + needle.length;
  }
  return count;
}

import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Language, Parser, type Tree } from "web-tree-sitter";
import { textRange, type TextRange } from "../../../src/core/model.js";
import {
  BINARY_OPERATORS,
  BINARY_OPERATOR_PRECEDENCE,
  planBinaryOperatorPatches,
  precedence,
  type BinaryOperator,
} from "../../../src/core/editing/operators.js";
import { applyTextPatches } from "../../../src/core/editing/patch.js";
import {
  extractEditTargets,
  type BinaryExpressionEditTarget,
  type EditTargetSnapshot,
} from "../../../src/core/editing/targets.js";

const projectRoot = resolve(import.meta.dirname, "../../..");
let parser: Parser;

beforeAll(async () => {
  const runtimeWasmUrl = resolve(projectRoot, "resources/wasm/web-tree-sitter.wasm");
  await Parser.init({ locateFile: () => runtimeWasmUrl });
  const language = await Language.load(resolve(projectRoot, "resources/wasm/tree-sitter-c.wasm"));
  parser = new Parser();
  parser.setLanguage(language);
});

afterAll(() => {
  parser.delete();
});

describe("M3a binary operator patch planning", () => {
  it("exports exactly the 18 C binary operators with standard precedence", () => {
    expect(new Set(BINARY_OPERATORS).size).toBe(18);
    expect(BINARY_OPERATORS).toEqual([
      "*",
      "/",
      "%",
      "+",
      "-",
      "<<",
      ">>",
      "<",
      "<=",
      ">",
      ">=",
      "==",
      "!=",
      "&",
      "^",
      "|",
      "&&",
      "||",
    ]);
    for (const operator of BINARY_OPERATORS) {
      expect(precedence(operator)).toBe(expectedPrecedence(operator));
      expect(BINARY_OPERATOR_PRECEDENCE[operator]).toBe(expectedPrecedence(operator));
    }
  });

  it("replaces only the exact operator range for all 18 operators", () => {
    for (const next of BINARY_OPERATORS) {
      const fixture = makeAtomicFixture(differentOperator(next));
      const patches = planBinaryOperatorPatches(
        fixture.source,
        fixture.snapshot,
        fixture.target.id,
        next,
      );
      expect(patches).toHaveLength(1);
      expect(patches[0]).toEqual({ range: fixture.target.operatorRange, newText: next });
      expect(applyTextPatches(fixture.source, patches).source).toBe(`a${next}b`);
    }
  });

  it("covers every new operator against every left and right binary operand precedence", () => {
    for (const next of BINARY_OPERATORS) {
      for (const childOperator of BINARY_OPERATORS) {
        for (const side of ["left", "right"] as const) {
          const fixture = makeOperandFixture(side, childOperator, differentOperator(next));
          const patches = planBinaryOperatorPatches(
            fixture.source,
            fixture.snapshot,
            fixture.target.id,
            next,
          );
          const child = `a${childOperator}b`;
          const needsWrap =
            expectedPrecedence(childOperator) < expectedPrecedence(next) ||
            (side === "right" && expectedPrecedence(childOperator) === expectedPrecedence(next));
          const expectedChild = needsWrap ? `(${child})` : child;
          const expected =
            side === "left" ? `${expectedChild}${next}c` : `a${next}${expectedChild}`;
          expect(applyTextPatches(fixture.source, patches).source).toBe(expected);
        }
      }
    }
  });

  it("covers every new operator against every left and right binary parent precedence", () => {
    for (const next of BINARY_OPERATORS) {
      for (const parentOperator of BINARY_OPERATORS) {
        for (const side of ["left", "right"] as const) {
          const fixture = makeParentFixture(side, parentOperator, differentOperator(next));
          const patches = planBinaryOperatorPatches(
            fixture.source,
            fixture.snapshot,
            fixture.target.id,
            next,
          );
          const editedTarget = `a${next}b`;
          const needsWrap =
            expectedPrecedence(next) < expectedPrecedence(parentOperator) ||
            (side === "right" && expectedPrecedence(next) === expectedPrecedence(parentOperator));
          const groupedTarget = needsWrap ? `(${editedTarget})` : editedTarget;
          const expected =
            side === "left"
              ? `${groupedTarget}${parentOperator}c`
              : `c${parentOperator}${groupedTarget}`;
          expect(applyTextPatches(fixture.source, patches).source).toBe(expected);
        }
      }
    }
  });

  it("turns the outer plus in a+b+c into (a+b)*c", () => {
    const source = "int x = a + b + c;\n";
    const snapshot = extractAndDelete(source, 1);
    const outer = requireBinary(snapshot, "a + b + c");
    const patches = planBinaryOperatorPatches(source, snapshot, outer.id, "*");

    expect(applyTextPatches(source, patches).source).toBe("int x = (a + b) * c;\n");
    expect(patches).toContainEqual({ range: outer.operatorRange, newText: "*" });
  });

  it("does not duplicate existing operand or parent parentheses", () => {
    const operandSource = "int x = (a + b) + c;\n";
    const operandSnapshot = extractAndDelete(operandSource, 2);
    const outer = requireBinary(operandSnapshot, "(a + b) + c");
    const operandPatches = planBinaryOperatorPatches(operandSource, operandSnapshot, outer.id, "*");
    expect(applyTextPatches(operandSource, operandPatches).source).toBe("int x = (a + b) * c;\n");

    const parentSource = "int x = (a + b) * c;\n";
    const parentSnapshot = extractAndDelete(parentSource, 3);
    const inner = requireBinary(parentSnapshot, "a + b");
    const parentPatches = planBinaryOperatorPatches(parentSource, parentSnapshot, inner.id, "||");
    expect(applyTextPatches(parentSource, parentPatches).source).toBe("int x = (a || b) * c;\n");
  });

  it("rejects comment-bearing operand and parent seams before returning any patch", () => {
    const operandSource = "int x = a + /* seam */ b * c;\n";
    const operandSnapshot = extractAndDelete(operandSource, 4);
    const operandTarget = requireBinary(operandSnapshot, "a + /* seam */ b * c");
    expect(() =>
      planBinaryOperatorPatches(operandSource, operandSnapshot, operandTarget.id, "*"),
    ).toThrow(/AMBIGUOUS_COMMENT_SEAM/u);

    const parentSource = "int x = a + b /* seam */ + c;\n";
    const parentSnapshot = extractAndDelete(parentSource, 5);
    const parentTarget = requireBinary(parentSnapshot, "a + b");
    expect(() =>
      planBinaryOperatorPatches(parentSource, parentSnapshot, parentTarget.id, "||"),
    ).toThrow(/AMBIGUOUS_COMMENT_SEAM/u);
  });

  it("allows comments inside a grouped operand when the actual insertion seam is clear", () => {
    const source = "int x = a /* inner */ + b + c;\n";
    const snapshot = extractAndDelete(source, 6);
    const target = requireBinary(snapshot, "a /* inner */ + b + c");
    const patches = planBinaryOperatorPatches(source, snapshot, target.id, "*");

    expect(applyTextPatches(source, patches).source).toBe("int x = (a /* inner */ + b) * c;\n");
  });

  it("rejects unsupported operators, unknown ids and stale source snapshots", () => {
    const fixture = makeAtomicFixture("+");
    expect(() =>
      planBinaryOperatorPatches(fixture.source, fixture.snapshot, fixture.target.id, "="),
    ).toThrow(/INVALID_BINARY_OPERATOR/u);
    expect(() =>
      planBinaryOperatorPatches(fixture.source, fixture.snapshot, "missing", "*"),
    ).toThrow(/UNKNOWN_BINARY_TARGET/u);
    expect(() =>
      planBinaryOperatorPatches("x+y", fixture.snapshot, fixture.target.id, "*"),
    ).toThrow(/STALE_EDIT_TARGET/u);
  });
});

interface BinaryFixture {
  readonly source: string;
  readonly snapshot: EditTargetSnapshot;
  readonly target: BinaryExpressionEditTarget;
}

function makeAtomicFixture(current: BinaryOperator): BinaryFixture {
  const source = `a${current}b`;
  const leftRange = textRange(0, 1);
  const operatorRange = textRange(1, 1 + current.length);
  const rightRange = textRange(operatorRange.to, source.length);
  const target = makeTarget({
    source,
    id: "target",
    range: textRange(0, source.length),
    leftRange,
    operatorRange,
    rightRange,
    operator: current,
  });
  return { source, target, snapshot: makeSnapshot([target]) };
}

function makeOperandFixture(
  side: "left" | "right",
  childOperator: BinaryOperator,
  current: BinaryOperator,
): BinaryFixture {
  const childText = `a${childOperator}b`;
  const source = side === "left" ? `${childText}${current}c` : `a${current}${childText}`;
  const childRange =
    side === "left" ? textRange(0, childText.length) : textRange(1 + current.length, source.length);
  const targetOperatorRange =
    side === "left"
      ? textRange(childText.length, childText.length + current.length)
      : textRange(1, 1 + current.length);
  const targetLeftRange = side === "left" ? childRange : textRange(0, 1);
  const targetRightRange =
    side === "left" ? textRange(targetOperatorRange.to, source.length) : childRange;
  const target = makeTarget({
    source,
    id: "target",
    range: textRange(0, source.length),
    leftRange: targetLeftRange,
    leftNodeType: side === "left" ? "binary_expression" : "identifier",
    operatorRange: targetOperatorRange,
    rightRange: targetRightRange,
    rightNodeType: side === "right" ? "binary_expression" : "identifier",
    operator: current,
  });
  const childOperatorFrom = childRange.from + 1;
  const child = makeTarget({
    source,
    id: "child",
    range: childRange,
    leftRange: textRange(childRange.from, childRange.from + 1),
    operatorRange: textRange(childOperatorFrom, childOperatorFrom + childOperator.length),
    rightRange: textRange(childOperatorFrom + childOperator.length, childRange.to),
    operator: childOperator,
    parentBinaryId: target.id,
    parentSide: side,
  });
  return { source, target, snapshot: makeSnapshot([target, child]) };
}

function makeParentFixture(
  side: "left" | "right",
  parentOperator: BinaryOperator,
  current: BinaryOperator,
): BinaryFixture {
  const targetText = `a${current}b`;
  const source =
    side === "left" ? `${targetText}${parentOperator}c` : `c${parentOperator}${targetText}`;
  const targetRange =
    side === "left"
      ? textRange(0, targetText.length)
      : textRange(1 + parentOperator.length, source.length);
  const targetOperatorFrom = targetRange.from + 1;
  const target = makeTarget({
    source,
    id: "target",
    range: targetRange,
    leftRange: textRange(targetRange.from, targetRange.from + 1),
    operatorRange: textRange(targetOperatorFrom, targetOperatorFrom + current.length),
    rightRange: textRange(targetOperatorFrom + current.length, targetRange.to),
    operator: current,
    parentBinaryId: "parent",
    parentSide: side,
  });

  const parentOperatorRange =
    side === "left"
      ? textRange(targetRange.to, targetRange.to + parentOperator.length)
      : textRange(1, 1 + parentOperator.length);
  const parent = makeTarget({
    source,
    id: "parent",
    range: textRange(0, source.length),
    leftRange: side === "left" ? targetRange : textRange(0, 1),
    leftNodeType: side === "left" ? "binary_expression" : "identifier",
    operatorRange: parentOperatorRange,
    rightRange: side === "left" ? textRange(parentOperatorRange.to, source.length) : targetRange,
    rightNodeType: side === "right" ? "binary_expression" : "identifier",
    operator: parentOperator,
  });
  return { source, target, snapshot: makeSnapshot([parent, target]) };
}

interface TargetParts {
  readonly source: string;
  readonly id: string;
  readonly range: TextRange;
  readonly leftRange: TextRange;
  readonly leftNodeType?: string;
  readonly operatorRange: TextRange;
  readonly rightRange: TextRange;
  readonly rightNodeType?: string;
  readonly operator: BinaryOperator;
  readonly parentBinaryId?: string | null;
  readonly parentSide?: "left" | "right" | null;
}

function makeTarget(parts: TargetParts): BinaryExpressionEditTarget {
  return Object.freeze({
    id: parts.id,
    revision: 1,
    kind: "binary-expression",
    nodeType: "binary_expression",
    range: parts.range,
    text: slice(parts.source, parts.range),
    leftNodeType: parts.leftNodeType ?? "identifier",
    leftRange: parts.leftRange,
    leftText: slice(parts.source, parts.leftRange),
    operatorRange: parts.operatorRange,
    operatorText: parts.operator,
    rightNodeType: parts.rightNodeType ?? "identifier",
    rightRange: parts.rightRange,
    rightText: slice(parts.source, parts.rightRange),
    parentBinaryId: parts.parentBinaryId ?? null,
    parentSide: parts.parentSide ?? null,
  });
}

function makeSnapshot(
  binaryExpressions: readonly BinaryExpressionEditTarget[],
): EditTargetSnapshot {
  return Object.freeze({
    revision: 1,
    literals: Object.freeze([]),
    binaryExpressions: Object.freeze([...binaryExpressions]),
    forStatements: Object.freeze([]),
    ifStatements: Object.freeze([]),
  });
}

function differentOperator(operator: BinaryOperator): BinaryOperator {
  return operator === "+" ? "-" : "+";
}

function expectedPrecedence(operator: BinaryOperator): number {
  if (operator === "*" || operator === "/" || operator === "%") return 10;
  if (operator === "+" || operator === "-") return 9;
  if (operator === "<<" || operator === ">>") return 8;
  if (operator === "<" || operator === "<=" || operator === ">" || operator === ">=") return 7;
  if (operator === "==" || operator === "!=") return 6;
  if (operator === "&") return 5;
  if (operator === "^") return 4;
  if (operator === "|") return 3;
  if (operator === "&&") return 2;
  return 1;
}

function extractAndDelete(source: string, revision: number): EditTargetSnapshot {
  const tree = requireTree(source);
  try {
    return extractEditTargets(tree.rootNode, source, revision);
  } finally {
    tree.delete();
  }
}

function requireTree(source: string): Tree {
  const tree = parser.parse(source);
  if (tree === null) throw new Error("tree-sitter 未返回语法树");
  return tree;
}

function requireBinary(snapshot: EditTargetSnapshot, text: string): BinaryExpressionEditTarget {
  const target = snapshot.binaryExpressions.find((candidate) => candidate.text === text);
  if (target === undefined) throw new Error(`缺少 binary target ${JSON.stringify(text)}`);
  return target;
}

function slice(source: string, range: TextRange): string {
  return source.slice(range.from, range.to);
}

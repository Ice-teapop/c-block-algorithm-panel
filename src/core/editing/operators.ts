import { textRange, type TextRange } from "../model.js";
import { createTextPatch } from "./patch.js";
import type { TextPatch } from "./model.js";
import type { BinaryExpressionEditTarget, EditTargetSnapshot } from "./targets.js";

export const BINARY_OPERATORS = Object.freeze([
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
] as const);

export type BinaryOperator = (typeof BINARY_OPERATORS)[number];

/** Larger values bind more tightly. Every supported C binary operator is left-associative. */
export const BINARY_OPERATOR_PRECEDENCE: Readonly<Record<BinaryOperator, number>> = Object.freeze({
  "*": 10,
  "/": 10,
  "%": 10,
  "+": 9,
  "-": 9,
  "<<": 8,
  ">>": 8,
  "<": 7,
  "<=": 7,
  ">": 7,
  ">=": 7,
  "==": 6,
  "!=": 6,
  "&": 5,
  "^": 4,
  "|": 3,
  "&&": 2,
  "||": 1,
});

const operatorSet: ReadonlySet<string> = new Set(BINARY_OPERATORS);

/** Returns the standard C precedence for one of the 18 supported binary operators. */
export function precedence(operator: BinaryOperator): number {
  return BINARY_OPERATOR_PRECEDENCE[operator];
}

/**
 * Plans the smallest old-source-coordinate patch group that changes one binary operator while
 * retaining the target's current operand grouping and its grouping inside a binary parent.
 */
export function planBinaryOperatorPatches(
  source: string,
  snapshot: EditTargetSnapshot,
  targetId: string,
  newOperator: string,
): readonly TextPatch[] {
  if (typeof source !== "string") throw new TypeError("source 必须是字符串");
  if (!operatorSet.has(newOperator)) {
    throw planningError(
      "INVALID_BINARY_OPERATOR",
      `不支持二元运算符 ${JSON.stringify(newOperator)}`,
    );
  }

  const target = requireUniqueTarget(snapshot, targetId);
  assertTargetMatchesSource(source, snapshot, target);
  const nextOperator = newOperator as BinaryOperator;
  if (target.operatorText === nextOperator) return Object.freeze([]);

  const patches: TextPatch[] = [createTextPatch(target.operatorRange, nextOperator)];
  const nextPrecedence = precedence(nextOperator);

  planOperandGrouping(source, snapshot, target, "left", nextPrecedence, patches);
  planOperandGrouping(source, snapshot, target, "right", nextPrecedence, patches);
  planParentGrouping(source, snapshot, target, nextPrecedence, patches);

  patches.sort(comparePatches);
  return Object.freeze(patches);
}

function planOperandGrouping(
  source: string,
  snapshot: EditTargetSnapshot,
  target: BinaryExpressionEditTarget,
  side: "left" | "right",
  nextPrecedence: number,
  patches: TextPatch[],
): void {
  const nodeType = side === "left" ? target.leftNodeType : target.rightNodeType;
  if (nodeType === "parenthesized_expression" || nodeType !== "binary_expression") return;

  const operandRange = side === "left" ? target.leftRange : target.rightRange;
  const operand = requireBinaryAtRange(snapshot, operandRange, target.id, side);
  assertTargetMatchesSource(source, snapshot, operand);
  const operandPrecedence = precedence(asOperator(operand.operatorText));
  if (!needsParentheses(operandPrecedence, nextPrecedence, side)) return;

  const seam =
    side === "left"
      ? textRange(operandRange.to, target.operatorRange.from)
      : textRange(target.operatorRange.to, operandRange.from);
  assertCommentFreeSeam(source, seam);
  addParentheses(operandRange, patches);
}

function planParentGrouping(
  source: string,
  snapshot: EditTargetSnapshot,
  target: BinaryExpressionEditTarget,
  nextPrecedence: number,
  patches: TextPatch[],
): void {
  if (target.parentBinaryId === null) {
    if (target.parentSide !== null) throw planningError("STALE_EDIT_TARGET", "父上下文不一致");
    return;
  }
  if (target.parentSide === null) throw planningError("STALE_EDIT_TARGET", "父上下文不一致");

  const parent = requireUniqueTarget(snapshot, target.parentBinaryId);
  assertTargetMatchesSource(source, snapshot, parent);
  const side = target.parentSide;
  const parentNodeType = side === "left" ? parent.leftNodeType : parent.rightNodeType;
  const parentOperandRange = side === "left" ? parent.leftRange : parent.rightRange;
  if (parentNodeType === "parenthesized_expression") {
    if (!rangeContains(parentOperandRange, target.range)) {
      throw planningError("STALE_EDIT_TARGET", "括号父操作数未覆盖目标表达式");
    }
    return;
  }
  if (parentNodeType !== "binary_expression" || !sameRange(parentOperandRange, target.range)) {
    throw planningError("STALE_EDIT_TARGET", "父操作数与目标表达式不一致");
  }

  const parentPrecedence = precedence(asOperator(parent.operatorText));
  if (!needsParentheses(nextPrecedence, parentPrecedence, side)) return;

  const seam =
    side === "left"
      ? textRange(target.range.to, parent.operatorRange.from)
      : textRange(parent.operatorRange.to, target.range.from);
  assertCommentFreeSeam(source, seam);
  addParentheses(target.range, patches);
}

/** A right child at equal precedence needs parentheses because all supported operators associate left. */
function needsParentheses(
  childPrecedence: number,
  parentPrecedence: number,
  side: "left" | "right",
): boolean {
  return (
    childPrecedence < parentPrecedence || (side === "right" && childPrecedence === parentPrecedence)
  );
}

function addParentheses(range: TextRange, patches: TextPatch[]): void {
  patches.push(createTextPatch(textRange(range.from, range.from), "("));
  patches.push(createTextPatch(textRange(range.to, range.to), ")"));
}

function assertCommentFreeSeam(source: string, range: TextRange): void {
  const seam = sliceRange(source, range);
  if (seam.includes("//") || seam.includes("/*")) {
    throw planningError(
      "AMBIGUOUS_COMMENT_SEAM",
      `自动括号接缝 [${range.from}, ${range.to}) 含注释`,
    );
  }
}

function requireUniqueTarget(
  snapshot: EditTargetSnapshot,
  targetId: string,
): BinaryExpressionEditTarget {
  if (typeof targetId !== "string" || targetId.length === 0) {
    throw planningError("UNKNOWN_BINARY_TARGET", "targetId 不得为空");
  }
  const matches = snapshot.binaryExpressions.filter((target) => target.id === targetId);
  if (matches.length !== 1 || matches[0] === undefined) {
    throw planningError(
      "UNKNOWN_BINARY_TARGET",
      `找不到唯一 binary target ${JSON.stringify(targetId)}`,
    );
  }
  return matches[0];
}

function requireBinaryAtRange(
  snapshot: EditTargetSnapshot,
  range: TextRange,
  parentId: string,
  side: "left" | "right",
): BinaryExpressionEditTarget {
  const matches = snapshot.binaryExpressions.filter(
    (candidate) =>
      sameRange(candidate.range, range) &&
      candidate.parentBinaryId === parentId &&
      candidate.parentSide === side,
  );
  if (matches.length !== 1 || matches[0] === undefined) {
    throw planningError("STALE_EDIT_TARGET", "找不到操作数对应的 binary target");
  }
  return matches[0];
}

function assertTargetMatchesSource(
  source: string,
  snapshot: EditTargetSnapshot,
  target: BinaryExpressionEditTarget,
): void {
  if (target.revision !== snapshot.revision) {
    throw planningError("STALE_EDIT_TARGET", "target revision 与 snapshot 不一致");
  }
  if (
    sliceRange(source, target.range) !== target.text ||
    sliceRange(source, target.leftRange) !== target.leftText ||
    sliceRange(source, target.operatorRange) !== target.operatorText ||
    sliceRange(source, target.rightRange) !== target.rightText ||
    !rangeContains(target.range, target.leftRange) ||
    !rangeContains(target.range, target.operatorRange) ||
    !rangeContains(target.range, target.rightRange) ||
    target.leftRange.to > target.operatorRange.from ||
    target.operatorRange.to > target.rightRange.from ||
    !operatorSet.has(target.operatorText)
  ) {
    throw planningError(
      "STALE_EDIT_TARGET",
      `binary target ${JSON.stringify(target.id)} 与源码不一致`,
    );
  }
}

function sliceRange(source: string, range: TextRange): string {
  if (
    !Number.isSafeInteger(range.from) ||
    !Number.isSafeInteger(range.to) ||
    range.from < 0 ||
    range.to < range.from ||
    range.to > source.length
  ) {
    throw planningError("STALE_EDIT_TARGET", `range [${range.from}, ${range.to}) 越出源码`);
  }
  return source.slice(range.from, range.to);
}

function asOperator(operator: string): BinaryOperator {
  if (!operatorSet.has(operator)) {
    throw planningError(
      "STALE_EDIT_TARGET",
      `snapshot 含未知二元运算符 ${JSON.stringify(operator)}`,
    );
  }
  return operator as BinaryOperator;
}

function sameRange(left: TextRange, right: TextRange): boolean {
  return left.from === right.from && left.to === right.to;
}

function rangeContains(outer: TextRange, inner: TextRange): boolean {
  return outer.from <= inner.from && inner.to <= outer.to;
}

function comparePatches(left: TextPatch, right: TextPatch): number {
  return left.range.from - right.range.from || left.range.to - right.range.to;
}

function planningError(code: string, message: string): Error {
  return new Error(`${code}: ${message}`);
}

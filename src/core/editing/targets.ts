import type { Node } from "web-tree-sitter";
import { textRange, type TextRange } from "../model.js";

export type LiteralKind = "number" | "char" | "string";
export type BinaryParentSide = "left" | "right";

interface EditTargetBase {
  /** Snapshot-local identity. It is not a Tree-sitter node id. */
  readonly id: string;
  readonly revision: number;
  readonly kind: "literal" | "binary-expression" | "for-statement" | "if-statement";
  readonly nodeType: string;
  readonly range: TextRange;
  readonly text: string;
}

export interface LiteralEditTarget extends EditTargetBase {
  readonly kind: "literal";
  readonly literalKind: LiteralKind;
}

export interface BinaryExpressionEditTarget extends EditTargetBase {
  readonly kind: "binary-expression";
  readonly nodeType: "binary_expression";
  readonly leftNodeType: string;
  readonly leftRange: TextRange;
  readonly leftText: string;
  readonly operatorRange: TextRange;
  readonly operatorText: string;
  readonly rightNodeType: string;
  readonly rightRange: TextRange;
  readonly rightText: string;
  readonly parentBinaryId: string | null;
  readonly parentSide: BinaryParentSide | null;
}

export interface ForStatementEditTarget extends EditTargetBase {
  readonly kind: "for-statement";
  readonly nodeType: "for_statement";
  readonly initializerNodeType: string | null;
  readonly initializerRange: TextRange;
  readonly initializerText: string;
  readonly initializerEmpty: boolean;
  readonly conditionNodeType: string | null;
  readonly conditionRange: TextRange;
  readonly conditionText: string;
  readonly conditionEmpty: boolean;
  readonly updateNodeType: string | null;
  readonly updateRange: TextRange;
  readonly updateText: string;
  readonly updateEmpty: boolean;
  readonly bodyNodeType: string;
  readonly bodyRange: TextRange;
  readonly bodyText: string;
}

export interface IfStatementEditTarget extends EditTargetBase {
  readonly kind: "if-statement";
  readonly nodeType: "if_statement";
  /** The exact interior of the outer condition parentheses. */
  readonly conditionRange: TextRange;
  readonly conditionText: string;
  readonly consequenceNodeType: string;
  readonly consequenceRange: TextRange;
  readonly consequenceText: string;
  /** Includes the complete `else_clause`, including the `else` token. */
  readonly alternativeNodeType: string | null;
  readonly alternativeRange: TextRange | null;
  readonly alternativeText: string | null;
  /** Covers every branch from the consequence start through the alternative end. */
  readonly bodyRange: TextRange;
  readonly bodyText: string;
}

export type EditTarget =
  LiteralEditTarget | BinaryExpressionEditTarget | ForStatementEditTarget | IfStatementEditTarget;

export interface EditTargetSnapshot {
  readonly revision: number;
  readonly literals: readonly LiteralEditTarget[];
  readonly binaryExpressions: readonly BinaryExpressionEditTarget[];
  readonly forStatements: readonly ForStatementEditTarget[];
  readonly ifStatements: readonly IfStatementEditTarget[];
}

interface BinaryParentContext {
  readonly id: string;
  readonly side: BinaryParentSide;
}

interface ExtractionContext {
  readonly source: string;
  readonly revision: number;
  nextTargetIndex: number;
  readonly literals: LiteralEditTarget[];
  readonly binaryExpressions: BinaryExpressionEditTarget[];
  readonly forStatements: ForStatementEditTarget[];
  readonly ifStatements: IfStatementEditTarget[];
}

interface BinaryParts {
  readonly left: Node;
  readonly operator: Node;
  readonly right: Node;
}

interface ForHeaderParts {
  readonly initializer: Node | null;
  readonly condition: Node | null;
  readonly update: Node | null;
  readonly body: Node;
  readonly openParenthesis: Node;
  readonly firstSemicolon: Node;
  readonly secondSemicolon: Node;
  readonly closeParenthesis: Node;
}

const LITERAL_KINDS: Readonly<Record<string, LiteralKind>> = Object.freeze({
  number_literal: "number",
  char_literal: "char",
  string_literal: "string",
});

const BINARY_OPERATORS = new Set([
  "!=",
  "%",
  "&",
  "&&",
  "*",
  "+",
  "-",
  "/",
  "<",
  "<<",
  "<=",
  "==",
  ">",
  ">=",
  ">>",
  "^",
  "|",
  "||",
]);

/**
 * Extracts immutable edit metadata while the live Tree-sitter tree is valid.
 * No Node, Tree, numeric node id, or lazy source getter escapes this call.
 */
export function extractEditTargets(
  rootNode: Node,
  source: string,
  revision: number,
): EditTargetSnapshot {
  assertInputs(rootNode, source, revision);
  const context: ExtractionContext = {
    source,
    revision,
    nextTargetIndex: 0,
    literals: [],
    binaryExpressions: [],
    forStatements: [],
    ifStatements: [],
  };

  visitNode(rootNode, null, context);

  return Object.freeze({
    revision,
    literals: Object.freeze(context.literals),
    binaryExpressions: Object.freeze(context.binaryExpressions),
    forStatements: Object.freeze(context.forStatements),
    ifStatements: Object.freeze(context.ifStatements),
  });
}

function visitNode(
  node: Node,
  parentBinary: BinaryParentContext | null,
  context: ExtractionContext,
): void {
  if (mustPruneUnsafeSubtree(node)) {
    return;
  }

  const literalKind = LITERAL_KINDS[node.type];
  if (literalKind !== undefined) {
    const target = makeLiteralTarget(node, literalKind, context);
    if (target !== null) context.literals.push(target);
  }

  let currentBinary: BinaryExpressionEditTarget | null = null;
  let binaryParts: BinaryParts | null = null;
  if (node.type === "binary_expression") {
    binaryParts = getBinaryParts(node, context.source.length);
    if (binaryParts !== null) {
      currentBinary = makeBinaryTarget(node, binaryParts, parentBinary, context);
      context.binaryExpressions.push(currentBinary);
    }
  } else if (node.type === "for_statement") {
    const target = makeForTarget(node, context);
    if (target !== null) context.forStatements.push(target);
  } else if (node.type === "if_statement") {
    const target = makeIfTarget(node, context);
    if (target !== null) context.ifStatements.push(target);
  }

  for (const child of node.namedChildren) {
    let childParent: BinaryParentContext | null = null;
    if (
      currentBinary !== null &&
      binaryParts !== null &&
      (child.type === "binary_expression" || child.type === "parenthesized_expression")
    ) {
      if (sameNode(child, binaryParts.left)) {
        childParent = { id: currentBinary.id, side: "left" };
      } else if (sameNode(child, binaryParts.right)) {
        childParent = { id: currentBinary.id, side: "right" };
      }
    } else if (
      node.type === "parenthesized_expression" &&
      parentBinary !== null &&
      (child.type === "binary_expression" || child.type === "parenthesized_expression")
    ) {
      childParent = parentBinary;
    }
    visitNode(child, childParent, context);
  }
}

function makeLiteralTarget(
  node: Node,
  literalKind: LiteralKind,
  context: ExtractionContext,
): LiteralEditTarget | null {
  const range = completeNodeRange(node, context.source.length);
  if (range === null || range.from === range.to) return null;
  return Object.freeze({
    id: nextTargetId(context),
    revision: context.revision,
    kind: "literal",
    nodeType: node.type,
    literalKind,
    range,
    text: sliceRange(context.source, range),
  });
}

function getBinaryParts(node: Node, sourceLength: number): BinaryParts | null {
  if (completeNodeRange(node, sourceLength) === null) return null;
  const left = node.childForFieldName("left");
  const operator = node.childForFieldName("operator");
  const right = node.childForFieldName("right");
  if (left === null || operator === null || right === null) return null;
  const leftRange = completeNodeRange(left, sourceLength);
  const operatorRange = completeNodeRange(operator, sourceLength);
  const rightRange = completeNodeRange(right, sourceLength);
  if (leftRange === null || operatorRange === null || rightRange === null) return null;
  if (leftRange.from === leftRange.to || operatorRange.from === operatorRange.to) return null;
  if (rightRange.from === rightRange.to || !BINARY_OPERATORS.has(operator.type)) return null;
  if (leftRange.to > operatorRange.from || operatorRange.to > rightRange.from) return null;
  return { left, operator, right };
}

function makeBinaryTarget(
  node: Node,
  parts: BinaryParts,
  parentBinary: BinaryParentContext | null,
  context: ExtractionContext,
): BinaryExpressionEditTarget {
  const range = requireCompleteRange(node, context.source.length);
  const leftRange = requireCompleteRange(parts.left, context.source.length);
  const operatorRange = requireCompleteRange(parts.operator, context.source.length);
  const rightRange = requireCompleteRange(parts.right, context.source.length);
  const operatorText = sliceRange(context.source, operatorRange);
  if (operatorText !== parts.operator.type) {
    throw new Error(`binary operator 匿名 token 与源码不一致：${JSON.stringify(operatorText)}`);
  }
  return Object.freeze({
    id: nextTargetId(context),
    revision: context.revision,
    kind: "binary-expression",
    nodeType: "binary_expression",
    range,
    text: sliceRange(context.source, range),
    leftNodeType: parts.left.type,
    leftRange,
    leftText: sliceRange(context.source, leftRange),
    operatorRange,
    operatorText,
    rightNodeType: parts.right.type,
    rightRange,
    rightText: sliceRange(context.source, rightRange),
    parentBinaryId: parentBinary?.id ?? null,
    parentSide: parentBinary?.side ?? null,
  });
}

function makeForTarget(node: Node, context: ExtractionContext): ForStatementEditTarget | null {
  const range = completeNodeRange(node, context.source.length);
  const parts = getForHeaderParts(node, context.source.length);
  if (range === null || parts === null) return null;

  // Slots deliberately include trivia and comment extras between their delimiters.
  // A later patch planner must preserve or explicitly reinsert that exact text.
  const initializerRange = textRange(
    parts.openParenthesis.endIndex,
    parts.firstSemicolon.startIndex,
  );
  const conditionRange = textRange(parts.firstSemicolon.endIndex, parts.secondSemicolon.startIndex);
  const updateRange = textRange(parts.secondSemicolon.endIndex, parts.closeParenthesis.startIndex);
  const bodyRange = requireCompleteRange(parts.body, context.source.length);

  return Object.freeze({
    id: nextTargetId(context),
    revision: context.revision,
    kind: "for-statement",
    nodeType: "for_statement",
    range,
    text: sliceRange(context.source, range),
    initializerNodeType: parts.initializer?.type ?? null,
    initializerRange,
    initializerText: sliceRange(context.source, initializerRange),
    initializerEmpty: parts.initializer === null,
    conditionNodeType: parts.condition?.type ?? null,
    conditionRange,
    conditionText: sliceRange(context.source, conditionRange),
    conditionEmpty: parts.condition === null,
    updateNodeType: parts.update?.type ?? null,
    updateRange,
    updateText: sliceRange(context.source, updateRange),
    updateEmpty: parts.update === null,
    bodyNodeType: parts.body.type,
    bodyRange,
    bodyText: sliceRange(context.source, bodyRange),
  });
}

function getForHeaderParts(node: Node, sourceLength: number): ForHeaderParts | null {
  if (completeNodeRange(node, sourceLength) === null) return null;
  const initializer = node.childForFieldName("initializer");
  const condition = node.childForFieldName("condition");
  const update = node.childForFieldName("update");
  const body = node.childForFieldName("body");
  if (body === null || completeNodeRange(body, sourceLength) === null) return null;

  const directChildren = node.children;
  const openParenthesis = directChildren.find((child) => child.type === "(" && !child.isNamed);
  const closeParenthesis = [...directChildren]
    .reverse()
    .find((child) => child.type === ")" && !child.isNamed && child.endIndex <= body.startIndex);
  if (openParenthesis === undefined || closeParenthesis === undefined) return null;

  const directSemicolons = directChildren.filter(
    (child) =>
      child.type === ";" &&
      !child.isNamed &&
      child.startIndex >= openParenthesis.endIndex &&
      child.endIndex <= closeParenthesis.startIndex,
  );
  let firstSemicolon: Node | undefined;
  let secondSemicolon: Node | undefined;
  if (initializer?.type === "declaration") {
    firstSemicolon = [...initializer.children]
      .reverse()
      .find((child) => child.type === ";" && !child.isNamed);
    secondSemicolon = directSemicolons[0];
  } else {
    firstSemicolon = directSemicolons[0];
    secondSemicolon = directSemicolons[1];
  }
  if (firstSemicolon === undefined || secondSemicolon === undefined) return null;
  if (
    openParenthesis.endIndex > firstSemicolon.startIndex ||
    firstSemicolon.endIndex > secondSemicolon.startIndex ||
    secondSemicolon.endIndex > closeParenthesis.startIndex
  ) {
    return null;
  }
  if (initializer !== null && initializer.startIndex < openParenthesis.endIndex) return null;
  if (initializer !== null && initializer.endIndex > firstSemicolon.endIndex) return null;
  if (condition !== null && condition.startIndex < firstSemicolon.endIndex) return null;
  if (condition !== null && condition.endIndex > secondSemicolon.startIndex) return null;
  if (update !== null && update.startIndex < secondSemicolon.endIndex) return null;
  if (update !== null && update.endIndex > closeParenthesis.startIndex) return null;

  return {
    initializer,
    condition,
    update,
    body,
    openParenthesis,
    firstSemicolon,
    secondSemicolon,
    closeParenthesis,
  };
}

function makeIfTarget(node: Node, context: ExtractionContext): IfStatementEditTarget | null {
  const range = completeNodeRange(node, context.source.length);
  const condition = node.childForFieldName("condition");
  const consequence = node.childForFieldName("consequence");
  const alternative = node.childForFieldName("alternative");
  if (range === null || condition === null || consequence === null) return null;
  const conditionWrapperRange = completeNodeRange(condition, context.source.length);
  const consequenceRange = completeNodeRange(consequence, context.source.length);
  const alternativeRange =
    alternative === null ? null : completeNodeRange(alternative, context.source.length);
  if (conditionWrapperRange === null || consequenceRange === null) return null;
  if (alternative !== null && alternativeRange === null) return null;

  const conditionChildren = condition.children;
  const openParenthesis = conditionChildren.find((child) => child.type === "(" && !child.isNamed);
  const closeParenthesis = [...conditionChildren]
    .reverse()
    .find((child) => child.type === ")" && !child.isNamed);
  if (openParenthesis === undefined || closeParenthesis === undefined) return null;
  if (openParenthesis.endIndex > closeParenthesis.startIndex) return null;
  const conditionRange = textRange(openParenthesis.endIndex, closeParenthesis.startIndex);
  if (conditionRange.from === conditionRange.to) return null;

  const bodyEnd = alternativeRange?.to ?? consequenceRange.to;
  const bodyRange = textRange(consequenceRange.from, bodyEnd);
  return Object.freeze({
    id: nextTargetId(context),
    revision: context.revision,
    kind: "if-statement",
    nodeType: "if_statement",
    range,
    text: sliceRange(context.source, range),
    conditionRange,
    conditionText: sliceRange(context.source, conditionRange),
    consequenceNodeType: consequence.type,
    consequenceRange,
    consequenceText: sliceRange(context.source, consequenceRange),
    alternativeNodeType: alternative?.type ?? null,
    alternativeRange,
    alternativeText:
      alternativeRange === null ? null : sliceRange(context.source, alternativeRange),
    bodyRange,
    bodyText: sliceRange(context.source, bodyRange),
  });
}

function mustPruneUnsafeSubtree(node: Node): boolean {
  if (node.isError || node.isMissing || node.type === "ERROR") return true;
  if (!node.hasError) return false;
  if (node.type === "compound_statement" || node.type === "translation_unit") return false;
  return (
    node.type === "binary_expression" ||
    node.type === "for_statement" ||
    node.type === "if_statement" ||
    node.type === "declaration" ||
    node.type.endsWith("_declaration") ||
    node.type.endsWith("_statement") ||
    node.type.startsWith("preproc_")
  );
}

function completeNodeRange(node: Node, sourceLength: number): TextRange | null {
  if (node.isError || node.isMissing || node.hasError) return null;
  const { startIndex, endIndex } = node;
  if (
    !Number.isSafeInteger(startIndex) ||
    !Number.isSafeInteger(endIndex) ||
    startIndex < 0 ||
    endIndex < startIndex ||
    endIndex > sourceLength
  ) {
    return null;
  }
  return textRange(startIndex, endIndex);
}

function requireCompleteRange(node: Node, sourceLength: number): TextRange {
  const range = completeNodeRange(node, sourceLength);
  if (range === null) {
    throw new Error(`节点 ${node.type} 没有安全的源码范围`);
  }
  return range;
}

function nextTargetId(context: ExtractionContext): string {
  const id = `edit:${String(context.revision)}:${String(context.nextTargetIndex)}`;
  context.nextTargetIndex += 1;
  return id;
}

function sliceRange(source: string, range: TextRange): string {
  if (range.to > source.length) {
    throw new RangeError(`range [${String(range.from)}, ${String(range.to)}) 超出源码长度`);
  }
  return source.slice(range.from, range.to);
}

function sameNode(left: Node, right: Node): boolean {
  return (
    left.type === right.type &&
    left.startIndex === right.startIndex &&
    left.endIndex === right.endIndex
  );
}

function assertInputs(rootNode: Node, source: string, revision: number): void {
  if (typeof source !== "string") {
    throw new TypeError("source 必须是字符串");
  }
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError("revision 必须是非负安全整数");
  }
  const { startIndex, endIndex } = rootNode;
  if (
    !Number.isSafeInteger(startIndex) ||
    !Number.isSafeInteger(endIndex) ||
    startIndex < 0 ||
    endIndex < startIndex
  ) {
    throw new RangeError("rootNode range 与源码长度不一致");
  }
  if (endIndex > source.length && !rootNode.hasError && !rootNode.isError) {
    throw new RangeError("rootNode range 与源码长度不一致");
  }
  const clampedEnd = Math.min(endIndex, source.length);
  if (source.slice(startIndex, clampedEnd) !== rootNode.text) {
    throw new Error("rootNode 与 source 不属于同一源码快照");
  }
}

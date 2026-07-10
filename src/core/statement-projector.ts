import type { Node } from "web-tree-sitter";
import {
  textRange,
  type Block,
  type RawBlock,
  type RawReason,
  type SyntaxBlock,
  type TextRange,
} from "./model.js";

export interface StatementProjectionFacts {
  readonly supportedFunctionRanges: readonly TextRange[];
  readonly unsupportedFunctionRanges: readonly TextRange[];
  readonly errorRanges: readonly TextRange[];
  readonly missingOffsets: readonly number[];
}

type ProjectionMode = "top-level" | "function";

interface ProjectionContext {
  readonly source: string;
  readonly sourceLength: number;
  readonly supportedFunctions: ReadonlySet<string>;
  readonly unsupportedFunctions: ReadonlySet<string>;
  readonly errorRanges: readonly TextRange[];
  readonly errorPrefixMaxTo: readonly number[];
  readonly missingOffsets: readonly number[];
}

const STATEMENT_NODE_TYPES = new Set([
  "break_statement",
  "case_statement",
  "continue_statement",
  "do_statement",
  "expression_statement",
  "for_statement",
  "goto_statement",
  "if_statement",
  "labeled_statement",
  "return_statement",
  "switch_statement",
  "while_statement",
]);

const UNSUPPORTED_PREPROCESSOR_NODE_TYPES = new Set([
  "preproc_call",
  "preproc_elif",
  "preproc_elifdef",
  "preproc_function_def",
  "preproc_if",
]);

const UNSUPPORTED_STATEMENT_NODE_TYPES = new Set([
  "attributed_statement",
  "seh_leave_statement",
  "seh_try_statement",
]);

const UNSUPPORTED_DECLARATION_DESCENDANT_TYPES = new Set([
  "attribute_declaration",
  "attribute_specifier",
  "attributed_declarator",
  "ms_declspec_modifier",
]);

/**
 * Produces the M2 statement-level view while copying only immutable ranges and
 * node type strings out of the live Tree-sitter tree.
 */
export function projectStatementBlocks(
  source: string,
  rootNode: Node,
  facts: StatementProjectionFacts,
): readonly Block[] {
  const errorRanges = Object.freeze(
    [...facts.errorRanges].sort((left, right) => left.from - right.from || left.to - right.to),
  );
  const context: ProjectionContext = {
    source,
    sourceLength: source.length,
    supportedFunctions: new Set(facts.supportedFunctionRanges.map(rangeKey)),
    unsupportedFunctions: new Set(facts.unsupportedFunctionRanges.map(rangeKey)),
    errorRanges,
    errorPrefixMaxTo: buildPrefixMaxTo(errorRanges),
    missingOffsets: Object.freeze([...facts.missingOffsets].sort((left, right) => left - right)),
  };

  const projected =
    rootNode.type === "translation_unit"
      ? projectContainerChildren(rootNode.namedChildren, "top-level", context)
      : projectNode(rootNode, "top-level", context);
  return freezeOrderedBlocks(projected);
}

function projectNode(
  node: Node,
  mode: ProjectionMode,
  context: ProjectionContext,
): readonly Block[] {
  if (node.type === "comment") {
    const range = safeNodeRange(node, context.sourceLength);
    return mode === "top-level" && range !== null
      ? [makeRawBlock(range, "not-yet-structured")]
      : [];
  }
  if (node.isError || node.type === "ERROR") {
    return projectRecovery(node, mode, context);
  }
  if (mode === "top-level") {
    return projectTopLevelNode(node, context);
  }
  return projectFunctionNode(node, context);
}

function projectTopLevelNode(node: Node, context: ProjectionContext): readonly Block[] {
  const range = safeNodeRange(node, context.sourceLength);
  if (range === null) {
    return [];
  }
  if (node.type === "function_definition") {
    return [projectFunctionDefinition(node, range, context)];
  }
  if (node.type === "declaration" || node.type === "type_definition") {
    return [
      nodeIsComplete(node) && !containsUnsupportedDeclarationSyntax(node)
        ? makeSyntaxBlock(node.type, "declaration", range, [])
        : makeRawBlock(
            range,
            containsUnsupportedDeclarationSyntax(node)
              ? "unsupported-syntax"
              : rawReason(range, context),
          ),
    ];
  }
  if (node.type === "preproc_include" || node.type === "preproc_def") {
    return [
      nodeIsComplete(node)
        ? makeSyntaxBlock(node.type, "preprocessor", range, [])
        : makeRawBlock(range, rawReason(range, context)),
    ];
  }
  if (node.type === "preproc_ifdef") {
    return [projectIfdef(node, range, "top-level", context)];
  }
  if (UNSUPPORTED_PREPROCESSOR_NODE_TYPES.has(node.type)) {
    return [makeRawBlock(range, "unsupported-syntax")];
  }
  if (node.type === "translation_unit") {
    return projectContainerChildren(node.namedChildren, "top-level", context);
  }
  return [makeRawBlock(range, rawReason(range, context))];
}

function containsUnsupportedDeclarationSyntax(node: Node): boolean {
  const stack = [...node.namedChildren];
  while (stack.length > 0) {
    const candidate = stack.pop();
    if (candidate === undefined) continue;
    if (UNSUPPORTED_DECLARATION_DESCENDANT_TYPES.has(candidate.type)) return true;
    stack.push(...candidate.namedChildren);
  }
  return false;
}

function projectFunctionNode(node: Node, context: ProjectionContext): readonly Block[] {
  const range = safeNodeRange(node, context.sourceLength);
  if (range === null) {
    return [];
  }
  if (node.type === "compound_statement" || node.type === "else_clause") {
    return projectContainerChildren(node.namedChildren, "function", context);
  }
  if (node.type === "declaration" || node.type === "type_definition") {
    return [
      nodeIsComplete(node) && !containsUnsupportedDeclarationSyntax(node)
        ? makeSyntaxBlock(node.type, "declaration", range, [])
        : makeRawBlock(
            range,
            containsUnsupportedDeclarationSyntax(node)
              ? "unsupported-syntax"
              : rawReason(range, context),
          ),
    ];
  }
  if (STATEMENT_NODE_TYPES.has(node.type)) {
    return [
      nodeIsComplete(node)
        ? makeSyntaxBlock(node.type, "statement", range, projectStatementChildren(node, context))
        : makeRawBlock(range, rawReason(range, context)),
    ];
  }
  if (node.type === "preproc_include" || node.type === "preproc_def") {
    return [
      nodeIsComplete(node)
        ? makeSyntaxBlock(node.type, "preprocessor", range, [])
        : makeRawBlock(range, rawReason(range, context)),
    ];
  }
  if (node.type === "preproc_ifdef") {
    return [projectIfdef(node, range, "function", context)];
  }
  if (
    UNSUPPORTED_PREPROCESSOR_NODE_TYPES.has(node.type) ||
    UNSUPPORTED_STATEMENT_NODE_TYPES.has(node.type) ||
    node.type === "function_definition"
  ) {
    return [makeRawBlock(range, "unsupported-syntax")];
  }
  return [makeRawBlock(range, rawReason(range, context))];
}

function projectFunctionDefinition(
  node: Node,
  range: TextRange,
  context: ProjectionContext,
): Block {
  const key = rangeKey(range);
  if (context.unsupportedFunctions.has(key)) {
    return makeRawBlock(range, "unsupported-syntax");
  }
  if (!context.supportedFunctions.has(key) || !nodeIsComplete(node)) {
    return makeRawBlock(range, rawReason(range, context));
  }

  const body = node.childForFieldName("body");
  if (body === null || body.type !== "compound_statement") {
    return makeRawBlock(range, "parse-error");
  }
  const children = projectContainerChildren(body.namedChildren, "function", context);
  return makeSyntaxBlock("function_definition", "function", range, children);
}

function projectIfdef(
  node: Node,
  range: TextRange,
  mode: ProjectionMode,
  context: ProjectionContext,
): Block {
  const children: Block[] = [];
  for (const child of node.namedChildren) {
    if (child.type === "comment" || child.type === "identifier") {
      continue;
    }
    if (child.type === "preproc_else") {
      children.push(...projectPreprocessorBranch(child, mode, context));
    } else {
      children.push(...projectNode(child, mode, context));
    }
  }
  const orderedChildren = freezeOrderedBlocks(children);
  if (nodeIsComplete(node)) {
    return makeSyntaxBlock("preproc_ifdef", "preprocessor", range, orderedChildren);
  }
  if (orderedChildren.length === 0) {
    return makeRawBlock(range, "parse-error");
  }
  return makeSyntaxBlock(
    "preproc_ifdef",
    "preprocessor",
    range,
    partitionRecoveryRange(range, orderedChildren, context),
  );
}

function projectPreprocessorBranch(
  node: Node,
  mode: ProjectionMode,
  context: ProjectionContext,
): readonly Block[] {
  const blocks: Block[] = [];
  for (const child of node.namedChildren) {
    if (child.type !== "comment") {
      blocks.push(...projectNode(child, mode, context));
    }
  }
  return freezeOrderedBlocks(blocks);
}

function projectStatementChildren(node: Node, context: ProjectionContext): readonly Block[] {
  switch (node.type) {
    case "if_statement": {
      const children: Block[] = [];
      const consequence = node.childForFieldName("consequence");
      const alternative = node.childForFieldName("alternative");
      if (consequence !== null) {
        children.push(...projectControlBody(consequence, context));
      }
      if (alternative !== null) {
        children.push(...projectControlBody(alternative, context));
      }
      return freezeOrderedBlocks(children);
    }
    case "for_statement":
    case "while_statement":
    case "do_statement":
    case "switch_statement": {
      const body = node.childForFieldName("body");
      return body === null
        ? Object.freeze([])
        : freezeOrderedBlocks(projectControlBody(body, context));
    }
    case "case_statement": {
      const value = node.childForFieldName("value");
      const children: Block[] = [];
      for (const child of node.namedChildren) {
        if (value !== null && sameRange(child, value)) {
          continue;
        }
        if (isFunctionProjectionCandidate(child)) {
          children.push(...projectFunctionNode(child, context));
        }
      }
      return freezeOrderedBlocks(children);
    }
    case "labeled_statement": {
      const children: Block[] = [];
      for (const child of node.namedChildren) {
        if (child.type !== "statement_identifier" && isFunctionProjectionCandidate(child)) {
          children.push(...projectFunctionNode(child, context));
        }
      }
      return freezeOrderedBlocks(children);
    }
    default:
      return Object.freeze([]);
  }
}

function projectControlBody(node: Node, context: ProjectionContext): readonly Block[] {
  if (node.type === "compound_statement" || node.type === "else_clause") {
    return projectContainerChildren(node.namedChildren, "function", context);
  }
  return projectFunctionNode(node, context);
}

function projectContainerChildren(
  nodes: readonly Node[],
  mode: ProjectionMode,
  context: ProjectionContext,
): readonly Block[] {
  const blocks: Block[] = [];
  for (const node of nodes) {
    blocks.push(...projectNode(node, mode, context));
  }
  return freezeOrderedBlocks(blocks);
}

function projectRecovery(
  node: Node,
  mode: ProjectionMode,
  context: ProjectionContext,
): readonly Block[] {
  const range = safeNodeRange(node, context.sourceLength);
  if (range === null) {
    return [];
  }
  const recovered = mineRecoveryChildren(node, mode, context).filter(
    (block) => block.range.from >= range.from && block.range.to <= range.to,
  );
  return partitionRecoveryRange(range, recovered, context);
}

function mineRecoveryChildren(
  node: Node,
  mode: ProjectionMode,
  context: ProjectionContext,
): readonly Block[] {
  const recovered: Block[] = [];
  for (const child of node.namedChildren) {
    if (child.type === "comment") {
      continue;
    }
    if (isProjectionCandidate(child, mode) && nodeIsComplete(child)) {
      recovered.push(...projectNode(child, mode, context));
      continue;
    }
    recovered.push(...mineRecoveryChildren(child, mode, context));
  }
  return outermostOrderedBlocks(recovered);
}

function partitionRecoveryRange(
  range: TextRange,
  recovered: readonly Block[],
  context: ProjectionContext,
): readonly Block[] {
  const blocks: Block[] = [];
  let cursor = range.from;
  for (const block of recovered) {
    appendTrimmedRaw(context.source, cursor, block.range.from, "parse-error", blocks);
    blocks.push(block);
    cursor = block.range.to;
  }
  appendTrimmedRaw(context.source, cursor, range.to, "parse-error", blocks);
  return freezeOrderedBlocks(blocks);
}

function appendTrimmedRaw(
  source: string,
  intervalFrom: number,
  intervalTo: number,
  reason: RawReason,
  destination: Block[],
): void {
  let from = intervalFrom;
  let to = intervalTo;
  while (from < to && isSkippableTrivia(source, from)) {
    from += 1;
  }
  while (to > from && isSkippableTrivia(source, to - 1)) {
    to -= 1;
  }
  if (from < to) {
    destination.push(makeRawBlock(textRange(from, to), reason));
  }
}

function isSkippableTrivia(source: string, offset: number): boolean {
  const character = source[offset];
  return (
    (offset === 0 && character === "\uFEFF") ||
    character === " " ||
    character === "\t" ||
    character === "\r" ||
    character === "\n" ||
    character === "\f" ||
    character === "\v"
  );
}

function isProjectionCandidate(node: Node, mode: ProjectionMode): boolean {
  if (node.isError || node.type === "ERROR") {
    return true;
  }
  if (mode === "top-level") {
    return (
      node.type === "function_definition" ||
      node.type === "declaration" ||
      node.type === "type_definition" ||
      node.type === "preproc_include" ||
      node.type === "preproc_def" ||
      node.type === "preproc_ifdef" ||
      UNSUPPORTED_PREPROCESSOR_NODE_TYPES.has(node.type)
    );
  }
  return isFunctionProjectionCandidate(node);
}

function isFunctionProjectionCandidate(node: Node): boolean {
  return (
    node.type === "compound_statement" ||
    node.type === "else_clause" ||
    node.type === "declaration" ||
    node.type === "type_definition" ||
    STATEMENT_NODE_TYPES.has(node.type) ||
    node.type === "preproc_include" ||
    node.type === "preproc_def" ||
    node.type === "preproc_ifdef" ||
    UNSUPPORTED_PREPROCESSOR_NODE_TYPES.has(node.type) ||
    UNSUPPORTED_STATEMENT_NODE_TYPES.has(node.type)
  );
}

function nodeIsComplete(node: Node): boolean {
  return !node.hasError && !node.isError && !node.isMissing;
}

function makeSyntaxBlock(
  nodeType: string,
  role: SyntaxBlock["role"],
  range: TextRange,
  children: readonly Block[],
): SyntaxBlock {
  return Object.freeze({
    kind: "syntax",
    role,
    nodeType,
    range,
    children: freezeOrderedBlocks(children),
  });
}

function makeRawBlock(range: TextRange, reason: RawReason): RawBlock {
  return Object.freeze({
    kind: "raw",
    reason,
    range,
    children: Object.freeze([]),
  });
}

function freezeOrderedBlocks(blocks: readonly Block[]): readonly Block[] {
  const ordered = [...blocks].sort(
    (left, right) => left.range.from - right.range.from || right.range.to - left.range.to,
  );
  const accepted: Block[] = [];
  let previousEnd = -1;
  for (const block of ordered) {
    if (block.range.from >= previousEnd) {
      accepted.push(block);
      previousEnd = block.range.to;
    }
  }
  return Object.freeze(accepted);
}

function outermostOrderedBlocks(blocks: readonly Block[]): readonly Block[] {
  return freezeOrderedBlocks(blocks);
}

function rawReason(range: TextRange, context: ProjectionContext): RawReason {
  if (hasIntersectingError(context, range) || hasMissingOffset(context.missingOffsets, range)) {
    return "parse-error";
  }
  return "not-yet-structured";
}

function buildPrefixMaxTo(ranges: readonly TextRange[]): readonly number[] {
  const prefix: number[] = [];
  let maximum = -1;
  for (const range of ranges) {
    maximum = Math.max(maximum, range.to);
    prefix.push(maximum);
  }
  return Object.freeze(prefix);
}

function hasIntersectingError(context: ProjectionContext, range: TextRange): boolean {
  let low = 0;
  let high = context.errorRanges.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((context.errorRanges[middle]?.from ?? Number.POSITIVE_INFINITY) < range.to) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low > 0 && (context.errorPrefixMaxTo[low - 1] ?? -1) > range.from;
}

function hasMissingOffset(offsets: readonly number[], range: TextRange): boolean {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((offsets[middle] ?? Number.POSITIVE_INFINITY) < range.from) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return (offsets[low] ?? Number.POSITIVE_INFINITY) <= range.to;
}

function safeNodeRange(node: Node, sourceLength: number): TextRange | null {
  const from = clampOffset(node.startIndex, sourceLength);
  const to = clampOffset(node.endIndex, sourceLength);
  return from < to ? textRange(from, to) : null;
}

function clampOffset(value: number, sourceLength: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(sourceLength, Math.trunc(value)));
}

function sameRange(left: Node, right: Node): boolean {
  return left.startIndex === right.startIndex && left.endIndex === right.endIndex;
}

function rangeKey(range: TextRange): string {
  return `${range.from}:${range.to}`;
}

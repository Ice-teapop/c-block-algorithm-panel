import type { Node } from "web-tree-sitter";
import { assertSourceDocInvariants, nonTriviaGaps } from "./invariants.js";
import { projectSymbols } from "./symbols.js";
import { projectStatementBlocks } from "./statement-projector.js";
import {
  syntaxAnchor,
  textRange,
  utf16Offset,
  type CommentAttachment,
  type CommentNode,
  type ParseSummary,
  type ProjectionIssue,
  type SourceDoc,
  type SyntaxAnchor,
  type TextRange,
} from "./model.js";

const ALLOWED_FUNCTION_CONTAINERS = new Set([
  "translation_unit",
  "ERROR",
  "preproc_ifdef",
  "preproc_else",
]);
const UNSUPPORTED_FUNCTION_NODE_TYPES = new Set([
  "attribute_declaration",
  "attribute_specifier",
  "attributed_declarator",
  "attributed_statement",
  "gnu_asm_expression",
  "ms_based_modifier",
  "ms_call_modifier",
  "ms_declspec_modifier",
  "ms_pointer_modifier",
  "ms_restrict_modifier",
  "ms_signed_ptr_modifier",
  "ms_unaligned_ptr_modifier",
  "ms_unsigned_ptr_modifier",
]);
const NON_ASCII_C_TRIVIA_CHARACTER = /[^ \t\r\n\f\v]/u;
const INTERNAL_COMMENT_CONTAINERS = new Set([
  "translation_unit",
  "compound_statement",
  "function_definition",
  "preproc_if",
  "preproc_ifdef",
  "preproc_else",
  "preproc_elif",
  "ERROR",
]);

interface NodeFacts {
  readonly functions: readonly FunctionFact[];
  readonly comments: readonly CommentFact[];
  readonly anchors: readonly SyntaxAnchor[];
  readonly errorRanges: readonly TextRange[];
  readonly missingOffsets: readonly number[];
  readonly unsupportedFunctions: readonly TextRange[];
}

interface FunctionFact {
  readonly range: TextRange;
}

interface CommentFact {
  readonly range: TextRange;
  readonly internalCandidates: readonly SyntaxAnchor[];
}

interface CommentAttachmentContext {
  readonly source: string;
  readonly comments: readonly CommentFact[];
  readonly commentRanges: readonly TextRange[];
  readonly boundaryByStart: readonly SyntaxAnchor[];
  readonly boundaryByEnd: readonly SyntaxAnchor[];
  readonly nonTriviaCodePrefix: Uint32Array;
  readonly leadingInvalidPrefix: Uint32Array;
  readonly trailingInvalidPrefix: Uint32Array;
}

interface TraversalEntry {
  readonly node: Node;
  readonly allowedFunctionAncestors: boolean;
  readonly insideFunction: boolean;
}

export function projectCst(source: string, rootNode: Node): SourceDoc {
  const documentRange = textRange(0, source.length);
  const facts = collectNodeFacts(source, rootNode);
  const blocks = projectStatementBlocks(source, rootNode, {
    supportedFunctionRanges: facts.functions.map((fact) => fact.range),
    unsupportedFunctionRanges: facts.unsupportedFunctions,
    errorRanges: facts.errorRanges,
    missingOffsets: facts.missingOffsets,
  });
  const comments = buildComments(source, facts.comments, facts.anchors);
  const parse = makeParseSummary(rootNode.hasError, facts.errorRanges, facts.missingOffsets);
  const symbolProjection = projectSymbols(source, rootNode);
  const issues: ProjectionIssue[] = [];

  for (const range of facts.errorRanges) {
    issues.push(
      Object.freeze({
        code: "parser-recovery",
        range,
        message: "tree-sitter 在此处进行了错误恢复；可确认完整的子结构仍会被单独投影。",
      }),
    );
  }
  for (const range of facts.unsupportedFunctions) {
    issues.push(
      Object.freeze({
        code: "unsupported-function",
        range,
        message: "该函数含当前结构化层不承诺的扩展语法，已保留为原始 C。",
      }),
    );
  }

  const preliminary = Object.freeze({
    source,
    range: documentRange,
    blocks,
    comments,
    parse,
    issues: Object.freeze(issues),
    concerns: symbolProjection.concerns,
    symbols: symbolProjection.snapshot,
  });
  const gaps = nonTriviaGaps(preliminary);
  if (gaps.length > 0) {
    const gapIssues = gaps.map<ProjectionIssue>((range) =>
      Object.freeze({
        code: "non-trivia-gap",
        range,
        message: "非空白源码位于投影 gap；字符已保留，但需要后续回归审查。",
      }),
    );
    const withGapIssues = Object.freeze({
      ...preliminary,
      issues: Object.freeze([...issues, ...gapIssues]),
    });
    assertSourceDocInvariants(withGapIssues);
    return withGapIssues;
  }

  assertSourceDocInvariants(preliminary);
  return preliminary;
}

function collectNodeFacts(source: string, rootNode: Node): NodeFacts {
  const functions: FunctionFact[] = [];
  const comments = new Map<string, CommentFact>();
  const anchors = new Map<string, SyntaxAnchor>();
  const errorRanges = new Map<string, TextRange>();
  const missingOffsets = new Set<number>();
  const unsupportedFunctions: TextRange[] = [];
  const stack: TraversalEntry[] = [
    { node: rootNode, allowedFunctionAncestors: true, insideFunction: false },
  ];

  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry === undefined) {
      continue;
    }
    const { node } = entry;
    const range = safeNodeRange(node, source.length);
    if (node.isError && range !== null) {
      errorRanges.set(rangeKey(range), range);
    }
    if (node.isMissing) {
      missingOffsets.add(clampOffset(node.startIndex, source.length));
    }
    if (node.type === "comment" && range !== null && range.from < range.to) {
      comments.set(
        rangeKey(range),
        Object.freeze({
          range,
          internalCandidates: collectContainingAnchors(node, source.length),
        }),
      );
    }
    if (
      node.isNamed &&
      !node.isError &&
      !node.isMissing &&
      node.type !== "comment" &&
      range !== null &&
      range.from < range.to
    ) {
      const anchor = syntaxAnchor(node.type, range);
      anchors.set(anchorKey(anchor), anchor);
    }

    const isFunction = node.type === "function_definition";
    if (
      isFunction &&
      !entry.insideFunction &&
      entry.allowedFunctionAncestors &&
      range !== null &&
      range.from < range.to &&
      isCompleteFunction(node)
    ) {
      if (containsUnsupportedFunctionHeaderSyntax(node)) {
        unsupportedFunctions.push(range);
      } else {
        functions.push(Object.freeze({ range }));
      }
    }

    // MISSING punctuation can be anonymous, so recovery facts must traverse every child.
    const children = node.children;
    const childrenAllowed =
      entry.allowedFunctionAncestors && ALLOWED_FUNCTION_CONTAINERS.has(node.type);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        stack.push({
          node: child,
          allowedFunctionAncestors: childrenAllowed,
          insideFunction: entry.insideFunction || isFunction,
        });
      }
    }
  }

  return Object.freeze({
    functions: Object.freeze(removeOverlappingFunctions(functions)),
    comments: Object.freeze(sortCommentFacts([...comments.values()])),
    anchors: Object.freeze(sortAnchors([...anchors.values()])),
    errorRanges: Object.freeze(sortRanges([...errorRanges.values()])),
    missingOffsets: Object.freeze([...missingOffsets].sort((left, right) => left - right)),
    unsupportedFunctions: Object.freeze(sortRanges(unsupportedFunctions)),
  });
}

function isCompleteFunction(node: Node): boolean {
  if (node.hasError || node.isError || node.isMissing) {
    return false;
  }
  const type = node.childForFieldName("type");
  const declarator = node.childForFieldName("declarator");
  const body = node.childForFieldName("body");
  return (
    type !== null &&
    declarator !== null &&
    body !== null &&
    body.type === "compound_statement" &&
    !type.hasError &&
    !declarator.hasError &&
    !body.hasError
  );
}

function containsUnsupportedFunctionHeaderSyntax(functionNode: Node): boolean {
  const body = functionNode.childForFieldName("body");
  const stack = functionNode.namedChildren.filter(
    (child) =>
      body === null || child.startIndex !== body.startIndex || child.endIndex !== body.endIndex,
  );
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    if (UNSUPPORTED_FUNCTION_NODE_TYPES.has(node.type)) {
      return true;
    }
    stack.push(...node.namedChildren);
  }
  return false;
}

function removeOverlappingFunctions(functions: readonly FunctionFact[]): readonly FunctionFact[] {
  const sorted = [...functions].sort(
    (left, right) => left.range.from - right.range.from || right.range.to - left.range.to,
  );
  const accepted: FunctionFact[] = [];
  let previousEnd = -1;
  for (const candidate of sorted) {
    if (candidate.range.from >= previousEnd) {
      accepted.push(candidate);
      previousEnd = candidate.range.to;
    }
  }
  return accepted;
}

function buildComments(
  source: string,
  comments: readonly CommentFact[],
  anchors: readonly SyntaxAnchor[],
): readonly CommentNode[] {
  const context = createCommentAttachmentContext(source, comments, anchors);
  return Object.freeze(
    comments.map((comment, index) => {
      const { range } = comment;
      const text = source.slice(range.from, range.to);
      const form = text.startsWith("//") ? "line" : "block";
      const spansMultipleLines = form === "block" && /[\r\n]/u.test(text);
      return Object.freeze({
        kind: "comment",
        range,
        form,
        spansMultipleLines,
        attachment: commentAttachment(context, index, form, spansMultipleLines),
      });
    }),
  );
}

function commentAttachment(
  context: CommentAttachmentContext,
  commentIndex: number,
  form: CommentNode["form"],
  spansMultipleLines: boolean,
): CommentAttachment {
  const internal = findInternalCommentTarget(context, commentIndex);
  if (internal !== undefined) {
    return Object.freeze({
      relation: "internal",
      target: internal,
      movesWithTarget: false,
    });
  }

  const trailing = findTrailingCommentTarget(context, commentIndex);
  if (trailing !== undefined) {
    return Object.freeze({
      relation: "trailing",
      target: trailing,
      movesWithTarget: !(form === "block" && spansMultipleLines),
    });
  }

  const leading = findLeadingCommentTarget(context, commentIndex);
  if (leading !== undefined) {
    return Object.freeze({
      relation: "leading",
      target: leading,
      movesWithTarget: !(form === "block" && spansMultipleLines),
    });
  }

  return Object.freeze({
    relation: "detached",
    target: null,
    movesWithTarget: false,
  });
}

function findInternalCommentTarget(
  context: CommentAttachmentContext,
  commentIndex: number,
): SyntaxAnchor | undefined {
  const comment = context.comments[commentIndex];
  if (comment === undefined) {
    return undefined;
  }
  return comment.internalCandidates
    .filter(
      (anchor) =>
        !INTERNAL_COMMENT_CONTAINERS.has(anchor.nodeType) &&
        hasNonTriviaCode(context, anchor.range.from, comment.range.from) &&
        hasNonTriviaCode(context, comment.range.to, anchor.range.to),
    )
    .sort(compareNarrowestAnchor)[0];
}

function findTrailingCommentTarget(
  context: CommentAttachmentContext,
  commentIndex: number,
): SyntaxAnchor | undefined {
  const comment = context.comments[commentIndex];
  if (comment === undefined) {
    return undefined;
  }
  const lastCandidate = upperBoundAnchorEnd(context.boundaryByEnd, comment.range.from) - 1;
  if (lastCandidate < 0) {
    return undefined;
  }
  const target = narrowestAnchorWithSameEnd(context.boundaryByEnd, lastCandidate);
  return isValidTrailingBridge(context, target.range.to, commentIndex) ? target : undefined;
}

function findLeadingCommentTarget(
  context: CommentAttachmentContext,
  commentIndex: number,
): SyntaxAnchor | undefined {
  const comment = context.comments[commentIndex];
  if (comment === undefined) {
    return undefined;
  }
  const firstCandidate = lowerBoundAnchorStart(context.boundaryByStart, comment.range.to);
  if (firstCandidate >= context.boundaryByStart.length) {
    return undefined;
  }
  const target = narrowestAnchorWithSameStart(context.boundaryByStart, firstCandidate);
  return isValidLeadingBridge(context, commentIndex, target.range.from) ? target : undefined;
}

function isBoundaryCommentTarget(nodeType: string): boolean {
  if (nodeType === "compound_statement") {
    return false;
  }
  return (
    nodeType === "function_definition" ||
    nodeType === "declaration" ||
    nodeType === "type_definition" ||
    nodeType === "field_declaration" ||
    nodeType === "enumerator" ||
    nodeType.endsWith("_statement") ||
    nodeType.startsWith("preproc_")
  );
}

function createCommentAttachmentContext(
  source: string,
  comments: readonly CommentFact[],
  anchors: readonly SyntaxAnchor[],
): CommentAttachmentContext {
  const commentRanges = Object.freeze(comments.map((comment) => comment.range));
  const boundaryAnchors = anchors.filter((anchor) => isBoundaryCommentTarget(anchor.nodeType));
  return {
    source,
    comments,
    commentRanges,
    boundaryByStart: Object.freeze(
      [...boundaryAnchors].sort(
        (left, right) =>
          left.range.from - right.range.from ||
          compareNarrowestAnchor(left, right) ||
          left.range.to - right.range.to,
      ),
    ),
    boundaryByEnd: Object.freeze(
      [...boundaryAnchors].sort(
        (left, right) =>
          left.range.to - right.range.to ||
          compareNarrowestAnchor(right, left) ||
          left.range.from - right.range.from,
      ),
    ),
    nonTriviaCodePrefix: buildNonTriviaCodePrefix(source, commentRanges),
    leadingInvalidPrefix: buildBridgeInvalidPrefix(
      source,
      commentRanges,
      isLeadingTriviaWithoutBlankLine,
    ),
    trailingInvalidPrefix: buildBridgeInvalidPrefix(source, commentRanges, isHorizontalWhitespace),
  };
}

function buildNonTriviaCodePrefix(
  source: string,
  commentRanges: readonly TextRange[],
): Uint32Array {
  const prefix = new Uint32Array(source.length + 1);
  let commentIndex = 0;
  for (let offset = 0; offset < source.length; offset += 1) {
    while (
      commentRanges[commentIndex]?.to !== undefined &&
      commentRanges[commentIndex]!.to <= offset
    ) {
      commentIndex += 1;
    }
    const comment = commentRanges[commentIndex];
    const insideComment = comment !== undefined && comment.from <= offset && offset < comment.to;
    prefix[offset + 1] =
      (prefix[offset] ?? 0) +
      (!insideComment && NON_ASCII_C_TRIVIA_CHARACTER.test(source[offset] ?? "") ? 1 : 0);
  }
  return prefix;
}

function buildBridgeInvalidPrefix(
  source: string,
  commentRanges: readonly TextRange[],
  predicate: (value: string) => boolean,
): Uint32Array {
  const prefix = new Uint32Array(commentRanges.length);
  for (let index = 1; index < commentRanges.length; index += 1) {
    const previous = commentRanges[index - 1];
    const current = commentRanges[index];
    const valid =
      previous !== undefined &&
      current !== undefined &&
      predicate(source.slice(previous.to, current.from));
    prefix[index] = (prefix[index - 1] ?? 0) + (valid ? 0 : 1);
  }
  return prefix;
}

function hasNonTriviaCode(context: CommentAttachmentContext, from: number, to: number): boolean {
  return (context.nonTriviaCodePrefix[to] ?? 0) - (context.nonTriviaCodePrefix[from] ?? 0) > 0;
}

function isValidTrailingBridge(
  context: CommentAttachmentContext,
  targetEnd: number,
  commentIndex: number,
): boolean {
  const firstComment = lowerBoundRangeStart(context.commentRanges, targetEnd);
  const firstRange = context.commentRanges[firstComment];
  if (firstRange === undefined || firstComment > commentIndex) {
    return false;
  }
  return (
    isHorizontalWhitespace(context.source.slice(targetEnd, firstRange.from)) &&
    (context.trailingInvalidPrefix[commentIndex] ?? 0) ===
      (context.trailingInvalidPrefix[firstComment] ?? 0)
  );
}

function isValidLeadingBridge(
  context: CommentAttachmentContext,
  commentIndex: number,
  targetStart: number,
): boolean {
  const lastComment = lowerBoundRangeStart(context.commentRanges, targetStart) - 1;
  const lastRange = context.commentRanges[lastComment];
  if (lastRange === undefined || lastComment < commentIndex) {
    return false;
  }
  return (
    (context.leadingInvalidPrefix[lastComment] ?? 0) ===
      (context.leadingInvalidPrefix[commentIndex] ?? 0) &&
    isLeadingTriviaWithoutBlankLine(context.source.slice(lastRange.to, targetStart))
  );
}

function isHorizontalWhitespace(value: string): boolean {
  return /^[ \t]*$/u.test(value);
}

function isLeadingTriviaWithoutBlankLine(value: string): boolean {
  if (!/^[ \t\r\n\f\v]*$/u.test(value)) {
    return false;
  }
  const logicalBreaks = value.replaceAll("\r\n", "\n").match(/\r|\n/gu)?.length ?? 0;
  return logicalBreaks <= 1;
}

function compareNarrowestAnchor(left: SyntaxAnchor, right: SyntaxAnchor): number {
  return (
    left.range.to - left.range.from - (right.range.to - right.range.from) ||
    right.range.from - left.range.from ||
    left.nodeType.localeCompare(right.nodeType)
  );
}

function lowerBoundAnchorStart(anchors: readonly SyntaxAnchor[], value: number): number {
  let low = 0;
  let high = anchors.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((anchors[middle]?.range.from ?? Number.POSITIVE_INFINITY) < value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function upperBoundAnchorEnd(anchors: readonly SyntaxAnchor[], value: number): number {
  let low = 0;
  let high = anchors.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((anchors[middle]?.range.to ?? Number.POSITIVE_INFINITY) <= value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function lowerBoundRangeStart(ranges: readonly TextRange[], value: number): number {
  let low = 0;
  let high = ranges.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((ranges[middle]?.from ?? Number.POSITIVE_INFINITY) < value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function narrowestAnchorWithSameStart(
  anchors: readonly SyntaxAnchor[],
  firstIndex: number,
): SyntaxAnchor {
  const first = anchors[firstIndex];
  if (first === undefined) {
    throw new Error("无法选择 leading comment target");
  }
  let selected = first;
  for (let index = firstIndex + 1; anchors[index]?.range.from === first.range.from; index += 1) {
    const candidate = anchors[index];
    if (candidate !== undefined && compareNarrowestAnchor(candidate, selected) < 0) {
      selected = candidate;
    }
  }
  return selected;
}

function narrowestAnchorWithSameEnd(
  anchors: readonly SyntaxAnchor[],
  lastIndex: number,
): SyntaxAnchor {
  const last = anchors[lastIndex];
  if (last === undefined) {
    throw new Error("无法选择 trailing comment target");
  }
  let selected = last;
  for (let index = lastIndex - 1; anchors[index]?.range.to === last.range.to; index -= 1) {
    const candidate = anchors[index];
    if (candidate !== undefined && compareNarrowestAnchor(candidate, selected) < 0) {
      selected = candidate;
    }
  }
  return selected;
}

function makeParseSummary(
  hasError: boolean,
  errorRanges: readonly TextRange[],
  missingOffsets: readonly number[],
): ParseSummary {
  return Object.freeze({
    mode: "tree-sitter",
    hasError,
    errorRanges,
    missingOffsets: Object.freeze(missingOffsets.map(utf16Offset)),
  });
}

function collectContainingAnchors(node: Node, sourceLength: number): readonly SyntaxAnchor[] {
  const anchors: SyntaxAnchor[] = [];
  let ancestor = node.parent;
  while (ancestor !== null) {
    const range = safeNodeRange(ancestor, sourceLength);
    if (
      ancestor.isNamed &&
      !ancestor.isError &&
      !ancestor.isMissing &&
      ancestor.type !== "comment" &&
      range !== null &&
      range.from < range.to
    ) {
      anchors.push(syntaxAnchor(ancestor.type, range));
    }
    ancestor = ancestor.parent;
  }
  return Object.freeze(anchors);
}

function safeNodeRange(node: Node, sourceLength: number): TextRange | null {
  if (
    !Number.isSafeInteger(node.startIndex) ||
    !Number.isSafeInteger(node.endIndex) ||
    node.startIndex < 0 ||
    node.endIndex < node.startIndex ||
    node.endIndex > sourceLength
  ) {
    return null;
  }
  return textRange(node.startIndex, node.endIndex);
}

function clampOffset(value: number, sourceLength: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(sourceLength, Math.max(0, Math.trunc(value)));
}

function rangeKey(range: TextRange): string {
  return `${range.from}:${range.to}`;
}

function anchorKey(anchor: SyntaxAnchor): string {
  return `${anchor.nodeType}:${rangeKey(anchor.range)}`;
}

function sortRanges(ranges: readonly TextRange[]): TextRange[] {
  return [...ranges].sort((left, right) => left.from - right.from || left.to - right.to);
}

function sortCommentFacts(comments: readonly CommentFact[]): CommentFact[] {
  return [...comments].sort(
    (left, right) => left.range.from - right.range.from || left.range.to - right.range.to,
  );
}

function sortAnchors(anchors: readonly SyntaxAnchor[]): SyntaxAnchor[] {
  return [...anchors].sort(
    (left, right) =>
      left.range.from - right.range.from ||
      left.range.to - right.range.to ||
      left.nodeType.localeCompare(right.nodeType),
  );
}

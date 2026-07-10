import type { Block, CommentNode, SourceDoc, TextRange } from "./model.js";

const ASCII_C_TRIVIA = /^[ \t\r\n\f\v]*$/u;

export function assertSourceDocInvariants(document: SourceDoc): void {
  if (document.range.from !== 0 || document.range.to !== document.source.length) {
    throw new Error("SourceDoc range 必须精确覆盖完整 UTF-16 文本");
  }
  assertFrozen(document, "SourceDoc");
  assertFrozen(document.blocks, "SourceDoc.blocks");
  assertFrozen(document.comments, "SourceDoc.comments");
  assertFrozen(document.parse, "SourceDoc.parse");
  assertFrozen(document.parse.errorRanges, "SourceDoc.parse.errorRanges");
  assertFrozen(document.parse.missingOffsets, "SourceDoc.parse.missingOffsets");
  assertFrozen(document.issues, "SourceDoc.issues");
  assertFrozen(document.concerns, "SourceDoc.concerns");
  assertFrozen(document.symbols, "SourceDoc.symbols");
  assertFrozen(document.symbols.symbols, "SourceDoc.symbols.symbols");
  assertFrozen(document.symbols.occurrences, "SourceDoc.symbols.occurrences");

  assertOrderedNonOverlappingBlocks(document.blocks, document.range, document.source.length);
  assertComments(document.comments, document.range, document.source.length);

  for (const range of document.parse.errorRanges) {
    assertRange(range, document.range, document.source.length, true);
  }
  for (const offset of document.parse.missingOffsets) {
    if (offset < document.range.from || offset > document.range.to) {
      throw new Error(`MISSING offset ${offset} 越出文档 range`);
    }
  }
  for (const issue of document.issues) {
    assertFrozen(issue, `issue:${issue.code}`);
    assertRange(issue.range, document.range, document.source.length, true);
  }
  for (const concern of document.concerns) {
    assertFrozen(concern, `concern:${concern.code}`);
    assertRange(concern.blockRange, document.range, document.source.length, false);
    assertRange(concern.evidenceRange, document.range, document.source.length, false);
  }
  const symbolIds = new Set<string>();
  for (const symbol of document.symbols.symbols) {
    assertFrozen(symbol, `symbol:${symbol.id}`);
    if (symbol.id.length === 0 || symbolIds.has(symbol.id)) {
      throw new Error(`symbol id 必须非空且在 snapshot 内唯一：${symbol.id}`);
    }
    symbolIds.add(symbol.id);
    assertFrozen(symbol.declarationRanges, `symbol:${symbol.id}.declarationRanges`);
    for (const range of symbol.declarationRanges) {
      assertRange(range, document.range, document.source.length, false);
    }
  }
  for (const occurrence of document.symbols.occurrences) {
    assertFrozen(occurrence, `occurrence:${occurrence.symbolId}`);
    if (!symbolIds.has(occurrence.symbolId)) {
      throw new Error(`occurrence 引用了不存在的 symbol：${occurrence.symbolId}`);
    }
    assertRange(occurrence.range, document.range, document.source.length, false);
  }

  const rebuilt = rebuildFromCoverage(document);
  if (rebuilt !== document.source) {
    throw new Error("顶层 block coverage + gaps 未能逐字符重建 SourceDoc.source");
  }
}

export function rebuildFromCoverage(document: SourceDoc): string {
  let cursor = document.range.from;
  let rebuilt = "";
  for (const block of document.blocks) {
    rebuilt += document.source.slice(cursor, block.range.from);
    rebuilt += document.source.slice(block.range.from, block.range.to);
    cursor = block.range.to;
  }
  rebuilt += document.source.slice(cursor, document.range.to);
  return rebuilt;
}

export function nonTriviaGaps(document: SourceDoc): readonly TextRange[] {
  const gaps: TextRange[] = [];
  let cursor = document.range.from;
  for (const block of document.blocks) {
    if (cursor < block.range.from) {
      const gap = document.source.slice(cursor, block.range.from);
      if (!isAllowedGap(gap, cursor)) {
        gaps.push(Object.freeze({ from: cursor, to: block.range.from }));
      }
    }
    cursor = block.range.to;
  }
  if (cursor < document.range.to) {
    const gap = document.source.slice(cursor, document.range.to);
    if (!isAllowedGap(gap, cursor)) {
      gaps.push(Object.freeze({ from: cursor, to: document.range.to }));
    }
  }
  return Object.freeze(gaps);
}

function isAllowedGap(gap: string, from: number): boolean {
  const withoutInitialBom = from === 0 && gap.startsWith("\uFEFF") ? gap.slice(1) : gap;
  return ASCII_C_TRIVIA.test(withoutInitialBom);
}

function assertOrderedNonOverlappingBlocks(
  blocks: readonly Block[],
  parentRange: TextRange,
  sourceLength: number,
): void {
  let previousEnd = parentRange.from;
  for (const block of blocks) {
    assertFrozen(block, `block:${block.kind}`);
    assertFrozen(block.children, `block:${block.kind}.children`);
    assertRange(block.range, parentRange, sourceLength, false);
    if (block.range.from < previousEnd) {
      throw new Error("同层 block range 必须有序且不重叠");
    }
    if (block.kind === "raw" && block.children.length !== 0) {
      throw new Error("raw block 不得拥有子 block");
    }
    if (block.kind === "syntax") {
      if (block.nodeType.length === 0) {
        throw new Error("syntax block 的 nodeType 不得为空");
      }
      if (
        block.role !== "function" &&
        block.role !== "statement" &&
        block.role !== "declaration" &&
        block.role !== "preprocessor"
      ) {
        throw new Error("syntax block 的 role 不在 M2 白名单内");
      }
    }
    assertOrderedNonOverlappingBlocks(block.children, block.range, sourceLength);
    previousEnd = block.range.to;
  }
}

function assertComments(
  comments: readonly CommentNode[],
  documentRange: TextRange,
  sourceLength: number,
): void {
  let previousEnd = documentRange.from;
  for (const comment of comments) {
    assertFrozen(comment, "comment");
    assertFrozen(comment.attachment, "comment.attachment");
    assertRange(comment.range, documentRange, sourceLength, false);
    if (comment.range.from < previousEnd) {
      throw new Error("CommentNode range 必须有序且不重叠");
    }
    const { relation, target, movesWithTarget } = comment.attachment;
    if (relation === "detached") {
      if (target !== null || movesWithTarget) {
        throw new Error("detached 注释不得带 target 或移动语义");
      }
    } else {
      if (target === null) {
        throw new Error(`${relation} 注释必须有 target`);
      }
      assertFrozen(target, "comment.attachment.target");
      if (target.nodeType.length === 0) {
        throw new Error("注释 target 的 nodeType 不得为空");
      }
      assertRange(target.range, documentRange, sourceLength, false);
      if (relation === "leading" && comment.range.to > target.range.from) {
        throw new Error("leading 注释必须位于 target 前方");
      }
      if (relation === "trailing" && comment.range.from < target.range.to) {
        throw new Error("trailing 注释必须位于 target 后方");
      }
      if (
        relation === "internal" &&
        (comment.range.from < target.range.from || comment.range.to > target.range.to)
      ) {
        throw new Error("internal 注释必须被 target range 包含");
      }
    }
    if (comment.form === "block" && comment.spansMultipleLines && movesWithTarget) {
      throw new Error("多行块注释必须保守地禁止随 target 移动");
    }
    previousEnd = comment.range.to;
  }
}

function assertRange(
  range: TextRange,
  parentRange: TextRange,
  sourceLength: number,
  allowEmpty: boolean,
): void {
  assertFrozen(range, "range");
  if (
    !Number.isSafeInteger(range.from) ||
    !Number.isSafeInteger(range.to) ||
    range.from < 0 ||
    range.to < range.from ||
    range.to > sourceLength ||
    range.from < parentRange.from ||
    range.to > parentRange.to ||
    (!allowEmpty && range.from === range.to)
  ) {
    throw new Error(`非法 UTF-16 range [${range.from}, ${range.to})`);
  }
}

function assertFrozen(value: object, label: string): void {
  if (!Object.isFrozen(value)) {
    throw new Error(`${label} 必须是不可变快照`);
  }
}

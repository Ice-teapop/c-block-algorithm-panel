import type { Block, BlockShape, CommentShape, ProjectionShape, SourceDoc } from "./model.js";

export function renderSourceDoc(document: SourceDoc): string {
  let cursor = document.range.from;
  const fragments: string[] = [];
  for (const block of document.blocks) {
    fragments.push(document.source.slice(cursor, block.range.from));
    fragments.push(renderBlock(document.source, block));
    cursor = block.range.to;
  }
  fragments.push(document.source.slice(cursor, document.range.to));
  return fragments.join("");
}

export function projectionShape(document: SourceDoc): ProjectionShape {
  return Object.freeze({
    blocks: Object.freeze(document.blocks.map(blockShape)),
    comments: Object.freeze(document.comments.map(commentShape)),
    hasError: document.parse.hasError,
    errorRanges: Object.freeze(
      document.parse.errorRanges.map(
        (range) => Object.freeze([range.from, range.to]) as readonly [number, number],
      ),
    ),
    missingOffsets: Object.freeze([...document.parse.missingOffsets]),
  });
}

function renderBlock(source: string, block: Block): string {
  if (block.children.length === 0) {
    return source.slice(block.range.from, block.range.to);
  }
  let cursor = block.range.from;
  const fragments: string[] = [];
  for (const child of block.children) {
    fragments.push(source.slice(cursor, child.range.from));
    fragments.push(renderBlock(source, child));
    cursor = child.range.to;
  }
  fragments.push(source.slice(cursor, block.range.to));
  return fragments.join("");
}

function blockShape(block: Block): BlockShape {
  const common = {
    kind: block.kind,
    range: Object.freeze([block.range.from, block.range.to]) as readonly [number, number],
    children: Object.freeze(block.children.map(blockShape)),
  };
  return block.kind === "syntax"
    ? Object.freeze({
        ...common,
        role: block.role,
        nodeType: block.nodeType,
      })
    : Object.freeze({
        ...common,
        reason: block.reason,
      });
}

function commentShape(comment: SourceDoc["comments"][number]): CommentShape {
  const targetRange = comment.attachment.target?.range;
  return Object.freeze({
    range: Object.freeze([comment.range.from, comment.range.to]) as readonly [number, number],
    form: comment.form,
    spansMultipleLines: comment.spansMultipleLines,
    relation: comment.attachment.relation,
    targetNodeType: comment.attachment.target?.nodeType ?? null,
    targetRange:
      targetRange === undefined
        ? null
        : (Object.freeze([targetRange.from, targetRange.to]) as readonly [number, number]),
    movesWithTarget: comment.attachment.movesWithTarget,
  });
}

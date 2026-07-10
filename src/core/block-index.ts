import { textRange, type Block, type SourceDoc, type TextRange } from "./model.js";

export interface BlockIndexEntry {
  /** Snapshot-local identity. It is not stable across projections. */
  readonly index: number;
  readonly kind: "document" | "block";
  readonly block: Block | null;
  readonly range: TextRange;
  readonly depth: number;
  readonly parentIndex: number | null;
}

export interface BlockIndex {
  readonly range: TextRange;
  readonly entries: readonly BlockIndexEntry[];
}

interface DraftEntry {
  readonly kind: BlockIndexEntry["kind"];
  readonly block: Block | null;
  readonly range: TextRange;
  readonly depth: number;
  readonly parent: DraftEntry | null;
  readonly visitOrder: number;
}

/**
 * Builds an immutable, snapshot-local index over a laminar block tree.
 *
 * The synthetic document entry guarantees a unique fallback for trivia and
 * other gaps that are not covered by a visible block.
 */
export function createBlockIndex(document: Pick<SourceDoc, "range" | "blocks">): BlockIndex {
  const documentRange = textRange(document.range.from, document.range.to);
  const drafts: DraftEntry[] = [];
  const seenBlocks = new WeakSet<object>();
  let visitOrder = 0;

  const documentDraft: DraftEntry = {
    kind: "document",
    block: null,
    range: documentRange,
    depth: 0,
    parent: null,
    visitOrder: visitOrder++,
  };
  drafts.push(documentDraft);
  visitChildren(
    document.blocks,
    documentDraft,
    1,
    documentRange,
    drafts,
    seenBlocks,
    () => visitOrder++,
  );

  drafts.sort(compareDraftEntries);
  const indexByDraft = new Map<DraftEntry, number>();
  drafts.forEach((draft, index) => indexByDraft.set(draft, index));

  const entries = Object.freeze(
    drafts.map<BlockIndexEntry>((draft, index) => {
      const parentIndex = draft.parent === null ? null : indexByDraft.get(draft.parent);
      if (draft.parent !== null && parentIndex === undefined) {
        throw new Error("BlockIndex 无法定位父条目");
      }
      return Object.freeze({
        index,
        kind: draft.kind,
        block: draft.block,
        range: draft.range,
        depth: draft.depth,
        parentIndex: parentIndex ?? null,
      });
    }),
  );

  return Object.freeze({ range: documentRange, entries });
}

/**
 * Returns the unique deepest block containing the UTF-16 offset.
 *
 * Ranges are half-open. The sole exception is a cursor at document EOF,
 * which uses left bias and therefore queries the final UTF-16 code unit.
 */
export function offsetToBlock(index: BlockIndex, offset: number): BlockIndexEntry {
  assertOffset(index.range, offset);
  const root = index.entries[0];
  if (root === undefined || root.kind !== "document") {
    throw new Error("BlockIndex 缺少 synthetic document root");
  }
  if (index.range.from === index.range.to) {
    return root;
  }

  const point = offset === index.range.to ? offset - 1 : offset;
  let candidateIndex = upperBoundByStart(index.entries, point) - 1;
  while (candidateIndex >= 0) {
    const candidate = index.entries[candidateIndex];
    if (candidate === undefined) {
      break;
    }
    if (containsOffset(candidate.range, point)) {
      return candidate;
    }
    candidateIndex = candidate.parentIndex ?? -1;
  }

  throw new Error(`BlockIndex 未覆盖合法 UTF-16 offset ${offset}`);
}

/** Returns the exact range for a reference owned by this index snapshot. */
export function blockToRange(index: BlockIndex, entry: BlockIndexEntry): TextRange {
  if (index.entries[entry.index] !== entry) {
    throw new TypeError("block reference 不属于当前 BlockIndex snapshot");
  }
  return entry.range;
}

function visitChildren(
  blocks: readonly Block[],
  parent: DraftEntry,
  depth: number,
  parentRange: TextRange,
  drafts: DraftEntry[],
  seenBlocks: WeakSet<object>,
  nextVisitOrder: () => number,
): void {
  let previousEnd = parentRange.from;
  for (const block of blocks) {
    if (seenBlocks.has(block)) {
      throw new Error("同一个 block 对象不得在 BlockIndex 中出现多次");
    }
    seenBlocks.add(block);
    if (
      block.range.from < parentRange.from ||
      block.range.to > parentRange.to ||
      block.range.from >= block.range.to
    ) {
      throw new RangeError(
        `block range [${block.range.from}, ${block.range.to}) 未被父 range [${parentRange.from}, ${parentRange.to}) 合法包含`,
      );
    }
    if (block.range.from < previousEnd) {
      throw new Error("BlockIndex 要求同层 block range 有序且不重叠");
    }

    const draft: DraftEntry = {
      kind: "block",
      block,
      range: textRange(block.range.from, block.range.to),
      depth,
      parent,
      visitOrder: nextVisitOrder(),
    };
    drafts.push(draft);
    visitChildren(
      block.children,
      draft,
      depth + 1,
      draft.range,
      drafts,
      seenBlocks,
      nextVisitOrder,
    );
    previousEnd = block.range.to;
  }
}

function compareDraftEntries(left: DraftEntry, right: DraftEntry): number {
  return (
    left.range.from - right.range.from ||
    right.range.to - left.range.to ||
    left.depth - right.depth ||
    left.visitOrder - right.visitOrder
  );
}

function upperBoundByStart(entries: readonly BlockIndexEntry[], offset: number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((entries[middle]?.range.from ?? Number.POSITIVE_INFINITY) <= offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function containsOffset(range: TextRange, offset: number): boolean {
  return range.from <= offset && offset < range.to;
}

function assertOffset(range: TextRange, offset: number): void {
  if (!Number.isSafeInteger(offset) || offset < range.from || offset > range.to) {
    throw new RangeError(
      `UTF-16 offset ${String(offset)} 越出文档 range [${range.from}, ${range.to}]`,
    );
  }
}

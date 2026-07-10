import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  blockToRange,
  createBlockIndex,
  offsetToBlock,
  type BlockIndex,
  type BlockIndexEntry,
} from "../../src/core/block-index.js";
import {
  textRange,
  type Block,
  type RawBlock,
  type SyntaxBlock,
  type TextRange,
} from "../../src/core/model.js";

interface Plan {
  readonly width: number;
  readonly rawLeaf: boolean;
  readonly prefix: number;
  readonly children: readonly PlannedChild[];
  readonly suffix: number;
}

interface PlannedChild {
  readonly gap: number;
  readonly plan: Plan;
}

interface Layout {
  readonly leadingGap: number;
  readonly children: readonly PlannedChild[];
  readonly trailingGap: number;
}

const leafPlan: fc.Arbitrary<Plan> = fc
  .record({ width: fc.integer({ min: 1, max: 4 }), rawLeaf: fc.boolean() })
  .map(({ width, rawLeaf }) =>
    Object.freeze({ width, rawLeaf, prefix: 0, children: Object.freeze([]), suffix: 0 }),
  );

const planAtDepth: fc.Memo<Plan> = fc.memo<Plan>((depth): fc.Arbitrary<Plan> => {
  if (depth <= 1) {
    return leafPlan;
  }
  const branch: fc.Arbitrary<Plan> = fc
    .record({
      prefix: fc.integer({ min: 0, max: 3 }),
      children: fc.array(
        fc.record({ gap: fc.integer({ min: 0, max: 3 }), plan: planAtDepth(depth - 1) }),
        { minLength: 1, maxLength: 3 },
      ),
      suffix: fc.integer({ min: 0, max: 3 }),
    })
    .map(({ prefix, children, suffix }) => {
      const width =
        prefix +
        children.reduce((total, child) => total + child.gap + child.plan.width, 0) +
        suffix;
      return Object.freeze({
        width,
        rawLeaf: false,
        prefix,
        children: Object.freeze(children),
        suffix,
      });
    });
  return fc.oneof({ depthSize: "small" }, leafPlan, branch);
});

const layoutArbitrary: fc.Arbitrary<Layout> = fc
  .record({
    leadingGap: fc.integer({ min: 0, max: 4 }),
    children: fc.array(fc.record({ gap: fc.integer({ min: 0, max: 4 }), plan: planAtDepth(4) }), {
      minLength: 1,
      maxLength: 3,
    }),
    trailingGap: fc.integer({ min: 0, max: 4 }),
  })
  .map((layout) => Object.freeze({ ...layout, children: Object.freeze(layout.children) }));

describe("M2 laminar BlockIndex", () => {
  it("uses binary lookup plus parent fallback for shared starts, nested gaps and siblings", () => {
    const deepest = rawBlock(0, 4);
    const inner = syntaxBlock(0, 10, [deepest]);
    const parent = syntaxBlock(0, 15, [inner, rawBlock(12, 14)]);
    const right = rawBlock(15, 18);
    const index = createBlockIndex(documentOf(20, [parent, right]));

    expect(offsetToBlock(index, 0).block).toBe(deepest);
    expect(offsetToBlock(index, 6).block).toBe(inner);
    expect(offsetToBlock(index, 11).block).toBe(parent);
    expect(offsetToBlock(index, 15).block).toBe(right);
    expect(offsetToBlock(index, 18).kind).toBe("document");
    expect(index.entries.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(index.entries)).toBe(true);
    expect(Object.isFrozen(index)).toBe(true);
  });

  it("treats sibling ranges as half-open and uses left bias only at EOF", () => {
    const left = rawBlock(1, 4);
    const right = rawBlock(4, 7);
    const atEnd = rawBlock(8, 10);
    const index = createBlockIndex(documentOf(10, [left, right, atEnd]));

    expect(offsetToBlock(index, 3).block).toBe(left);
    expect(offsetToBlock(index, 4).block).toBe(right);
    expect(offsetToBlock(index, 7).kind).toBe("document");
    expect(offsetToBlock(index, 10).block).toBe(atEnd);
  });

  it("returns the synthetic document root for an empty document", () => {
    const index = createBlockIndex(documentOf(0, []));
    const hit = offsetToBlock(index, 0);

    expect(hit.kind).toBe("document");
    expect(hit.range).toEqual(textRange(0, 0));
    expect(blockToRange(index, hit)).toBe(hit.range);
  });

  it("uses UTF-16 code units, including both halves of a surrogate pair", () => {
    const source = "a😀b";
    const emoji = rawBlock(1, 3);
    const finalCodeUnit = rawBlock(3, source.length);
    const index = createBlockIndex(documentOf(source.length, [emoji, finalCodeUnit]));

    expect(source.length).toBe(4);
    expect(offsetToBlock(index, 1).block).toBe(emoji);
    expect(offsetToBlock(index, 2).block).toBe(emoji);
    expect(offsetToBlock(index, source.length).block).toBe(finalCodeUnit);
  });

  it("rejects a block reference from another snapshot", () => {
    const block = rawBlock(0, 1);
    const first = createBlockIndex(documentOf(1, [block]));
    const second = createBlockIndex(documentOf(1, [block]));

    expect(() => blockToRange(second, offsetToBlock(first, 0))).toThrow(/snapshot/u);
  });

  it("matches an independent linear deepest-block oracle for generated laminar trees", () => {
    fc.assert(
      fc.property(layoutArbitrary, (layout) => {
        const built = buildLayout(layout);
        const index = createBlockIndex(documentOf(built.length, built.blocks));

        assertSortedAndParented(index);
        for (let offset = 0; offset <= built.length; offset += 1) {
          const actual = offsetToBlock(index, offset);
          const expected = linearOracle(index, offset);
          expect(actual).toBe(expected);
          expect(blockToRange(index, actual)).toBe(actual.range);
        }
      }),
      { numRuns: 200, seed: 0xb10c1d },
    );
  });

  it("rejects offsets outside the snapshot", () => {
    const index = createBlockIndex(documentOf(3, []));
    expect(() => offsetToBlock(index, -1)).toThrow(RangeError);
    expect(() => offsetToBlock(index, 4)).toThrow(RangeError);
    expect(() => offsetToBlock(index, 1.5)).toThrow(RangeError);
  });
});

function buildLayout(layout: Layout): {
  readonly length: number;
  readonly blocks: readonly Block[];
} {
  let cursor = layout.leadingGap;
  const blocks: Block[] = [];
  for (const child of layout.children) {
    cursor += child.gap;
    const built = buildPlan(child.plan, cursor);
    blocks.push(built.block);
    cursor = built.end;
  }
  return Object.freeze({
    length: cursor + layout.trailingGap,
    blocks: Object.freeze(blocks),
  });
}

function buildPlan(plan: Plan, from: number): { readonly block: Block; readonly end: number } {
  const to = from + plan.width;
  if (plan.children.length === 0) {
    return Object.freeze({
      block: plan.rawLeaf ? rawBlock(from, to) : syntaxBlock(from, to),
      end: to,
    });
  }

  let cursor = from + plan.prefix;
  const children: Block[] = [];
  for (const child of plan.children) {
    cursor += child.gap;
    const built = buildPlan(child.plan, cursor);
    children.push(built.block);
    cursor = built.end;
  }
  expect(cursor + plan.suffix).toBe(to);
  return Object.freeze({ block: syntaxBlock(from, to, children), end: to });
}

function linearOracle(index: BlockIndex, offset: number): BlockIndexEntry {
  const root = index.entries[0];
  if (root === undefined) {
    throw new Error("测试 index 缺 root");
  }
  if (index.range.from === index.range.to) {
    return root;
  }
  const point = offset === index.range.to ? offset - 1 : offset;
  const matches = index.entries.filter(
    (entry) => entry.range.from <= point && point < entry.range.to,
  );
  const deepest = matches.reduce<BlockIndexEntry | undefined>((selected, candidate) => {
    if (selected === undefined || candidate.depth > selected.depth) {
      return candidate;
    }
    return selected;
  }, undefined);
  if (deepest === undefined) {
    throw new Error(`linear oracle 未覆盖 offset ${offset}`);
  }
  return deepest;
}

function assertSortedAndParented(index: BlockIndex): void {
  for (let position = 0; position < index.entries.length; position += 1) {
    const current = index.entries[position];
    if (current === undefined) {
      continue;
    }
    expect(current.index).toBe(position);
    if (position > 0) {
      const previous = index.entries[position - 1];
      if (previous !== undefined) {
        expect(compareEntries(previous, current)).toBeLessThanOrEqual(0);
      }
    }
    if (current.parentIndex !== null) {
      const parent = index.entries[current.parentIndex];
      expect(parent).toBeDefined();
      expect(parent?.depth).toBe(current.depth - 1);
      expect(parent?.range.from).toBeLessThanOrEqual(current.range.from);
      expect(parent?.range.to).toBeGreaterThanOrEqual(current.range.to);
    }
  }
}

function compareEntries(left: BlockIndexEntry, right: BlockIndexEntry): number {
  return (
    left.range.from - right.range.from ||
    right.range.to - left.range.to ||
    left.depth - right.depth ||
    left.index - right.index
  );
}

function documentOf(
  length: number,
  blocks: readonly Block[],
): {
  readonly range: TextRange;
  readonly blocks: readonly Block[];
} {
  return Object.freeze({ range: textRange(0, length), blocks: Object.freeze([...blocks]) });
}

function syntaxBlock(from: number, to: number, children: readonly Block[] = []): SyntaxBlock {
  return Object.freeze({
    kind: "syntax",
    role: "function",
    nodeType: "function_definition",
    range: textRange(from, to),
    children: Object.freeze([...children]),
  });
}

function rawBlock(from: number, to: number): RawBlock {
  return Object.freeze({
    kind: "raw",
    reason: "not-yet-structured",
    range: textRange(from, to),
    children: Object.freeze([]),
  });
}

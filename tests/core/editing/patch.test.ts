import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyEditPlan,
  applyTextPatches,
  createEditPlan,
  createTextPatch,
  type TextPatch,
} from "../../../src/core/editing/index.js";
import { textRange } from "../../../src/core/model.js";

interface PatchLayout {
  readonly prefix: string;
  readonly edits: readonly {
    readonly oldText: string;
    readonly newText: string;
    readonly following: string;
  }[];
}

const tokenArbitrary = fc.constantFrom("a", "中", "\r\n", "\n", "\r", "😀", "\uFEFF", "\0");
const shortTextArbitrary = fc
  .array(tokenArbitrary, { maxLength: 10 })
  .map((tokens) => tokens.join(""));
const patchLayoutArbitrary: fc.Arbitrary<PatchLayout> = fc.record({
  prefix: shortTextArbitrary,
  edits: fc.array(
    fc.record({
      oldText: shortTextArbitrary,
      newText: shortTextArbitrary,
      following: shortTextArbitrary,
    }),
    { maxLength: 12 },
  ),
});

describe("M3a immutable text patch kernel", () => {
  it("sorts old-source ranges and preserves every untouched slice", () => {
    const source = "zero one two three";
    const applied = applyTextPatches(source, [
      patch(13, 18, "THREE"),
      patch(0, 4, "ZERO"),
      patch(5, 8, "ONE"),
    ]);

    expect(applied.source).toBe("ZERO ONE two THREE");
    expect(applied.plan.patches.map(({ range }) => [range.from, range.to])).toEqual([
      [0, 4],
      [5, 8],
      [13, 18],
    ]);
    expect(applied.source.slice(4, 5)).toBe(source.slice(4, 5));
    expect(applied.source.slice(8, 13)).toBe(source.slice(8, 13));
  });

  it("stably merges same-point insertions in caller order", () => {
    const plan = createEditPlan("ab", [
      patch(1, 1, "first"),
      patch(0, 0, "start"),
      patch(1, 1, "-second"),
      patch(1, 1, "-third"),
    ]);

    expect(plan.patches).toEqual([patch(0, 0, "start"), patch(1, 1, "first-second-third")]);
    expect(applyEditPlan("ab", plan).source).toBe("startafirst-second-thirdb");
  });

  it("accepts insertions on replacement boundaries and makes inverse ordering exact", () => {
    const source = "abc";
    const applied = applyTextPatches(source, [patch(1, 2, ""), patch(2, 2, "X"), patch(1, 1, "Y")]);

    expect(applied.source).toBe("aYXc");
    expect(
      applied.inversePatches.map(({ range, newText }) => [range.from, range.to, newText]),
    ).toEqual([
      [1, 2, ""],
      [2, 2, "b"],
      [2, 3, ""],
    ]);
    expect(applyTextPatches(applied.source, applied.inversePatches).source).toBe(source);
  });

  it("reports exact before and candidate ranges for growing, shrinking and insertion edits", () => {
    const applied = applyTextPatches("abcdef", [
      patch(1, 3, "LONG"),
      patch(4, 5, ""),
      patch(6, 6, "!"),
    ]);

    expect(applied.source).toBe("aLONGdf!");
    expect(applied.diffs).toEqual([
      {
        beforeRange: textRange(1, 3),
        afterRange: textRange(1, 5),
        beforeText: "bc",
        afterText: "LONG",
      },
      {
        beforeRange: textRange(4, 5),
        afterRange: textRange(6, 6),
        beforeText: "e",
        afterText: "",
      },
      {
        beforeRange: textRange(6, 6),
        afterRange: textRange(7, 8),
        beforeText: "",
        afterText: "!",
      },
    ]);
    expect(applyTextPatches(applied.source, applied.inversePatches).source).toBe("abcdef");
  });

  it("uses raw UTF-16 code-unit boundaries without normalizing BOM, CRLF or surrogates", () => {
    const source = "\uFEFFA\r\n😀Z";
    expect(source.length).toBe(7);

    const applied = applyTextPatches(source, [
      patch(0, 1, ""),
      patch(2, 4, "\n"),
      patch(5, 6, "X"),
    ]);
    expect(applied.source).toBe("A\n\ud83dXZ");
    expect(applyTextPatches(applied.source, applied.inversePatches).source).toBe(source);
  });

  it("handles empty source, EOF insertion, full replacement and no-op elimination", () => {
    expect(applyTextPatches("", [patch(0, 0, "hello")]).source).toBe("hello");
    expect(applyTextPatches("ab", [patch(2, 2, "!")]).source).toBe("ab!");
    expect(applyTextPatches("ab", [patch(0, 2, "x")]).source).toBe("x");

    const plan = createEditPlan("ab", [patch(0, 1, "a"), patch(2, 2, "")]);
    expect(plan.patches).toEqual([]);
    expect(plan.candidateLength).toBe(2);
  });

  it("rejects invalid, out-of-bounds and overlapping old-source ranges", () => {
    expect(() => createEditPlan("abc", [rawPatch(-1, 0, "x")])).toThrow(RangeError);
    expect(() => createEditPlan("abc", [rawPatch(2, 1, "x")])).toThrow(RangeError);
    expect(() => createEditPlan("abc", [rawPatch(0.5, 1, "x")])).toThrow(RangeError);
    expect(() => createEditPlan("abc", [patch(2, 4, "x")])).toThrow(/越出/u);
    expect(() => createEditPlan("abc", [patch(0, 2, "x"), patch(1, 3, "y")])).toThrow(/重叠/u);
    expect(() => createEditPlan("abc", [patch(0, 3, "x"), patch(1, 1, "y")])).toThrow(/严格位于/u);
  });

  it("rejects applying a plan to a different-length source or a non-canonical plan", () => {
    const plan = createEditPlan("abc", [patch(1, 2, "X")]);
    expect(() => applyEditPlan("abcd", plan)).toThrow(/绑定长度/u);
    expect(() =>
      applyEditPlan("abc", {
        sourceLength: 3,
        candidateLength: 3,
        patches: [patch(2, 3, "X"), patch(0, 1, "Y")],
      }),
    ).toThrow(/规范化/u);
  });

  it("deep-freezes plans, patches, diffs, inverses and application results", () => {
    const inputRange = { from: 0, to: 1 } as unknown as TextPatch["range"];
    const inputPatch = { range: inputRange, newText: "x" };
    const plan = createEditPlan("a", [inputPatch]);
    const applied = applyEditPlan("a", plan);

    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.patches)).toBe(true);
    expect(Object.isFrozen(plan.patches[0])).toBe(true);
    expect(Object.isFrozen(plan.patches[0]?.range)).toBe(true);
    expect(Object.isFrozen(applied)).toBe(true);
    expect(Object.isFrozen(applied.diffs)).toBe(true);
    expect(Object.isFrozen(applied.diffs[0])).toBe(true);
    expect(Object.isFrozen(applied.inversePatches)).toBe(true);
    expect(Object.isFrozen(applied.inversePatches[0])).toBe(true);
    expect(plan.patches[0]?.range).not.toBe(inputRange);
  });

  it("round-trips arbitrary disjoint UTF-16 patches and preserves untouched fragments", () => {
    fc.assert(
      fc.property(patchLayoutArbitrary, (layout) => {
        const fixture = buildFixture(layout);
        const applied = applyTextPatches(fixture.source, fixture.patches);

        expect(applied.source).toBe(fixture.expected);
        expect(applyTextPatches(applied.source, applied.inversePatches).source).toBe(
          fixture.source,
        );
        expect(applied.plan.candidateLength).toBe(applied.source.length);
        assertUntouchedFragments(fixture.source, applied.source, applied.diffs);
      }),
      { numRuns: 1000, seed: 0xe017d1ff },
    );
  });
});

function patch(from: number, to: number, newText: string): TextPatch {
  return createTextPatch(textRange(from, to), newText);
}

function rawPatch(from: number, to: number, newText: string): TextPatch {
  return { range: { from, to } as TextPatch["range"], newText };
}

function buildFixture(layout: PatchLayout): {
  readonly source: string;
  readonly expected: string;
  readonly patches: readonly TextPatch[];
} {
  let source = layout.prefix;
  let expected = layout.prefix;
  const patches: TextPatch[] = [];

  for (const edit of layout.edits) {
    const from = source.length;
    source += edit.oldText;
    const to = source.length;
    source += edit.following;
    expected += edit.newText + edit.following;
    patches.push(patch(from, to, edit.newText));
  }

  return { source, expected, patches };
}

function assertUntouchedFragments(
  before: string,
  after: string,
  diffs: readonly import("../../../src/core/editing/index.js").EditDiff[],
): void {
  let beforeCursor = 0;
  let afterCursor = 0;
  for (const diff of diffs) {
    const beforeFragment = before.slice(beforeCursor, diff.beforeRange.from);
    const afterFragment = after.slice(afterCursor, diff.afterRange.from);
    expect(afterFragment).toBe(beforeFragment);
    beforeCursor = diff.beforeRange.to;
    afterCursor = diff.afterRange.to;
  }
  expect(after.slice(afterCursor)).toBe(before.slice(beforeCursor));
}

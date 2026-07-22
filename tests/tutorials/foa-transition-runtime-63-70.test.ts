import { describe, expect, it } from "vitest";
import { FOA_LESSONS } from "../../src/tutorials/foa-curriculum.js";
import {
  createFoaTransitionRuntime63,
  createFoaTransitionRuntime70,
  getFoaTransitionRuntimePrototype,
  type FoaTransitionRuntimePrototype,
} from "../../src/tutorials/foa-transition-runtime-63-70.js";

describe("FOA transition runtime prototypes 63 and 70", () => {
  it.each([63, 70] as const)(
    "keeps lesson %i explicitly bounded to teaching-model evidence",
    (order) => {
      const prototype = getFoaTransitionRuntimePrototype(order);
      const lesson = FOA_LESSONS[order - 1]!;

      expect(prototype.lessonId).toBe(lesson.id);
      expect(prototype.evidence).toMatchObject({
        provenance: "teaching-model",
        traceStatus: "awaiting-instrumented-trace",
        canClaimRealTrace: false,
        sourceFingerprintRequired: true,
      });
      expect(prototype.frames.every(({ provenance }) => provenance === "teaching-model")).toBe(
        true,
      );
      expect(prototype.frames.at(-1)?.phase).toBe("output");
      expectDeepFrozen(prototype);
    },
  );

  it.each([63, 70] as const)(
    "binds every lesson %i upgrade anchor to one exact authored source slice",
    (order) => {
      const prototype = getFoaTransitionRuntimePrototype(order);
      const source = FOA_LESSONS[order - 1]!.code.text;

      for (const anchor of prototype.sourceAnchors) {
        const first = source.indexOf(anchor.exact);
        expect(first, anchor.id).toBeGreaterThanOrEqual(0);
        expect(source.indexOf(anchor.exact, first + 1), anchor.id).toBe(-1);
      }
      expect(
        prototype.frames.every((frame) =>
          prototype.sourceAnchors.some((anchor) => anchor.id === frame.sourceAnchorId),
        ),
      ).toBe(true);
    },
  );

  it("models lesson 63 as one object, one pointer alias, and one scalar write", () => {
    const prototype = getFoaTransitionRuntimePrototype(63);
    const alias = prototype.relations.find(({ kind }) => kind === "object-link");
    const fieldAccess = prototype.relations.find(({ kind }) => kind === "field-access");
    const write = prototype.frames.find(({ phase }) => phase === "write");

    expect(alias).toMatchObject({
      fromObjectId: "63.object.link",
      toObjectId: "63.object.counter",
    });
    expect(fieldAccess).toMatchObject({
      fromObjectId: "63.object.link",
      toObjectId: "63.object.counter.value",
    });
    expect(write).toMatchObject({
      state: { counterValue: 5, linkTarget: "counter" },
      changes: [{ objectId: "63.object.counter.value", before: 4, after: 5 }],
    });
    expect(prototype.frames.filter(({ phase }) => phase === "write")).toHaveLength(1);
    expect(prototype.stdout).toBe("5\n");
  });

  it("lets lesson 63 drive the alias write from a bounded learner-selected value", () => {
    const prototype = createFoaTransitionRuntime63(-9);
    const inputFrame = prototype.frames.find(({ id }) => id === "63.frame.input");
    const write = prototype.frames.find(({ phase }) => phase === "write");

    expect(prototype.modelInput).toEqual({ initialValue: -9 });
    expect(prototype.stdin).toBe("-9\n");
    expect(prototype.frames[0]?.state).toMatchObject({ inputValue: -9, counterValue: null });
    expect(inputFrame).toMatchObject({
      sourceAnchorId: "63.input",
      state: { inputValue: -9, counterValue: -9 },
      changes: [{ objectId: "63.object.counter.value", before: null, after: -9 }],
      activeRelationIds: ["63.relation.input-write"],
    });
    expect(write?.changes).toEqual([
      { objectId: "63.object.counter.value", before: -9, after: -8 },
    ]);
    expect(prototype.frames.at(-1)?.state).toMatchObject({ counterValue: -8, output: "-8" });
    expect(prototype.stdout).toBe("-8\n");
    expect(prototype.evidence.canClaimRealTrace).toBe(false);
    expect(FOA_LESSONS[62]!.code.text).toContain("struct Counter counter;");
    expect(FOA_LESSONS[62]!.code.text).not.toContain("struct Counter counter = {4};");

    expect(() => createFoaTransitionRuntime63(-1_000)).toThrow(/initial value/u);
    expect(() => createFoaTransitionRuntime63(1.5)).toThrow(/initial value/u);
    expect(() => createFoaTransitionRuntime63(Number.NaN)).toThrow(/initial value/u);
  });

  it("models lesson 70 with exact low/mid/high narrowing and both branch outcomes", () => {
    const prototype = getFoaTransitionRuntimePrototype(70);
    const compareFrames = prototype.frames.filter(({ phase }) => phase === "compare");
    const branchFrames = prototype.frames.filter(({ phase }) => phase === "branch");

    expect(compareFrames.map(({ state }) => [state.low, state.mid, state.high])).toEqual([
      [0, 2, 5],
      [3, 4, 5],
      [3, 3, 4],
    ]);
    expect(compareFrames.map(({ branchOutcome }) => branchOutcome)).toEqual([true, false, false]);
    expect(branchFrames.map(({ activeRelationIds }) => activeRelationIds)).toEqual([
      ["70.relation.true"],
      ["70.relation.false"],
      ["70.relation.false"],
    ]);
    expect(branchFrames.map(({ changes }) => changes)).toEqual([
      [{ objectId: "70.object.low", before: 0, after: 3 }],
      [{ objectId: "70.object.high", before: 5, after: 4 }],
      [{ objectId: "70.object.high", before: 4, after: 3 }],
    ]);
    expect(prototype.frames.at(-1)?.state).toMatchObject({ low: 3, mid: 3, high: 3, output: 3 });
    expect(prototype.stdout).toBe("3\n");
  });

  it("lets lesson 70 model duplicate values and returns the first insertion position", () => {
    const prototype = createFoaTransitionRuntime70([-2, 0, 0, 5], 0);
    const compareFrames = prototype.frames.filter(({ phase }) => phase === "compare");

    expect(prototype.modelInput).toEqual({ values: "[-2, 0, 0, 5]", target: 0 });
    expect(compareFrames.map(({ branchOutcome }) => branchOutcome)).toEqual([false, false, true]);
    expect(prototype.frames.at(-1)?.state).toMatchObject({ low: 1, high: 1, output: 1 });
    expect(prototype.stdout).toBe("1\n");
    expect(prototype.evidence.canClaimRealTrace).toBe(false);
  });

  it("validates lesson 70 input shape and ordering before building frames", () => {
    expect(() => createFoaTransitionRuntime70([1], 1)).toThrow(/2 to 12/u);
    expect(() =>
      createFoaTransitionRuntime70(
        Array.from({ length: 13 }, (_, index) => index),
        1,
      ),
    ).toThrow(/2 to 12/u);
    expect(() => createFoaTransitionRuntime70([1, 3, 2], 2)).toThrow(/non-decreasing/u);
    expect(() => createFoaTransitionRuntime70([1, 1.5], 1)).toThrow(/values\[1\]/u);
    expect(() => createFoaTransitionRuntime70([1, 2], Number.POSITIVE_INFINITY)).toThrow(/target/u);
    expect(() => createFoaTransitionRuntime70([1, 2_147_483_648], 2)).toThrow(/values\[1\]/u);
    expect(() => createFoaTransitionRuntime70([1, 2], -2_147_483_649)).toThrow(/target/u);
  });

  it("preserves the lower-bound interval invariant in every lesson 70 model frame", () => {
    const prototype = getFoaTransitionRuntimePrototype(70);
    for (const frame of prototype.frames) {
      const { low, mid, high } = frame.state;
      if (typeof low !== "number" || typeof high !== "number") continue;
      expect(low, frame.id).toBeGreaterThanOrEqual(0);
      expect(high, frame.id).toBeLessThanOrEqual(5);
      expect(low, frame.id).toBeLessThanOrEqual(high);
      if (
        typeof mid === "number" &&
        low < high &&
        (frame.phase === "calculate" || frame.phase === "compare")
      ) {
        expect(mid, frame.id).toBeGreaterThanOrEqual(low);
        expect(mid, frame.id).toBeLessThan(high);
      }
    }
  });
});

function expectDeepFrozen(prototype: FoaTransitionRuntimePrototype): void {
  expect(Object.isFrozen(prototype)).toBe(true);
  expect(Object.isFrozen(prototype.evidence)).toBe(true);
  expect(Object.isFrozen(prototype.modelInput)).toBe(true);
  expect(Object.isFrozen(prototype.sourceAnchors)).toBe(true);
  expect(Object.isFrozen(prototype.objects)).toBe(true);
  expect(Object.isFrozen(prototype.relations)).toBe(true);
  expect(Object.isFrozen(prototype.frames)).toBe(true);
  for (const frame of prototype.frames) {
    expect(Object.isFrozen(frame)).toBe(true);
    expect(Object.isFrozen(frame.state)).toBe(true);
    expect(Object.isFrozen(frame.changes)).toBe(true);
    expect(Object.isFrozen(frame.activeObjectIds)).toBe(true);
    expect(Object.isFrozen(frame.activeRelationIds)).toBe(true);
  }
}

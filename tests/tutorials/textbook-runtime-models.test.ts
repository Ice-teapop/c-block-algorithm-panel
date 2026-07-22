import { describe, expect, it } from "vitest";
import {
  createEuclidTimeline,
  createFactorialTimeline,
  createInputSquareTimeline,
  createLinkedListInsertionTimeline,
  createTextbookInsertionTimeline,
} from "../../src/tutorials/textbook-runtime-models.js";

describe("textbook-specific variable runtime timelines", () => {
  it("keeps the input-square path short and explicit", () => {
    const timeline = createInputSquareTimeline(7);
    expect(timeline.mechanism).toBe("input-square");
    expect(timeline.events.map(({ kind }) => kind)).toEqual(["input", "bind", "update", "output"]);
    expect(timeline.events.at(-1)?.state).toEqual({ result: 49 });
  });

  it("derives Euclid event count from the actual remainder chain", () => {
    const short = createEuclidTimeline(48, 18);
    const long = createEuclidTimeline(55, 34);
    expect(
      short.events.map(({ state }) => state.remainder).filter((value) => value !== undefined),
    ).toEqual([12, 6, 0]);
    expect(short.events.at(-1)?.state).toEqual({ gcd: 6 });
    expect(long.events.length).toBeGreaterThan(short.events.length);
  });

  it("shows every factorial descent and unwind frame", () => {
    const timeline = createFactorialTimeline(5);
    expect(timeline.events.filter(({ kind }) => kind === "call")).toHaveLength(5);
    expect(timeline.events.filter(({ kind }) => kind === "return")).toHaveLength(5);
    expect(timeline.events.at(-1)?.state).toEqual({ product: 120 });
  });

  it("uses the textbook adjacent-swap path and preserves duplicate values", () => {
    const timeline = createTextbookInsertionTimeline([3, 1, 3, 2, 1, 2]);
    expect(timeline.mechanism).toBe("insertion-adjacent-swap");
    expect(timeline.events.some(({ id }) => id.startsWith("swap-"))).toBe(true);
    expect(timeline.events.at(-1)?.state.values).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it("exposes traversal, allocation, and both pointer writes for list insertion", () => {
    const timeline = createLinkedListInsertionTimeline([10, 30, 40], 1, 20);
    expect(timeline.events.map(({ kind }) => kind)).toEqual([
      "input",
      "compare",
      "allocate",
      "link",
      "link",
      "output",
    ]);
    expect(timeline.events.at(-1)?.state.values).toEqual([10, 20, 30, 40]);
  });

  it("deep-freezes authored state so replay cannot mutate evidence", () => {
    const timeline = createTextbookInsertionTimeline([2, 1]);
    expect(Object.isFrozen(timeline)).toBe(true);
    expect(Object.isFrozen(timeline.events)).toBe(true);
    for (const event of timeline.events) {
      expect(Object.isFrozen(event)).toBe(true);
      expect(Object.isFrozen(event.label)).toBe(true);
      expect(Object.isFrozen(event.state)).toBe(true);
      expect(Object.isFrozen(event.activeIndices)).toBe(true);
      const values = event.state.values;
      if (Array.isArray(values)) expect(Object.isFrozen(values)).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  INSERTION_SORT_LAB_CASES,
  INSERTION_SORT_LAB_SOURCE,
  INSERTION_SORT_SHIFT_OPTIMIZED_SOURCE,
  INSERTION_SORT_SEMANTIC_RELATIONS,
  INSERTION_SORT_TEACHING_EVENT_DURATIONS,
  createInsertionSortTeachingFrames,
  createInsertionSortTeachingTimeline,
  insertionSortSnapshotValues,
  matchInsertionSortTutorialSignature,
  matchTextbookInsertionSortTutorialSignature,
  parseInsertionSortCustomInput,
  reduceInsertionSortTeachingEvent,
  seekInsertionSortTeachingTimeline,
  validateInsertionSortLearnerAction,
} from "../../src/tutorials/insertion-sort-lab.js";

describe("insertion-sort task lesson model", () => {
  it("matches only the complete lesson structure and publishes exact source evidence", () => {
    const complete = matchTextbookInsertionSortTutorialSignature(INSERTION_SORT_LAB_SOURCE);
    expect(complete.status).toBe("matched");
    expect(complete.matchedCount).toBe(5);
    expect(complete.totalCount).toBe(5);
    expect(complete.evidence.every((item) => item.matched && item.sourceLine !== null)).toBe(true);

    const missingSwap = matchTextbookInsertionSortTutorialSignature(
      INSERTION_SORT_LAB_SOURCE.replace("      values[j] = temporary;\n", ""),
    );
    expect(missingSwap.status).toBe("partial");
    expect(missingSwap.evidence.find((item) => item.id === "swap-right")?.matched).toBe(false);

    const optimized = matchInsertionSortTutorialSignature(INSERTION_SORT_SHIFT_OPTIMIZED_SOURCE);
    expect(optimized).toMatchObject({ status: "matched", matchedCount: 5, totalCount: 5 });

    const unrelated = matchTextbookInsertionSortTutorialSignature("int main(void) { return 0; }");
    expect(unrelated.status).toBe("not-matched");
  });

  it("produces deterministic teaching frames without claiming real Trace evidence", () => {
    const frames = createInsertionSortTeachingFrames([5, 2, 4, 6, 1]);
    expect(frames[0]?.phase).toBe("ready");
    expect(frames.at(-1)).toMatchObject({
      phase: "complete",
      values: [1, 2, 4, 5, 6],
      metrics: { comparisons: 8, shifts: 6, writes: 10 },
    });
    expect(
      frames.some((frame) => frame.phase === "compare" && frame.comparisonResult === false),
    ).toBe(true);
    expect(frames.some((frame) => frame.activeRelationId === "predecessor-to-slot")).toBe(true);
    expect(Object.isFrozen(frames)).toBe(true);
    expect(frames.every((frame) => Object.isFrozen(frame) && Object.isFrozen(frame.values))).toBe(
      true,
    );
  });

  it("sorts every fixed teaching case and keeps semantic relations anchored to source lines", () => {
    for (const labCase of INSERTION_SORT_LAB_CASES) {
      expect(createInsertionSortTeachingFrames(labCase.input).at(-1)?.values).toEqual(
        labCase.expected,
      );
    }
    expect(INSERTION_SORT_SEMANTIC_RELATIONS.map(({ id }) => id)).toEqual([
      "array-to-key",
      "predecessor-to-condition",
      "predecessor-to-slot",
      "key-to-slot",
    ]);
    expect(INSERTION_SORT_SEMANTIC_RELATIONS.every(({ sourceLine }) => sourceLine > 0)).toBe(true);
  });

  it("rejects invalid teaching inputs", () => {
    expect(() => createInsertionSortTeachingFrames([])).toThrow(/1 到 256/u);
    expect(() => createInsertionSortTeachingFrames([Number.NaN])).toThrow(/安全整数/u);
    expect(() => createInsertionSortTeachingFrames(Array.from({ length: 257 }, () => 1))).toThrow(
      /1 到 256/u,
    );
  });

  it("keeps duplicate values as distinct stable tokens while slots move", () => {
    const timeline = createInsertionSortTeachingTimeline([3, 1, 3, 2, 1, 2]);
    const threes = timeline.initialState.tokens.filter((token) => token.value === 3);
    const ones = timeline.initialState.tokens.filter((token) => token.value === 1);

    expect(threes).toHaveLength(2);
    expect(ones).toHaveLength(2);
    expect(new Set(threes.map((token) => token.id)).size).toBe(2);
    expect(new Set(timeline.finalState.slots.map((slot) => slot.tokenId)).size).toBe(6);
    expect(insertionSortSnapshotValues(timeline.finalState)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(timeline.finalState.key).toBeNull();
    expect(timeline.finalState.hole).toBeNull();
  });

  it("replays and seeks the semantic timeline deterministically", () => {
    const timeline = createInsertionSortTeachingTimeline([5, 2, 4, 6, 1]);
    let replayed = timeline.initialState;
    for (const [index, event] of timeline.events.entries()) {
      replayed = reduceInsertionSortTeachingEvent(replayed, event);
      expect(replayed).toEqual(seekInsertionSortTeachingTimeline(timeline, index + 1));
    }

    expect(replayed).toEqual(timeline.finalState);
    expect(insertionSortSnapshotValues(replayed)).toEqual([1, 2, 4, 5, 6]);
    expect(replayed.metrics).toEqual({ comparisons: 8, shifts: 6, writes: 10 });
    expect(replayed.complete).toBe(true);
    expect(timeline.events.map((event) => event.kind)).toContain("settle");
    expect(
      timeline.events.every(
        (event) =>
          event.durationMs === INSERTION_SORT_TEACHING_EVENT_DURATIONS[event.kind] &&
          event.sourceLine > 0 &&
          event.type === event.kind,
      ),
    ).toBe(true);
    expect(() => seekInsertionSortTeachingTimeline(timeline, timeline.events.length + 1)).toThrow(
      /超出范围/u,
    );
  });

  it("validates pick, prediction, shift and insert learner actions against semantic events", () => {
    const timeline = createInsertionSortTeachingTimeline([5, 2]);
    const pick = timeline.events.find((event) => event.kind === "pick-key")!;
    const compare = timeline.events.find((event) => event.kind === "compare")!;
    const shift = timeline.events.find((event) => event.kind === "shift")!;
    const insert = timeline.events.find((event) => event.kind === "insert")!;

    expect(
      validateInsertionSortLearnerAction(pick, {
        type: "pick-key",
        tokenId: pick.kind === "pick-key" ? pick.tokenId : "",
        fromSlot: 1,
      }),
    ).toMatchObject({ accepted: true, code: "accepted" });
    expect(
      validateInsertionSortLearnerAction(compare, {
        type: "prediction",
        shouldShift: false,
      }),
    ).toMatchObject({ accepted: false, code: "wrong-prediction" });
    expect(
      validateInsertionSortLearnerAction(shift, {
        type: "shift",
        tokenId: shift.kind === "shift" ? shift.tokenId : "",
        fromSlot: 0,
        toSlot: 1,
      }),
    ).toMatchObject({ accepted: true });
    expect(
      validateInsertionSortLearnerAction(insert, {
        type: "insert",
        tokenId: insert.kind === "insert" ? insert.tokenId : "",
        toSlot: 0,
      }),
    ).toMatchObject({ accepted: true });
  });

  it("parses only 2-12 safe integers for free lesson experiments", () => {
    expect(parseInsertionSortCustomInput("5, 2  4,6 1")).toEqual({
      ok: true,
      values: [5, 2, 4, 6, 1],
    });
    expect(parseInsertionSortCustomInput("")).toEqual({ ok: false, code: "empty" });
    expect(parseInsertionSortCustomInput("5")).toEqual({ ok: false, code: "too-few" });
    expect(parseInsertionSortCustomInput("5 2.5")).toEqual({
      ok: false,
      code: "invalid-token",
    });
    expect(parseInsertionSortCustomInput("5 two")).toEqual({
      ok: false,
      code: "invalid-token",
    });
    expect(parseInsertionSortCustomInput("9007199254740992 1")).toEqual({
      ok: false,
      code: "unsafe-integer",
    });
    expect(
      parseInsertionSortCustomInput(Array.from({ length: 13 }, (_, index) => index).join(" ")),
    ).toEqual({
      ok: false,
      code: "too-many",
    });
  });
});

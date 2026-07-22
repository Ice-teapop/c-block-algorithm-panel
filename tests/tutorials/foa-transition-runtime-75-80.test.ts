import { describe, expect, it } from "vitest";
import { FOA_LESSONS } from "../../src/tutorials/foa-catalog.js";
import {
  assertFoaTransitionRuntime7580Anchors,
  createFoaTransitionRuntime75,
  createFoaTransitionRuntime80,
  createFoaTransitionRuntime7580,
  type FoaTransitionRuntime7580Event,
} from "../../src/tutorials/foa-transition-runtime-75-80.js";

describe("FOA transition prototype 75 · recursive call stack", () => {
  it("models one real call chain and LIFO returns without claiming a real Trace", () => {
    const timeline = createFoaTransitionRuntime75(4);
    const enters = eventsOfKind(timeline.events, "call-enter");
    const exits = eventsOfKind(timeline.events, "call-exit");

    expect(timeline.provenance).toMatchObject({
      kind: "teaching-model",
      lessonId: "tutorial.foa.c09.l075",
      caseId: "moves-4",
    });
    expect(timeline.provenance).not.toHaveProperty("sessionId");
    expect(timeline.verification).toBe("simulation-only");
    expect(enters.map((event) => activeDepth(event))).toEqual([0, 1, 2, 3, 4]);
    expect(exits.map((event) => activeDepth(event))).toEqual([4, 3, 2, 1, 0]);
    expect(exits.map((event) => activeFrame(event).returnValue)).toEqual([0, 1, 3, 7, 15]);
    expect(timeline.events.map(({ sequence }) => sequence)).toEqual(
      Array.from({ length: timeline.events.length }, (_, index) => index),
    );
    expect(timeline.stdout).toBe("15\n");
  });

  it("uses unique exact source anchors and fails closed on missing or ambiguous slices", () => {
    const lesson = lessonByOrder(75);
    const timeline = createFoaTransitionRuntime7580(75);
    expect(() => assertFoaTransitionRuntime7580Anchors(lesson.code.text, timeline)).not.toThrow();
    expect(() => assertFoaTransitionRuntime7580Anchors("int main(void) {}", timeline)).toThrow(
      /exactly once/u,
    );
    expect(() =>
      assertFoaTransitionRuntime7580Anchors(
        `${lesson.code.text}\n${timeline.anchors[0]!.exact}`,
        timeline,
      ),
    ).toThrow(/exactly once/u);
  });

  it("keeps result growth separate from runtime complexity in the course definition", () => {
    const lesson = lessonByOrder(75);
    expect(lesson.title.zh).toContain("调用栈");
    expect(lesson.title.en).toContain("call stack");
    expect(lesson.complexity).toMatchObject({ time: "O(n)", space: "O(n)" });
    expect(lesson.experience.visualFamily).toBe("call-stack");
    expect(lesson.experience.persistentEvidence.zh).toContain("不等于执行了");
  });

  it("rejects disk counts that would create an unbounded teaching stack", () => {
    expect(() => createFoaTransitionRuntime75(-1)).toThrow(RangeError);
    expect(() => createFoaTransitionRuntime75(13)).toThrow(RangeError);
    expect(() => createFoaTransitionRuntime7580(75, [[1, 1, 1]] as unknown as number)).toThrow(
      TypeError,
    );
  });
});

describe("FOA transition prototype 80 · two-dimensional array dependencies", () => {
  it("emits dependency-read and array-write pairs in C statement order", () => {
    const timeline = createFoaTransitionRuntime80();
    const writes = eventsOfKind(timeline.events, "array-write");
    const reads = eventsOfKind(timeline.events, "dependency-read");
    const finalMatrix = timeline.events.at(-1)!.matrix;

    expect(timeline.provenance).toMatchObject({
      kind: "teaching-model",
      lessonId: "tutorial.foa.c09.l080",
    });
    expect(timeline.verification).toBe("simulation-only");
    expect(reads).toHaveLength(7);
    expect(writes).toHaveLength(8);
    expect(finalMatrix).toEqual([
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 1],
    ]);
    expect(timeline.stdout).toBe("1\n");

    for (const write of writes.slice(1)) {
      expect(write.dependencies).toHaveLength(1);
      expect(write.dependencies[0]!.to).toEqual(write.activeCell);
      const previous = timeline.events[write.sequence - 1]!;
      expect(previous.kind).toBe("dependency-read");
      expect(previous.dependencies).toEqual(write.dependencies);
      expect(previous.sourceAnchorId).toBe(write.sourceAnchorId);
    }
  });

  it("supports a bounded teaching-only variant while retaining exact trace anchors", () => {
    const timeline = createFoaTransitionRuntime7580(80, [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ]);
    const lesson = lessonByOrder(80);

    expect(timeline.stdout).toBe("6\n");
    expect(timeline.provenance.kind).toBe("teaching-model");
    expect(timeline.provenance.caseId).toBe("open-111111111");
    expect(() => assertFoaTransitionRuntime7580Anchors(lesson.code.text, timeline)).not.toThrow();
  });

  it("keeps the grid and all frame snapshots immutable", () => {
    const timeline = createFoaTransitionRuntime80();
    expect(Object.isFrozen(timeline)).toBe(true);
    expect(Object.isFrozen(timeline.events)).toBe(true);
    expect(Object.isFrozen(timeline.events[0]!.matrix[0])).toBe(true);
    expect(() => {
      (timeline.events[0]!.matrix[0] as number[])[0] = 99;
    }).toThrow(TypeError);
    expect(timeline.events.at(-1)!.matrix[0]![0]).toBe(1);
  });

  it("rejects shapes or cell values that cannot match the authored 3×3 algorithm", () => {
    expect(() => createFoaTransitionRuntime80([[1, 1, 1]])).toThrow(/3×3/u);
    expect(() =>
      createFoaTransitionRuntime80([
        [1, 2, 1],
        [1, 1, 1],
        [1, 1, 1],
      ]),
    ).toThrow(/0 or 1/u);
    expect(() =>
      createFoaTransitionRuntime80([
        [0, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ]),
    ).toThrow(/open start/u);
  });

  it("names the implemented algorithm as dynamic programming rather than enumeration", () => {
    const lesson = lessonByOrder(80);
    expect(lesson.title.zh).toContain("动态规划");
    expect(lesson.title.en).toContain("dynamic programming");
    expect(lesson.summary.en).toContain("above and to the left");
    expect(lesson.complexity).toMatchObject({ time: "O(rows*cols)", space: "O(rows*cols)" });
  });
});

function lessonByOrder(order: 75 | 80) {
  const lesson = FOA_LESSONS.find((candidate) => candidate.order === order);
  if (lesson === undefined) throw new Error(`Missing FOA lesson ${String(order)}`);
  return lesson;
}

function eventsOfKind(
  events: readonly FoaTransitionRuntime7580Event[],
  kind: FoaTransitionRuntime7580Event["kind"],
): readonly FoaTransitionRuntime7580Event[] {
  return events.filter((event) => event.kind === kind);
}

function activeFrame(event: FoaTransitionRuntime7580Event) {
  const frame = event.stackFrames.find(({ frameId }) => frameId === event.activeFrameId);
  if (frame === undefined) throw new Error(`Event ${event.id} has no active frame`);
  return frame;
}

function activeDepth(event: FoaTransitionRuntime7580Event): number {
  return activeFrame(event).depth;
}

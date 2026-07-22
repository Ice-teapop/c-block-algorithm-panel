import { describe, expect, it } from "vitest";
import {
  createFoaFlowLessonGraph,
  FOA_FLOW_LESSON_MODELS,
  getFoaFlowLessonModel,
  type FoaFlowFrame,
} from "../../src/tutorials/foa-flow-lesson-models.js";
import { createFlowTimeline } from "../../src/tutorials/flow-lesson-model.js";

describe("FOA flow lesson models", () => {
  it("registers the reviewed input-driven lessons with bounded integer inputs", () => {
    expect(Object.keys(FOA_FLOW_LESSON_MODELS)).toEqual(["2", "5", "16", "22"]);
    expect(getFoaFlowLessonModel(2)?.input).toMatchObject({
      minimum: -99,
      maximum: 99,
      defaultValue: 7,
    });
    expect(getFoaFlowLessonModel({ order: 16 })?.input).toMatchObject({
      minimum: -99,
      maximum: 99,
      defaultValue: -7,
    });
    expect(getFoaFlowLessonModel(5)?.input).toMatchObject({
      minimum: -99,
      maximum: 99,
      defaultValue: 0,
    });
    expect(getFoaFlowLessonModel(22)?.input).toMatchObject({
      minimum: 0,
      maximum: 12,
      defaultValue: 5,
    });
    expect(getFoaFlowLessonModel(3)).toBeNull();
    expect(Object.isFrozen(getFoaFlowLessonModel(2))).toBe(true);
  });

  it("turns lesson 5 into an input, prediction, and evidence-backed three-way branch", () => {
    const model = requiredModel(5);
    expect(model.prediction).toMatchObject({
      nodeId: "boundary.value",
      choices: [{ id: "positive" }, { id: "negative" }, { id: "zero" }],
    });
    expect(Object.isFrozen(model.prediction?.choices)).toBe(true);
    expect(model.nodes.filter((node) => node.role === "output").map((node) => node.id)).toEqual([
      "boundary.output-positive",
      "boundary.output-negative",
      "boundary.output-zero",
    ]);
    expect(
      model.edges
        .filter((edge) => edge.kind === "true" || edge.kind === "false")
        .map((edge) => `${edge.from}->${edge.to}`),
    ).toEqual([
      "boundary.positive->boundary.output-positive",
      "boundary.positive->boundary.negative",
      "boundary.negative->boundary.output-negative",
      "boundary.negative->boundary.output-zero",
    ]);

    const positive = model.buildExecution(8);
    expect(positive.output).toBe("positive");
    expect(positive.stdout).toBe("positive\n");
    expect(positive.frames.map((frame) => frame.nodeId)).toEqual([
      "boundary.input",
      "boundary.value",
      "boundary.positive",
      "boundary.output-positive",
    ]);
    expect(positive.frames[1]?.state).toMatchObject({ value: 8, prediction: "positive" });
    expect(positive.frames[2]?.state).toMatchObject({ condition: true });
    expect(positive.skippedNodeIds).toEqual([
      "boundary.negative",
      "boundary.output-negative",
      "boundary.output-zero",
    ]);

    const negative = model.buildExecution(-4);
    expect(negative.output).toBe("negative");
    expect(negative.frames.map((frame) => frame.nodeId)).toEqual([
      "boundary.input",
      "boundary.value",
      "boundary.positive",
      "boundary.negative",
      "boundary.output-negative",
    ]);
    expect(negative.frames[1]?.state).toMatchObject({ value: -4, prediction: "negative" });
    expect(negative.frames[2]?.state).toMatchObject({ condition: false });
    expect(negative.frames[3]?.state).toMatchObject({ condition: true });

    const zero = model.buildExecution(0);
    expect(zero.output).toBe("zero");
    expect(zero.frames[1]?.state).toMatchObject({ value: 0, prediction: "zero" });
    expect(zero.frames[2]?.state).toMatchObject({ condition: false });
    expect(zero.frames[3]?.state).toMatchObject({ condition: false });
  });

  it("does not leak lesson 5's branch result before the learner reaches comparison evidence", () => {
    const graph = createFoaFlowLessonGraph(requiredModel(5));
    const timeline = createFlowTimeline(graph, 8);

    expect(timeline.map((frame) => frame.activeNodeId)).toEqual([
      "boundary.input",
      "boundary.value",
      "boundary.positive",
      "boundary.output-positive",
    ]);
    expect(timeline[0]?.skippedNodeIds).toEqual([]);
    expect(timeline[1]).toMatchObject({
      activeNodeId: "boundary.value",
      skippedNodeIds: [],
      values: { value: "8", prediction: "positive" },
    });
    expect(timeline[2]).toMatchObject({
      activeNodeId: "boundary.positive",
      activeEdgeIds: ["boundary.positive"],
      skippedNodeIds: ["boundary.negative", "boundary.output-negative", "boundary.output-zero"],
      sourceEventIndex: 1,
    });
    expect(timeline.at(-1)).toMatchObject({
      activeNodeId: "boundary.output-positive",
      output: "positive",
      sourceEventIndex: 3,
    });
  });

  it("models the linear lesson as four nodes and three edges", () => {
    const model = requiredModel(2);
    expect(model.kind).toBe("linear");
    expect(model.nodes.map((node) => node.id)).toEqual([
      "linear.input",
      "linear.value",
      "linear.square",
      "linear.output",
    ]);
    expect(model.edges).toHaveLength(3);

    const execution = model.buildExecution(9);
    expect(execution.output).toBe(81);
    expect(execution.stdout).toBe("81\n");
    expect(execution.frames.map((frame) => frame.nodeId)).toEqual(
      model.nodes.map((node) => node.id),
    );
    expect(execution.frames[0]?.state).toEqual({ input: 9 });
    expect(execution.frames[0]?.state).not.toHaveProperty("value");
    expect(execution.frames[2]?.state).toMatchObject({ value: 9, result: 81 });
    expect(execution.skippedNodeIds).toEqual([]);
  });

  it("models the branch lesson without pseudo input, keep, or merge nodes", () => {
    const model = requiredModel(16);
    const decisionEdges = model.edges.filter((edge) => edge.from === "branch.decision");
    expect(decisionEdges.map((edge) => edge.kind)).toEqual(["true", "false"]);
    expect(model.nodes.map((node) => node.id)).toEqual([
      "branch.decision",
      "branch.update",
      "branch.output",
    ]);
    expect(model.edges).toMatchObject([
      { id: "branch.true", from: "branch.decision", to: "branch.update", kind: "true" },
      { id: "branch.false", from: "branch.decision", to: "branch.output", kind: "false" },
      {
        id: "branch.update-to-output",
        from: "branch.update",
        to: "branch.output",
        kind: "next",
      },
    ]);

    const negative = model.buildExecution(-7);
    expect(negative.output).toBe(7);
    expect(negative.frames.map((frame) => frame.nodeId)).toEqual([
      "branch.decision",
      "branch.update",
      "branch.output",
    ]);
    expect(negative.skippedNodeIds).toEqual([]);
    expect(negative.frames[0]?.edgeId).toBe("branch.true");
    expect(negative.frames.some((frame) => frame.kind === "update")).toBe(true);

    const positive = model.buildExecution(4);
    expect(positive.output).toBe(4);
    expect(positive.frames.map((frame) => frame.nodeId)).toEqual([
      "branch.decision",
      "branch.output",
    ]);
    expect(positive.frames.some((frame) => frame.nodeId === "branch.update")).toBe(false);
    expect(positive.frames.some((frame) => frame.kind === "update")).toBe(false);
    expect(positive.skippedNodeIds).toEqual(["branch.update"]);
    expect(positive.frames[0]?.edgeId).toBe("branch.false");
  });

  it("starts branch prediction at the decision without leaking skipped state", () => {
    const graph = createFoaFlowLessonGraph(requiredModel(16));
    const positive = createFlowTimeline(graph, 4);
    expect(positive.map((frame) => frame.activeNodeId)).toEqual([
      "branch.decision",
      "branch.output",
    ]);
    expect(positive.map((frame) => frame.sourceEventIndex)).toEqual([0, 3]);
    expect(positive[0]).toMatchObject({
      activeEdgeIds: ["branch.false"],
      skippedNodeIds: [],
      sourceEventIndex: 0,
    });
    expect(positive[0]?.summary.zh).not.toContain("假");
    expect(positive[0]?.summary.en).not.toContain("false");
    expect(positive[1]).toMatchObject({
      activeNodeId: "branch.output",
      skippedNodeIds: ["branch.update"],
      sourceEventIndex: 3,
      output: "4",
    });

    const negative = createFlowTimeline(graph, -7);
    expect(negative.map((frame) => frame.activeNodeId)).toEqual([
      "branch.decision",
      "branch.update",
      "branch.output",
    ]);
    expect(negative.map((frame) => frame.sourceEventIndex)).toEqual([0, 2, 3]);
    expect(negative.every((frame) => frame.skippedNodeIds.length === 0)).toBe(true);
  });

  it("builds each loop iteration from condition, body, update, and back frames", () => {
    const model = requiredModel(22);
    expect(model.edges.find((edge) => edge.id === "loop.back")).toMatchObject({
      from: "loop.update",
      to: "loop.condition",
      kind: "back",
    });

    const execution = model.buildExecution(3);
    expect(execution.output).toBe(6);
    expect(statesFor(execution.frames, "condition", "condition")).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(statesFor(execution.frames, "body", "sum")).toEqual([1, 3, 6]);
    expect(statesFor(execution.frames, "update", "i")).toEqual([2, 3, 4]);
    const backFrames = execution.frames.filter((frame) => frame.kind === "back");
    expect(backFrames).toHaveLength(3);
    expect(backFrames.every((frame) => frame.edgeId === "loop.back")).toBe(true);
    expect(execution.frames.at(-1)).toMatchObject({
      kind: "output",
      nodeId: "loop.output",
      state: { i: 4, sum: 6, output: 6, iteration: 3 },
    });
  });

  it("takes the false edge directly to output when n is zero", () => {
    const execution = requiredModel(22).buildExecution(0);
    expect(execution.output).toBe(0);
    expect(execution.frames.map((frame) => frame.kind)).toEqual(["state", "condition", "output"]);
    expect(execution.frames[1]).toMatchObject({
      nodeId: "loop.condition",
      edgeId: "loop.false",
      state: { n: 0, i: 1, sum: 0, condition: false },
    });
    expect(execution.skippedNodeIds).toContain("loop.body");
    expect(execution.skippedNodeIds).toContain("loop.update");
  });

  it("rejects non-integers and inputs outside each lesson range", () => {
    expect(() => requiredModel(2).buildExecution(1.5)).toThrow(RangeError);
    expect(() => requiredModel(5).buildExecution(-100)).toThrow(RangeError);
    expect(() => requiredModel(16).buildExecution(100)).toThrow(RangeError);
    expect(() => requiredModel(22).buildExecution(-1)).toThrow(RangeError);
    expect(() => requiredModel(22).buildExecution(13)).toThrow(RangeError);
  });

  it("provides bilingual labels and summaries for every public teaching object", () => {
    for (const model of Object.values(FOA_FLOW_LESSON_MODELS)) {
      if (model === undefined) continue;
      expect(model.summary.zh).not.toHaveLength(0);
      expect(model.summary.en).not.toHaveLength(0);
      expect(model.input.label.zh).not.toHaveLength(0);
      expect(model.input.label.en).not.toHaveLength(0);
      for (const item of [...model.nodes, ...model.edges]) {
        expect(item.label.zh).not.toHaveLength(0);
        expect(item.label.en).not.toHaveLength(0);
      }
      for (const frame of model.buildExecution(model.input.defaultValue).frames) {
        expect(frame.summary.zh).not.toHaveLength(0);
        expect(frame.summary.en).not.toHaveLength(0);
      }
    }
  });

  it("adapts every reviewed example to a valid immutable FlowFrame timeline", () => {
    for (const model of Object.values(FOA_FLOW_LESSON_MODELS)) {
      if (model === undefined) continue;
      const graph = createFoaFlowLessonGraph(model);
      const timeline = createFlowTimeline(graph, model.input.defaultValue);

      expect(Object.isFrozen(graph)).toBe(true);
      expect(Object.isFrozen(timeline)).toBe(true);
      expect(timeline.at(-1)?.output).toBe(
        String(model.buildExecution(model.input.defaultValue).output),
      );
      expect(
        timeline.every(
          (frame) =>
            frame.sourceEventIndex >= 0 &&
            frame.sourceEventIndex <= 3 &&
            graph.nodes.some((node) => node.id === frame.activeNodeId),
        ),
      ).toBe(true);
    }

    const loopTimeline = createFlowTimeline(createFoaFlowLessonGraph(requiredModel(22)), 3);
    expect(loopTimeline.filter((frame) => frame.activeNodeId === "loop.condition")).toHaveLength(7);
    expect(loopTimeline.filter((frame) => frame.activeNodeId === "loop.body")).toHaveLength(3);
  });
});

function requiredModel(order: 2 | 5 | 16 | 22) {
  const model = getFoaFlowLessonModel(order);
  if (model === null) throw new Error(`Missing FOA flow lesson model ${String(order)}`);
  return model;
}

function statesFor(
  frames: readonly FoaFlowFrame[],
  kind: FoaFlowFrame["kind"],
  key: string,
): unknown[] {
  return frames.filter((frame) => frame.kind === kind).map((frame) => frame.state[key]);
}

import { describe, expect, it } from "vitest";
import {
  createFlowTimeline,
  createFlowTimelineController,
  defineFlowLessonModel,
  type FlowFrame,
  type FlowLessonModel,
} from "../../src/tutorials/flow-lesson-model.js";

function text(zh: string, en: string) {
  return { zh, en };
}

function squareModel(): FlowLessonModel<number> {
  return {
    sceneKind: "linear",
    input: {
      id: "input.value",
      label: text("输入一个整数", "Enter an integer"),
      defaultValue: 7,
    },
    nodes: [
      {
        id: "node.read",
        label: text("读取输入", "Read input"),
        sourceEventIndex: 0,
        role: "input",
      },
      {
        id: "node.square",
        label: text("计算平方", "Compute square"),
        sourceEventIndex: 1,
        role: "process",
      },
      {
        id: "node.write",
        label: text("输出结果", "Write result"),
        sourceEventIndex: 2,
        role: "output",
      },
    ],
    edges: [
      { id: "edge.read-square", from: "node.read", to: "node.square", kind: "forward" },
      { id: "edge.square-write", from: "node.square", to: "node.write", kind: "forward" },
    ],
    createFrames: (value) => [
      {
        id: "frame.read",
        activeNodeId: "node.read",
        activeEdgeIds: [],
        completedNodeIds: [],
        skippedNodeIds: [],
        values: { stdin: String(value) },
        sourceEventIndex: 0,
        summary: text("读取输入", "Read the input"),
      },
      {
        id: "frame.square",
        activeNodeId: "node.square",
        activeEdgeIds: ["edge.read-square"],
        completedNodeIds: ["node.read"],
        skippedNodeIds: [],
        values: { value: String(value), expression: `${String(value)} × ${String(value)}` },
        sourceEventIndex: 1,
        summary: text("计算平方", "Compute the square"),
      },
      {
        id: "frame.write",
        activeNodeId: "node.write",
        activeEdgeIds: ["edge.square-write"],
        completedNodeIds: ["node.read", "node.square"],
        skippedNodeIds: [],
        values: { result: String(value * value) },
        sourceEventIndex: 2,
        summary: text("输出结果", "Write the result"),
        output: String(value * value),
      },
    ],
  };
}

function replaceFrames(
  model: FlowLessonModel<number>,
  createFrames: FlowLessonModel<number>["createFrames"],
): FlowLessonModel<number> {
  return { ...model, createFrames };
}

describe("flow lesson model", () => {
  it("normalizes a localized graph and freezes the model snapshot", () => {
    const model = defineFlowLessonModel(squareModel());

    expect(model.sceneKind).toBe("linear");
    expect(model.nodes.map((node) => node.role)).toEqual(["input", "process", "output"]);
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.input)).toBe(true);
    expect(Object.isFrozen(model.input.label)).toBe(true);
    expect(Object.isFrozen(model.nodes)).toBe(true);
    expect(Object.isFrozen(model.nodes[0])).toBe(true);
    expect(Object.isFrozen(model.edges)).toBe(true);
  });

  it("creates deeply frozen frames with valid graph references and a final output", () => {
    const frames = createFlowTimeline(squareModel(), 7);

    expect(frames).toHaveLength(3);
    expect(frames.map((frame) => frame.activeNodeId)).toEqual([
      "node.read",
      "node.square",
      "node.write",
    ]);
    expect(frames.at(-1)).toMatchObject({ output: "49", values: { result: "49" } });
    expect(Object.isFrozen(frames)).toBe(true);
    expect(Object.isFrozen(frames[1])).toBe(true);
    expect(Object.isFrozen(frames[1]?.activeEdgeIds)).toBe(true);
    expect(Object.isFrozen(frames[1]?.completedNodeIds)).toBe(true);
    expect(Object.isFrozen(frames[1]?.values)).toBe(true);
    expect(Object.isFrozen(frames[1]?.summary)).toBe(true);
  });

  it("supports labeled branch edges and skipped nodes without merging branch identity", () => {
    const model: FlowLessonModel<number> = {
      sceneKind: "branch",
      input: { id: "input.value", label: text("输入整数", "Enter an integer"), defaultValue: 1 },
      nodes: [
        { id: "node.input", label: text("输入", "Input"), sourceEventIndex: 0, role: "input" },
        {
          id: "node.decision",
          label: text("是否为正数", "Is it positive"),
          sourceEventIndex: 1,
          role: "decision",
        },
        {
          id: "node.positive",
          label: text("输出正数", "Write positive"),
          sourceEventIndex: 2,
          role: "output",
        },
        {
          id: "node.other",
          label: text("输出非正数", "Write non-positive"),
          sourceEventIndex: 3,
          role: "output",
        },
      ],
      edges: [
        { id: "edge.input-decision", from: "node.input", to: "node.decision", kind: "forward" },
        {
          id: "edge.true",
          from: "node.decision",
          to: "node.positive",
          kind: "true",
          label: text("成立", "True"),
        },
        {
          id: "edge.false",
          from: "node.decision",
          to: "node.other",
          kind: "false",
          label: text("不成立", "False"),
        },
      ],
      createFrames: (value) => [
        {
          id: "frame.input",
          activeNodeId: "node.input",
          activeEdgeIds: [],
          completedNodeIds: [],
          skippedNodeIds: [],
          values: { value: String(value) },
          sourceEventIndex: 0,
          summary: text("读取输入", "Read input"),
        },
        {
          id: "frame.decision",
          activeNodeId: "node.decision",
          activeEdgeIds: ["edge.input-decision"],
          completedNodeIds: ["node.input"],
          skippedNodeIds: [],
          values: { predicate: `${String(value)} > 0` },
          sourceEventIndex: 1,
          summary: text("检查条件", "Check the condition"),
        },
        {
          id: "frame.output",
          activeNodeId: value > 0 ? "node.positive" : "node.other",
          activeEdgeIds: [value > 0 ? "edge.true" : "edge.false"],
          completedNodeIds: ["node.input", "node.decision"],
          skippedNodeIds: [value > 0 ? "node.other" : "node.positive"],
          values: { branch: value > 0 ? "true" : "false" },
          sourceEventIndex: value > 0 ? 2 : 3,
          summary: text("输出分类", "Write the classification"),
          output: value > 0 ? "positive" : "non-positive",
        },
      ],
    };

    const frames = createFlowTimeline(model, -2);
    expect(frames.at(-1)).toMatchObject({
      activeNodeId: "node.other",
      activeEdgeIds: ["edge.false"],
      skippedNodeIds: ["node.positive"],
      output: "non-positive",
    });
    expect(defineFlowLessonModel(model).edges[1]?.label?.en).toBe("True");
  });

  it("rejects duplicate graph and frame IDs", () => {
    const duplicateNodeBase = squareModel();
    const duplicateNodeModel: FlowLessonModel<number> = {
      ...duplicateNodeBase,
      nodes: [duplicateNodeBase.nodes[0]!, duplicateNodeBase.nodes[0]!],
    };
    expect(() => defineFlowLessonModel(duplicateNodeModel)).toThrow(/节点 ID 重复/u);

    const duplicateEdgeBase = squareModel();
    const duplicateEdgeModel: FlowLessonModel<number> = {
      ...duplicateEdgeBase,
      edges: [duplicateEdgeBase.edges[0]!, duplicateEdgeBase.edges[0]!],
    };
    expect(() => defineFlowLessonModel(duplicateEdgeModel)).toThrow(/边 ID 重复/u);

    const base = squareModel();
    expect(() =>
      createFlowTimeline(
        replaceFrames(base, (value) => {
          const frames = base.createFrames(value);
          return [frames[0]!, { ...frames[1]!, id: frames[0]!.id }, frames[2]!];
        }),
        7,
      ),
    ).toThrow(/帧 ID 重复/u);
  });

  it("rejects unknown graph and frame references", () => {
    const unknownEndpointBase = squareModel();
    const unknownEndpoint: FlowLessonModel<number> = {
      ...unknownEndpointBase,
      edges: [{ id: "edge.invalid", from: "node.read", to: "node.missing", kind: "forward" }],
    };
    expect(() => defineFlowLessonModel(unknownEndpoint)).toThrow(/未知终点/u);

    const base = squareModel();
    expect(() =>
      createFlowTimeline(
        replaceFrames(base, (value) => {
          const frames = base.createFrames(value);
          return [{ ...frames[0]!, activeNodeId: "node.missing" }, ...frames.slice(1)];
        }),
        7,
      ),
    ).toThrow(/未知活动节点/u);

    expect(() =>
      createFlowTimeline(
        replaceFrames(base, (value) => {
          const frames = base.createFrames(value);
          return [frames[0]!, { ...frames[1]!, activeEdgeIds: ["edge.missing"] }, frames[2]!];
        }),
        7,
      ),
    ).toThrow(/未知 ID edge.missing/u);

    expect(() =>
      createFlowTimeline(
        replaceFrames(base, (value) => {
          const frames = base.createFrames(value);
          return [frames[0]!, { ...frames[1]!, completedNodeIds: ["node.missing"] }, frames[2]!];
        }),
        7,
      ),
    ).toThrow(/未知 ID node.missing/u);
  });

  it("requires at least two frames and a final output", () => {
    const base = squareModel();
    expect(() =>
      createFlowTimeline(
        replaceFrames(base, (value) => [base.createFrames(value)[0]!]),
        7,
      ),
    ).toThrow(/至少需要两帧/u);

    expect(() =>
      createFlowTimeline(
        replaceFrames(base, (value) => {
          const frames = base.createFrames(value);
          const last = frames.at(-1)!;
          return [...frames.slice(0, -1), { ...last, output: undefined }];
        }),
        7,
      ),
    ).toThrow(/最后一帧必须包含 output/u);
  });

  it("rejects conflicting node states and invalid loop iterations", () => {
    const base = squareModel();
    expect(() =>
      createFlowTimeline(
        replaceFrames(base, (value) => {
          const frames = base.createFrames(value);
          return [
            frames[0]!,
            {
              ...frames[1]!,
              completedNodeIds: ["node.read"],
              skippedNodeIds: ["node.read"],
            },
            frames[2]!,
          ];
        }),
        7,
      ),
    ).toThrow(/同时完成并跳过/u);

    expect(() =>
      createFlowTimeline(
        replaceFrames(base, (value) => {
          const frames = base.createFrames(value);
          return [frames[0]!, { ...frames[1]!, iteration: -1 }, frames[2]!];
        }),
        7,
      ),
    ).toThrow(/iteration 必须是非负整数/u);
  });
});

describe("flow timeline controller", () => {
  it("steps, seeks and resets without owning a timer", () => {
    const controller = createFlowTimelineController(createFlowTimeline(squareModel(), 7));

    expect(controller.getState()).toMatchObject({
      index: 0,
      rate: 1,
      playing: false,
      reducedMotion: false,
      frameCount: 3,
      canStepBack: false,
      canStepForward: true,
    });
    controller.play();
    expect(controller.getState().index).toBe(0);
    expect(controller.getState().playing).toBe(true);
    expect(controller.stepForward()).toMatchObject({ index: 1, playing: true });
    expect(controller.stepForward()).toMatchObject({ index: 2, playing: false });
    expect(controller.stepBack()).toMatchObject({ index: 1, canStepForward: true });
    expect(controller.seek(0).frame.id).toBe("frame.read");

    controller.setRate(1.5);
    controller.setReducedMotion(true);
    expect(controller.reset()).toMatchObject({
      index: 0,
      rate: 1.5,
      playing: false,
      reducedMotion: true,
    });
    expect(Object.isFrozen(controller)).toBe(true);
    expect(Object.isFrozen(controller.getState())).toBe(true);
  });

  it("validates controller positions, rate and timeline shape", () => {
    const frames = createFlowTimeline(squareModel(), 7);
    const controller = createFlowTimelineController(frames, { rate: 2, reducedMotion: true });

    expect(controller.getState()).toMatchObject({ rate: 2, reducedMotion: true });
    expect(() => controller.seek(-1)).toThrow(RangeError);
    expect(() => controller.seek(3)).toThrow(RangeError);
    expect(() => controller.seek(0.5)).toThrow(RangeError);
    expect(() => controller.setRate(0.49)).toThrow(RangeError);
    expect(() => controller.setRate(Number.NaN)).toThrow(RangeError);
    expect(() => createFlowTimelineController([frames[0]!] as readonly FlowFrame[])).toThrow(
      /至少需要两帧/u,
    );
  });
});

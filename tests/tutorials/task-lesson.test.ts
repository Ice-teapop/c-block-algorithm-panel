import { describe, expect, it } from "vitest";
import {
  createTaskLessonController,
  createTeachingTimeline,
  defineTaskLesson,
  type LearnerAction,
  type TaskLessonDefinition,
  type TeachingEvent,
} from "../../src/tutorials/task-lesson.js";

interface DemoState {
  readonly total: number;
  readonly history: readonly string[];
}

interface DemoEvent extends TeachingEvent {
  readonly type: "add";
  readonly amount: number;
}

interface DemoAction extends LearnerAction {
  readonly type: "advance" | "wrong" | "quiet-wrong" | "invalid-advance";
}

function demoDefinition(): TaskLessonDefinition<DemoState, DemoEvent, DemoAction> {
  const validateAction = ({ action }: { readonly action: DemoAction }) => {
    if (action.type === "advance") return { status: "accepted" as const, advanceBy: 1 };
    if (action.type === "invalid-advance") {
      return { status: "accepted" as const, advanceBy: 99 };
    }
    return {
      status: "rejected" as const,
      reason: "not-the-next-semantic-action",
      escalateHint: action.type !== "quiet-wrong",
    };
  };
  return {
    id: "lesson.demo.timeline",
    version: "1.0.0",
    title: "Deterministic timeline",
    knowledgeComponents: [
      {
        id: "component.accumulate",
        title: "Accumulate",
        description: "Follow a deterministic sequence.",
      },
    ],
    stages: [
      {
        id: "stage.observe",
        title: "Observe",
        instruction: "Apply two events.",
        knowledgeComponentIds: ["component.accumulate"],
        events: [
          { id: "event.one", type: "add", amount: 1 },
          { id: "event.two", type: "add", amount: 2 },
        ],
        hints: ["Look at the next value.", "Advance one semantic event."],
        validateAction,
      },
      {
        id: "stage.transfer",
        title: "Transfer",
        instruction: "Apply the final event.",
        knowledgeComponentIds: ["component.accumulate"],
        events: [{ id: "event.three", type: "add", amount: 4 }],
        hints: ["Use the same operation."],
        validateAction,
      },
    ],
    initialState: { total: 0, history: [] },
    reduceEvent: (state, event) => ({
      total: state.total + event.amount,
      history: [...state.history, event.id],
    }),
  };
}

describe("task lesson timeline", () => {
  it("normalizes immutable definitions and stage ranges", () => {
    const definition = defineTaskLesson(demoDefinition());
    const timeline = createTeachingTimeline(definition);

    expect(timeline.events.map((event) => event.id)).toEqual([
      "event.one",
      "event.two",
      "event.three",
    ]);
    expect(timeline.stages).toEqual([
      { stageId: "stage.observe", stageIndex: 0, start: 0, end: 2 },
      { stageId: "stage.transfer", stageIndex: 1, start: 2, end: 3 },
    ]);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.initialState)).toBe(true);
    expect(Object.isFrozen(definition.stages[0]?.events[0])).toBe(true);
    expect(Object.isFrozen(timeline.events)).toBe(true);
  });

  it("produces the same frozen state through sequential stepping and direct seek", () => {
    const sequential = createTaskLessonController(demoDefinition());
    sequential.stepForward();
    const stepped = sequential.stepForward();
    const sought = createTaskLessonController(demoDefinition()).seek(2);

    expect(stepped.state).toEqual(sought.state);
    expect(sought).toMatchObject({
      position: 2,
      stageId: "stage.transfer",
      stageEventIndex: 0,
      state: { total: 3, history: ["event.one", "event.two"] },
    });
    expect(Object.isFrozen(sought)).toBe(true);
    expect(Object.isFrozen(sought.state)).toBe(true);
    expect(Object.isFrozen(sought.state.history)).toBe(true);
  });

  it("steps backward and forward without state drift", () => {
    const controller = createTaskLessonController(demoDefinition());
    const complete = controller.seek(3);
    expect(complete).toMatchObject({
      status: "completed",
      position: 3,
      state: { total: 7 },
      canStepForward: false,
    });

    const back = controller.stepBack();
    expect(back).toMatchObject({ status: "active", position: 2, state: { total: 3 } });
    expect(controller.stepForward().state).toEqual(complete.state);
    expect(controller.stepForward().position).toBe(3);
  });

  it("tracks playback and rate without owning a timer", () => {
    const controller = createTaskLessonController(demoDefinition());
    expect(controller.play()).toMatchObject({ playbackState: "playing", playbackRate: 1 });
    expect(controller.setRate(1.5)).toMatchObject({
      playbackState: "playing",
      playbackRate: 1.5,
    });
    controller.stepForward();
    expect(controller.getSnapshot().playbackState).toBe("playing");
    expect(controller.seek(3).playbackState).toBe("paused");
    expect(controller.play().playbackState).toBe("paused");
    expect(() => controller.setRate(0.49)).toThrow(RangeError);
    expect(() => controller.setRate(Number.NaN)).toThrow(RangeError);
  });

  it("validates actions per stage and escalates hints only after semantic rejection", () => {
    const controller = createTaskLessonController(demoDefinition());
    const first = controller.dispatch({ type: "wrong" });
    expect(first).toMatchObject({
      status: "rejected",
      reason: "not-the-next-semantic-action",
      hintLevel: 1,
      hint: "Look at the next value.",
      snapshot: { position: 0 },
    });
    const quiet = controller.dispatch({ type: "quiet-wrong" });
    expect(quiet).toMatchObject({ status: "rejected", hintLevel: 1 });
    expect(controller.dispatch({ type: "wrong" })).toMatchObject({
      status: "rejected",
      hintLevel: 2,
      hint: "Advance one semantic event.",
    });
    expect(controller.dispatch({ type: "wrong" })).toMatchObject({ hintLevel: 2 });

    const accepted = controller.dispatch({ type: "advance" });
    expect(accepted).toMatchObject({
      status: "accepted",
      advancedBy: 1,
      snapshot: { position: 1, state: { total: 1 } },
    });
    expect(() => controller.dispatch({ type: "invalid-advance" })).toThrow(RangeError);
  });

  it("resets the active stage independently and resets the full lesson without changing rate", () => {
    const controller = createTaskLessonController(demoDefinition());
    controller.setRate(2);
    controller.seek(2);
    controller.dispatch({ type: "wrong" });

    const stageReset = controller.resetStage();
    expect(stageReset).toMatchObject({
      position: 2,
      stageId: "stage.transfer",
      activeHint: null,
      playbackRate: 2,
      state: { total: 3 },
    });
    expect(stageReset.hintLevels["stage.transfer"]).toBe(0);

    const lessonReset = controller.resetLesson();
    expect(lessonReset).toMatchObject({
      position: 0,
      stageId: "stage.observe",
      activeHint: null,
      playbackRate: 2,
      state: { total: 0, history: [] },
    });
    expect(Object.values(lessonReset.hintLevels)).toEqual([0, 0]);
  });

  it("rejects ambiguous definitions before a controller can run", () => {
    const baseUnknown = demoDefinition();
    const unknownComponent = {
      ...baseUnknown,
      stages: baseUnknown.stages.map((stage, index) =>
        index === 0 ? { ...stage, knowledgeComponentIds: ["component.missing"] } : stage,
      ),
    };
    expect(() => defineTaskLesson(unknownComponent)).toThrow(/未知知识组件/u);

    const baseDuplicate = demoDefinition();
    const duplicateEvent = {
      ...baseDuplicate,
      stages: baseDuplicate.stages.map((stage, index) =>
        index === 1 ? { ...stage, events: [{ ...stage.events[0]!, id: "event.one" }] } : stage,
      ),
    };
    expect(() => defineTaskLesson(duplicateEvent)).toThrow(/语义事件 ID 重复/u);
  });
});

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MIN_PLAYBACK_RATE = 0.5;
const MAX_PLAYBACK_RATE = 2;

export interface TeachingEvent {
  readonly id: string;
  readonly type: string;
}

export interface LearnerAction {
  readonly type: string;
}

export interface TaskKnowledgeComponent {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export interface TeachingEventReducerContext {
  readonly eventIndex: number;
  readonly stageId: string;
  readonly stageIndex: number;
  readonly stageEventIndex: number;
}

export type TaskLessonActionValidation =
  | {
      readonly status: "accepted";
      /** Number of semantic events to apply after accepting the action. */
      readonly advanceBy: number;
    }
  | {
      readonly status: "rejected";
      readonly reason: string;
      /** Defaults to true. The active stage decides whether a rejection consumes a hint. */
      readonly escalateHint?: boolean | undefined;
    };

export interface TaskLessonStageDefinition<
  TState,
  TEvent extends TeachingEvent,
  TAction extends LearnerAction,
> {
  readonly id: string;
  readonly title: string;
  readonly instruction: string;
  readonly knowledgeComponentIds: readonly string[];
  readonly events: readonly TEvent[];
  readonly hints: readonly string[];
  readonly validateAction?:
    | ((context: TaskLessonActionContext<TState, TEvent, TAction>) => TaskLessonActionValidation)
    | undefined;
}

export interface TaskLessonDefinition<
  TState,
  TEvent extends TeachingEvent,
  TAction extends LearnerAction,
> {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly knowledgeComponents: readonly TaskKnowledgeComponent[];
  readonly stages: readonly TaskLessonStageDefinition<TState, TEvent, TAction>[];
  readonly initialState: TState;
  readonly reduceEvent: (
    state: Readonly<TState>,
    event: TEvent,
    context: TeachingEventReducerContext,
  ) => TState;
}

export interface TeachingTimelineStage {
  readonly stageId: string;
  readonly stageIndex: number;
  /** Inclusive global event position. */
  readonly start: number;
  /** Exclusive global event position. */
  readonly end: number;
}

export interface TeachingTimeline<TEvent extends TeachingEvent> {
  readonly events: readonly TEvent[];
  readonly stages: readonly TeachingTimelineStage[];
  readonly length: number;
}

export type TaskLessonStatus = "active" | "completed";
export type TaskLessonPlaybackState = "paused" | "playing";

/**
 * State after applying `position` events. `lastEvent` is the event that produced the state and
 * `nextEvent` is the event a subsequent step will apply.
 */
export interface TaskLessonSnapshot<TState, TEvent extends TeachingEvent> {
  readonly lessonId: string;
  readonly lessonVersion: string;
  readonly status: TaskLessonStatus;
  readonly playbackState: TaskLessonPlaybackState;
  readonly playbackRate: number;
  readonly position: number;
  readonly eventCount: number;
  readonly stageId: string;
  readonly stageIndex: number;
  readonly stageEventIndex: number;
  readonly state: Readonly<TState>;
  readonly lastEvent: TEvent | null;
  readonly nextEvent: TEvent | null;
  readonly completedStageIds: readonly string[];
  readonly hintLevels: Readonly<Record<string, number>>;
  readonly activeHint: string | null;
  readonly canStepBack: boolean;
  readonly canStepForward: boolean;
}

export interface TaskLessonActionContext<
  TState,
  TEvent extends TeachingEvent,
  TAction extends LearnerAction,
> {
  readonly action: TAction;
  readonly definition: TaskLessonDefinition<TState, TEvent, TAction>;
  readonly stage: TaskLessonStageDefinition<TState, TEvent, TAction>;
  readonly snapshot: TaskLessonSnapshot<TState, TEvent>;
}

export type TaskLessonDispatchResult<TState, TEvent extends TeachingEvent> =
  | {
      readonly status: "accepted";
      readonly advancedBy: number;
      readonly snapshot: TaskLessonSnapshot<TState, TEvent>;
    }
  | {
      readonly status: "rejected";
      readonly reason: string;
      readonly hintLevel: number;
      readonly hint: string | null;
      readonly snapshot: TaskLessonSnapshot<TState, TEvent>;
    };

export interface TaskLessonController<
  TState,
  TEvent extends TeachingEvent,
  TAction extends LearnerAction,
> {
  readonly definition: TaskLessonDefinition<TState, TEvent, TAction>;
  readonly timeline: TeachingTimeline<TEvent>;
  getSnapshot(): TaskLessonSnapshot<TState, TEvent>;
  dispatch(action: TAction): TaskLessonDispatchResult<TState, TEvent>;
  play(): TaskLessonSnapshot<TState, TEvent>;
  pause(): TaskLessonSnapshot<TState, TEvent>;
  stepBack(): TaskLessonSnapshot<TState, TEvent>;
  stepForward(): TaskLessonSnapshot<TState, TEvent>;
  seek(position: number): TaskLessonSnapshot<TState, TEvent>;
  setRate(rate: number): TaskLessonSnapshot<TState, TEvent>;
  resetStage(): TaskLessonSnapshot<TState, TEvent>;
  resetLesson(): TaskLessonSnapshot<TState, TEvent>;
}

/**
 * Copies and freezes lesson data so callers cannot mutate the reducer input, event sequence or
 * instructional metadata after constructing a controller.
 */
export function defineTaskLesson<
  TState,
  TEvent extends TeachingEvent,
  TAction extends LearnerAction,
>(
  input: TaskLessonDefinition<TState, TEvent, TAction>,
): TaskLessonDefinition<TState, TEvent, TAction> {
  assertStableId(input.id, "教程 ID");
  assertText(input.version, "教程版本");
  assertText(input.title, "教程标题");
  if (input.knowledgeComponents.length === 0) {
    throw new RangeError("任务教程至少需要一个知识组件");
  }
  if (input.stages.length === 0) throw new RangeError("任务教程至少需要一个阶段");
  if (typeof input.reduceEvent !== "function") throw new TypeError("任务教程缺少事件 reducer");

  const knowledgeIds = new Set<string>();
  const knowledgeComponents = Object.freeze(
    input.knowledgeComponents.map((component) => {
      assertStableId(component.id, "知识组件 ID");
      assertUnique(knowledgeIds, component.id, "知识组件 ID");
      assertText(component.title, "知识组件标题");
      assertText(component.description, "知识组件说明");
      return Object.freeze({
        id: component.id,
        title: component.title,
        description: component.description,
      });
    }),
  );

  const stageIds = new Set<string>();
  const eventIds = new Set<string>();
  const stages = Object.freeze(
    input.stages.map((stage) => {
      assertStableId(stage.id, "阶段 ID");
      assertUnique(stageIds, stage.id, "阶段 ID");
      assertText(stage.title, "阶段标题");
      assertText(stage.instruction, "阶段指令");
      if (stage.events.length === 0) {
        throw new RangeError(`阶段 ${stage.id} 至少需要一个语义事件`);
      }
      if (stage.knowledgeComponentIds.length === 0) {
        throw new RangeError(`阶段 ${stage.id} 至少需要关联一个知识组件`);
      }
      const stageKnowledgeIds = new Set<string>();
      const knowledgeComponentIds = Object.freeze(
        stage.knowledgeComponentIds.map((componentId) => {
          assertStableId(componentId, "阶段知识组件 ID");
          assertUnique(stageKnowledgeIds, componentId, `阶段 ${stage.id} 的知识组件 ID`);
          if (!knowledgeIds.has(componentId)) {
            throw new RangeError(`阶段 ${stage.id} 引用了未知知识组件 ${componentId}`);
          }
          return componentId;
        }),
      );
      const events = Object.freeze(
        stage.events.map((event) => {
          assertStableId(event.id, "语义事件 ID");
          assertUnique(eventIds, event.id, "语义事件 ID");
          assertStableId(event.type, "语义事件类型");
          return cloneAndFreeze(event, `语义事件 ${event.id}`);
        }),
      );
      const hints = Object.freeze(
        stage.hints.map((hint) => {
          assertText(hint, `阶段 ${stage.id} 的提示`);
          return hint;
        }),
      );
      if (stage.validateAction !== undefined && typeof stage.validateAction !== "function") {
        throw new TypeError(`阶段 ${stage.id} 的动作验证器无效`);
      }
      return Object.freeze({
        id: stage.id,
        title: stage.title,
        instruction: stage.instruction,
        knowledgeComponentIds,
        events,
        hints,
        ...(stage.validateAction === undefined ? {} : { validateAction: stage.validateAction }),
      }) as TaskLessonStageDefinition<TState, TEvent, TAction>;
    }),
  );

  return Object.freeze({
    id: input.id,
    version: input.version,
    title: input.title,
    knowledgeComponents,
    stages,
    initialState: cloneAndFreeze(input.initialState, "教程初始状态"),
    reduceEvent: input.reduceEvent,
  });
}

export function createTeachingTimeline<
  TState,
  TEvent extends TeachingEvent,
  TAction extends LearnerAction,
>(definition: TaskLessonDefinition<TState, TEvent, TAction>): TeachingTimeline<TEvent> {
  return buildTimeline(defineTaskLesson(definition));
}

export function createTaskLessonController<
  TState,
  TEvent extends TeachingEvent,
  TAction extends LearnerAction,
>(
  input: TaskLessonDefinition<TState, TEvent, TAction>,
): TaskLessonController<TState, TEvent, TAction> {
  const definition = defineTaskLesson(input);
  const timeline = buildTimeline(definition);
  let position = 0;
  let state = cloneAndFreeze(definition.initialState, "教程初始状态");
  let playbackState: TaskLessonPlaybackState = "paused";
  let playbackRate = 1;
  const hintLevels = new Map<string, number>(
    definition.stages.map((stage) => [stage.id, 0] as const),
  );

  const replayTo = (nextPosition: number): void => {
    state = cloneAndFreeze(definition.initialState, "教程初始状态");
    for (let eventIndex = 0; eventIndex < nextPosition; eventIndex += 1) {
      const event = timeline.events[eventIndex]!;
      const range = rangeForEventIndex(timeline, eventIndex);
      state = cloneAndFreeze(
        definition.reduceEvent(state, event, {
          eventIndex,
          stageId: range.stageId,
          stageIndex: range.stageIndex,
          stageEventIndex: eventIndex - range.start,
        }),
        `事件 ${event.id} 的 reducer 结果`,
      );
    }
    position = nextPosition;
    if (position === timeline.length) playbackState = "paused";
  };

  const snapshot = (): TaskLessonSnapshot<TState, TEvent> => {
    const range = rangeForPosition(timeline, position);
    const stage = definition.stages[range.stageIndex]!;
    const currentHintLevel = hintLevels.get(stage.id) ?? 0;
    const completedStageIds = Object.freeze(
      timeline.stages.filter((item) => item.end <= position).map((item) => item.stageId),
    );
    const frozenHintLevels = Object.freeze(Object.fromEntries(hintLevels));
    return Object.freeze({
      lessonId: definition.id,
      lessonVersion: definition.version,
      status: position === timeline.length ? "completed" : "active",
      playbackState,
      playbackRate,
      position,
      eventCount: timeline.length,
      stageId: stage.id,
      stageIndex: range.stageIndex,
      stageEventIndex: Math.min(position - range.start, range.end - range.start),
      state,
      lastEvent: position === 0 ? null : timeline.events[position - 1]!,
      nextEvent: position === timeline.length ? null : timeline.events[position]!,
      completedStageIds,
      hintLevels: frozenHintLevels,
      activeHint: currentHintLevel === 0 ? null : (stage.hints[currentHintLevel - 1] ?? null),
      canStepBack: position > 0,
      canStepForward: position < timeline.length,
    });
  };

  const seek = (nextPosition: number): TaskLessonSnapshot<TState, TEvent> => {
    assertTimelinePosition(nextPosition, timeline.length);
    replayTo(nextPosition);
    return snapshot();
  };

  const controller: TaskLessonController<TState, TEvent, TAction> = {
    definition,
    timeline,
    getSnapshot: snapshot,
    dispatch(action): TaskLessonDispatchResult<TState, TEvent> {
      assertAction(action);
      const before = snapshot();
      if (before.status === "completed") {
        return rejectedDispatch("lesson-completed", before, 0, null);
      }
      const stage = definition.stages[before.stageIndex]!;
      if (stage.validateAction === undefined) {
        return rejectedDispatch(
          "stage-does-not-accept-actions",
          before,
          hintLevels.get(stage.id) ?? 0,
          before.activeHint,
        );
      }
      const immutableAction = cloneAndFreeze(action, "学习者动作");
      const validation = stage.validateAction({
        action: immutableAction,
        definition,
        stage,
        snapshot: before,
      });
      assertActionValidation(validation, stage.id);
      if (validation.status === "rejected") {
        let hintLevel = hintLevels.get(stage.id) ?? 0;
        if (validation.escalateHint !== false && stage.hints.length > 0) {
          hintLevel = Math.min(hintLevel + 1, stage.hints.length);
          hintLevels.set(stage.id, hintLevel);
        }
        const after = snapshot();
        return rejectedDispatch(
          validation.reason,
          after,
          hintLevel,
          hintLevel === 0 ? null : (stage.hints[hintLevel - 1] ?? null),
        );
      }
      const remainingInStage = timeline.stages[before.stageIndex]!.end - position;
      if (
        !Number.isSafeInteger(validation.advanceBy) ||
        validation.advanceBy < 0 ||
        validation.advanceBy > remainingInStage
      ) {
        throw new RangeError(
          `阶段 ${stage.id} 的动作验证器返回了越界 advanceBy：${String(validation.advanceBy)}`,
        );
      }
      replayTo(position + validation.advanceBy);
      return Object.freeze({
        status: "accepted",
        advancedBy: validation.advanceBy,
        snapshot: snapshot(),
      });
    },
    play(): TaskLessonSnapshot<TState, TEvent> {
      if (position < timeline.length) playbackState = "playing";
      return snapshot();
    },
    pause(): TaskLessonSnapshot<TState, TEvent> {
      playbackState = "paused";
      return snapshot();
    },
    stepBack(): TaskLessonSnapshot<TState, TEvent> {
      if (position > 0) replayTo(position - 1);
      return snapshot();
    },
    stepForward(): TaskLessonSnapshot<TState, TEvent> {
      if (position < timeline.length) replayTo(position + 1);
      return snapshot();
    },
    seek,
    setRate(rate: number): TaskLessonSnapshot<TState, TEvent> {
      assertPlaybackRate(rate);
      playbackRate = rate;
      return snapshot();
    },
    resetStage(): TaskLessonSnapshot<TState, TEvent> {
      const range = rangeForPosition(timeline, position);
      hintLevels.set(range.stageId, 0);
      playbackState = "paused";
      replayTo(range.start);
      return snapshot();
    },
    resetLesson(): TaskLessonSnapshot<TState, TEvent> {
      for (const stage of definition.stages) hintLevels.set(stage.id, 0);
      playbackState = "paused";
      replayTo(0);
      return snapshot();
    },
  };
  return Object.freeze(controller);
}

function buildTimeline<TState, TEvent extends TeachingEvent, TAction extends LearnerAction>(
  definition: TaskLessonDefinition<TState, TEvent, TAction>,
): TeachingTimeline<TEvent> {
  const events: TEvent[] = [];
  const stages: TeachingTimelineStage[] = [];
  for (const [stageIndex, stage] of definition.stages.entries()) {
    const start = events.length;
    events.push(...stage.events);
    stages.push(Object.freeze({ stageId: stage.id, stageIndex, start, end: events.length }));
  }
  return Object.freeze({
    events: Object.freeze(events),
    stages: Object.freeze(stages),
    length: events.length,
  });
}

function rangeForEventIndex<TEvent extends TeachingEvent>(
  timeline: TeachingTimeline<TEvent>,
  eventIndex: number,
): TeachingTimelineStage {
  const range = timeline.stages.find((item) => eventIndex >= item.start && eventIndex < item.end);
  if (range === undefined) throw new RangeError(`语义事件位置越界：${String(eventIndex)}`);
  return range;
}

function rangeForPosition<TEvent extends TeachingEvent>(
  timeline: TeachingTimeline<TEvent>,
  position: number,
): TeachingTimelineStage {
  if (position === timeline.length) return timeline.stages.at(-1)!;
  const range = timeline.stages.find((item) => position >= item.start && position < item.end);
  if (range === undefined) throw new RangeError(`教学时间线位置越界：${String(position)}`);
  return range;
}

function rejectedDispatch<TState, TEvent extends TeachingEvent>(
  reason: string,
  snapshot: TaskLessonSnapshot<TState, TEvent>,
  hintLevel: number,
  hint: string | null,
): TaskLessonDispatchResult<TState, TEvent> {
  return Object.freeze({ status: "rejected", reason, hintLevel, hint, snapshot });
}

function assertAction(action: LearnerAction): void {
  if (action === null || typeof action !== "object") throw new TypeError("学习者动作必须是对象");
  assertStableId(action.type, "学习者动作类型");
}

function assertActionValidation(
  validation: TaskLessonActionValidation,
  stageId: string,
): asserts validation is TaskLessonActionValidation {
  if (validation === null || typeof validation !== "object") {
    throw new TypeError(`阶段 ${stageId} 的动作验证器未返回判别联合`);
  }
  if (validation.status === "accepted") return;
  if (validation.status === "rejected") {
    assertText(validation.reason, `阶段 ${stageId} 的拒绝原因`);
    return;
  }
  throw new TypeError(`阶段 ${stageId} 的动作验证器返回了未知状态`);
}

function assertTimelinePosition(position: number, length: number): void {
  if (!Number.isSafeInteger(position) || position < 0 || position > length) {
    throw new RangeError(`教学时间线位置必须是 0 到 ${String(length)} 之间的整数`);
  }
}

function assertPlaybackRate(rate: number): void {
  if (!Number.isFinite(rate) || rate < MIN_PLAYBACK_RATE || rate > MAX_PLAYBACK_RATE) {
    throw new RangeError(
      `教学播放速率必须在 ${String(MIN_PLAYBACK_RATE)} 到 ${String(MAX_PLAYBACK_RATE)} 之间`,
    );
  }
}

function assertStableId(value: string, label: string): void {
  if (typeof value !== "string" || !STABLE_ID.test(value)) {
    throw new TypeError(`${label} 必须是稳定标识符`);
  }
}

function assertText(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} 不能为空`);
  }
}

function assertUnique(values: Set<string>, value: string, label: string): void {
  if (values.has(value)) throw new RangeError(`${label} 重复：${value}`);
  values.add(value);
}

/**
 * The engine intentionally accepts plain deterministic data only. DOM nodes, functions, Maps and
 * class instances would make replay and cross-platform snapshot equality ambiguous.
 */
function cloneAndFreeze<T>(value: T, label: string, ancestors = new Set<object>()): T {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function" || typeof value === "symbol") {
      throw new TypeError(`${label} 只能包含确定性的普通数据`);
    }
    return value;
  }
  if (ancestors.has(value)) throw new TypeError(`${label} 不能包含循环引用`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => cloneAndFreeze(item, label, ancestors));
    ancestors.delete(value);
    return Object.freeze(result) as T;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    ancestors.delete(value);
    throw new TypeError(`${label} 只能包含普通对象与数组`);
  }
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      ancestors.delete(value);
      throw new TypeError(`${label} 不能包含 Symbol 键`);
    }
    result[key] = cloneAndFreeze((value as Record<string, unknown>)[key], label, ancestors);
  }
  ancestors.delete(value);
  return Object.freeze(result) as T;
}

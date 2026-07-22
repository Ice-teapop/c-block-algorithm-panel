const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MIN_PLAYBACK_RATE = 0.5;
const MAX_PLAYBACK_RATE = 2;

export type FlowSceneKind = "linear" | "branch" | "loop";
export type FlowNodeRole = "input" | "process" | "decision" | "output";
export type FlowEdgeKind = "forward" | "true" | "false" | "back";

export interface FlowLocalizedText {
  readonly zh: string;
  readonly en: string;
}

export interface FlowLessonInputSchema<TInput = unknown> {
  readonly id: string;
  readonly label: FlowLocalizedText;
  readonly defaultValue: TInput;
}

export interface FlowNode {
  readonly id: string;
  readonly label: FlowLocalizedText;
  readonly sourceEventIndex: number;
  readonly role: FlowNodeRole;
}

export interface FlowEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: FlowEdgeKind;
  readonly label?: FlowLocalizedText | undefined;
}

export interface FlowFrame {
  readonly id: string;
  readonly activeNodeId: string;
  readonly activeEdgeIds: readonly string[];
  readonly completedNodeIds: readonly string[];
  readonly skippedNodeIds: readonly string[];
  readonly values: Readonly<Record<string, string>>;
  readonly sourceEventIndex: number;
  readonly summary: FlowLocalizedText;
  readonly iteration?: number | undefined;
  readonly output?: string | undefined;
}

export interface FlowLessonModel<TInput = unknown> {
  readonly sceneKind: FlowSceneKind;
  readonly input: FlowLessonInputSchema<TInput>;
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly FlowEdge[];
  readonly createFrames: (input: Readonly<TInput>) => readonly FlowFrame[];
}

export interface FlowTimelineControllerOptions {
  readonly rate?: number | undefined;
  readonly reducedMotion?: boolean | undefined;
}

export interface FlowTimelineControllerState {
  readonly index: number;
  readonly rate: number;
  readonly playing: boolean;
  readonly reducedMotion: boolean;
  readonly frame: FlowFrame;
  readonly frameCount: number;
  readonly canStepBack: boolean;
  readonly canStepForward: boolean;
}

export interface FlowTimelineController {
  readonly timeline: readonly FlowFrame[];
  getState(): FlowTimelineControllerState;
  play(): FlowTimelineControllerState;
  pause(): FlowTimelineControllerState;
  stepBack(): FlowTimelineControllerState;
  stepForward(): FlowTimelineControllerState;
  seek(index: number): FlowTimelineControllerState;
  reset(): FlowTimelineControllerState;
  setRate(rate: number): FlowTimelineControllerState;
  setReducedMotion(reducedMotion: boolean): FlowTimelineControllerState;
}

/**
 * Validates and snapshots a graph definition. The frame factory remains a pure caller-owned
 * function; every value it returns is copied and frozen by {@link createFlowTimeline}.
 */
export function defineFlowLessonModel<TInput>(
  input: FlowLessonModel<TInput>,
): FlowLessonModel<TInput> {
  assertSceneKind(input.sceneKind);
  if (input.input === null || typeof input.input !== "object") {
    throw new TypeError("流程教程必须声明输入结构");
  }
  assertStableId(input.input.id, "输入 ID");
  const inputLabel = normalizeLocalizedText(input.input.label, "输入标签");
  if (typeof input.createFrames !== "function") {
    throw new TypeError("流程教程必须提供帧工厂");
  }
  if (input.nodes.length === 0) {
    throw new RangeError("流程教程至少需要一个节点");
  }

  const nodeIds = new Set<string>();
  const nodes = Object.freeze(
    input.nodes.map((node) => {
      assertStableId(node.id, "节点 ID");
      assertUnique(nodeIds, node.id, "节点 ID");
      assertNodeRole(node.role);
      assertSourceEventIndex(node.sourceEventIndex, `节点 ${node.id}`);
      return Object.freeze({
        id: node.id,
        label: normalizeLocalizedText(node.label, `节点 ${node.id} 的标签`),
        sourceEventIndex: node.sourceEventIndex,
        role: node.role,
      });
    }),
  );

  const edgeIds = new Set<string>();
  const edges = Object.freeze(
    input.edges.map((edge) => {
      assertStableId(edge.id, "边 ID");
      assertUnique(edgeIds, edge.id, "边 ID");
      assertStableId(edge.from, `边 ${edge.id} 的起点`);
      assertStableId(edge.to, `边 ${edge.id} 的终点`);
      if (!nodeIds.has(edge.from)) {
        throw new RangeError(`边 ${edge.id} 引用了未知起点 ${edge.from}`);
      }
      if (!nodeIds.has(edge.to)) {
        throw new RangeError(`边 ${edge.id} 引用了未知终点 ${edge.to}`);
      }
      assertEdgeKind(edge.kind);
      return Object.freeze({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
        ...(edge.label === undefined
          ? {}
          : { label: normalizeLocalizedText(edge.label, `边 ${edge.id} 的标签`) }),
      }) as FlowEdge;
    }),
  );

  const inputSchema = Object.freeze({
    id: input.input.id,
    label: inputLabel,
    defaultValue: cloneAndFreeze(input.input.defaultValue, "默认输入"),
  });

  return Object.freeze({
    sceneKind: input.sceneKind,
    input: inputSchema,
    nodes,
    edges,
    createFrames: input.createFrames,
  });
}

/**
 * Produces an immutable, reference-safe execution timeline for one concrete learner input.
 */
export function createFlowTimeline<TInput>(
  input: FlowLessonModel<TInput>,
  learnerInput: TInput,
): readonly FlowFrame[] {
  const model = defineFlowLessonModel(input);
  const rawFrames = model.createFrames(cloneAndFreeze(learnerInput, "流程教程输入"));
  if (!Array.isArray(rawFrames)) {
    throw new TypeError("流程教程帧工厂必须返回数组");
  }
  if (rawFrames.length < 2) {
    throw new RangeError("流程教程时间线至少需要两帧");
  }

  const nodeIds = new Set(model.nodes.map((node) => node.id));
  const edgeIds = new Set(model.edges.map((edge) => edge.id));
  const frameIds = new Set<string>();
  const frames = Object.freeze(
    rawFrames.map((frame) => normalizeFrame(frame, frameIds, nodeIds, edgeIds)),
  );
  if (frames.at(-1)?.output === undefined) {
    throw new RangeError("流程教程最后一帧必须包含 output");
  }
  return frames;
}

/**
 * Creates a deterministic playback state machine. It intentionally owns no interval, animation
 * frame or other timer; the renderer decides when to call {@link FlowTimelineController.stepForward}.
 */
export function createFlowTimelineController(
  input: readonly FlowFrame[],
  options: FlowTimelineControllerOptions = {},
): FlowTimelineController {
  const timeline = normalizeControllerTimeline(input);
  const initialRate = options.rate ?? 1;
  assertPlaybackRate(initialRate);
  if (options.reducedMotion !== undefined && typeof options.reducedMotion !== "boolean") {
    throw new TypeError("reducedMotion 必须是布尔值");
  }

  let index = 0;
  let rate = initialRate;
  let playing = false;
  let reducedMotion = options.reducedMotion ?? false;

  const getState = (): FlowTimelineControllerState =>
    Object.freeze({
      index,
      rate,
      playing,
      reducedMotion,
      frame: timeline[index]!,
      frameCount: timeline.length,
      canStepBack: index > 0,
      canStepForward: index < timeline.length - 1,
    });

  const controller: FlowTimelineController = {
    timeline,
    getState,
    play(): FlowTimelineControllerState {
      if (index < timeline.length - 1) playing = true;
      return getState();
    },
    pause(): FlowTimelineControllerState {
      playing = false;
      return getState();
    },
    stepBack(): FlowTimelineControllerState {
      if (index > 0) index -= 1;
      return getState();
    },
    stepForward(): FlowTimelineControllerState {
      if (index < timeline.length - 1) index += 1;
      if (index === timeline.length - 1) playing = false;
      return getState();
    },
    seek(nextIndex: number): FlowTimelineControllerState {
      assertTimelineIndex(nextIndex, timeline.length);
      index = nextIndex;
      if (index === timeline.length - 1) playing = false;
      return getState();
    },
    reset(): FlowTimelineControllerState {
      index = 0;
      playing = false;
      return getState();
    },
    setRate(nextRate: number): FlowTimelineControllerState {
      assertPlaybackRate(nextRate);
      rate = nextRate;
      return getState();
    },
    setReducedMotion(nextReducedMotion: boolean): FlowTimelineControllerState {
      if (typeof nextReducedMotion !== "boolean") {
        throw new TypeError("reducedMotion 必须是布尔值");
      }
      reducedMotion = nextReducedMotion;
      return getState();
    },
  };
  return Object.freeze(controller);
}

function normalizeControllerTimeline(input: readonly FlowFrame[]): readonly FlowFrame[] {
  if (!Array.isArray(input)) throw new TypeError("流程时间线必须是数组");
  if (input.length < 2) throw new RangeError("流程时间线至少需要两帧");
  const frameIds = new Set<string>();
  const timeline = Object.freeze(input.map((frame) => normalizeFrame(frame, frameIds, null, null)));
  if (timeline.at(-1)?.output === undefined) {
    throw new RangeError("流程时间线最后一帧必须包含 output");
  }
  return timeline;
}

function normalizeFrame(
  frame: FlowFrame,
  frameIds: Set<string>,
  nodeIds: ReadonlySet<string> | null,
  edgeIds: ReadonlySet<string> | null,
): FlowFrame {
  if (frame === null || typeof frame !== "object") {
    throw new TypeError("流程帧必须是对象");
  }
  assertStableId(frame.id, "帧 ID");
  assertUnique(frameIds, frame.id, "帧 ID");
  assertStableId(frame.activeNodeId, `帧 ${frame.id} 的活动节点 ID`);
  if (nodeIds !== null && !nodeIds.has(frame.activeNodeId)) {
    throw new RangeError(`帧 ${frame.id} 引用了未知活动节点 ${frame.activeNodeId}`);
  }
  assertSourceEventIndex(frame.sourceEventIndex, `帧 ${frame.id}`);
  if (frame.iteration !== undefined) {
    if (!Number.isSafeInteger(frame.iteration) || frame.iteration < 0) {
      throw new RangeError(`帧 ${frame.id} 的 iteration 必须是非负整数`);
    }
  }
  if (frame.output !== undefined && typeof frame.output !== "string") {
    throw new TypeError(`帧 ${frame.id} 的 output 必须是字符串`);
  }

  const activeEdgeIds = normalizeReferenceIds(
    frame.activeEdgeIds,
    edgeIds,
    `帧 ${frame.id} 的活动边`,
  );
  const completedNodeIds = normalizeReferenceIds(
    frame.completedNodeIds,
    nodeIds,
    `帧 ${frame.id} 的已完成节点`,
  );
  const skippedNodeIds = normalizeReferenceIds(
    frame.skippedNodeIds,
    nodeIds,
    `帧 ${frame.id} 的跳过节点`,
  );
  const completed = new Set(completedNodeIds);
  const overlap = skippedNodeIds.find((nodeId) => completed.has(nodeId));
  if (overlap !== undefined) {
    throw new RangeError(`帧 ${frame.id} 不能同时完成并跳过节点 ${overlap}`);
  }

  return Object.freeze({
    id: frame.id,
    activeNodeId: frame.activeNodeId,
    activeEdgeIds,
    completedNodeIds,
    skippedNodeIds,
    values: normalizeValues(frame.values, frame.id),
    sourceEventIndex: frame.sourceEventIndex,
    summary: normalizeLocalizedText(frame.summary, `帧 ${frame.id} 的摘要`),
    ...(frame.iteration === undefined ? {} : { iteration: frame.iteration }),
    ...(frame.output === undefined ? {} : { output: frame.output }),
  });
}

function normalizeReferenceIds(
  input: readonly string[],
  knownIds: ReadonlySet<string> | null,
  label: string,
): readonly string[] {
  if (!Array.isArray(input)) throw new TypeError(`${label}必须是数组`);
  const uniqueIds = new Set<string>();
  const result = input.map((id) => {
    assertStableId(id, `${label} ID`);
    assertUnique(uniqueIds, id, `${label} ID`);
    if (knownIds !== null && !knownIds.has(id)) {
      throw new RangeError(`${label}引用了未知 ID ${id}`);
    }
    return id;
  });
  return Object.freeze(result);
}

function normalizeValues(
  input: Readonly<Record<string, string>>,
  frameId: string,
): Readonly<Record<string, string>> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(`帧 ${frameId} 的 values 必须是普通对象`);
  }
  const prototype = Object.getPrototypeOf(input) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`帧 ${frameId} 的 values 必须是普通对象`);
  }
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key.trim().length === 0) throw new TypeError(`帧 ${frameId} 的 values 键不能为空`);
    if (typeof value !== "string") {
      throw new TypeError(`帧 ${frameId} 的 values.${key} 必须是字符串`);
    }
    values[key] = value;
  }
  return Object.freeze(values);
}

function normalizeLocalizedText(input: FlowLocalizedText, label: string): FlowLocalizedText {
  if (input === null || typeof input !== "object") throw new TypeError(`${label}必须是对象`);
  assertText(input.zh, `${label}中文`);
  assertText(input.en, `${label}英文`);
  return Object.freeze({ zh: input.zh, en: input.en });
}

function assertTimelineIndex(index: number, length: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= length) {
    throw new RangeError(`流程时间线位置必须是 0 到 ${String(length - 1)} 之间的整数`);
  }
}

function assertPlaybackRate(rate: number): void {
  if (!Number.isFinite(rate) || rate < MIN_PLAYBACK_RATE || rate > MAX_PLAYBACK_RATE) {
    throw new RangeError(
      `流程播放速率必须在 ${String(MIN_PLAYBACK_RATE)} 到 ${String(MAX_PLAYBACK_RATE)} 之间`,
    );
  }
}

function assertSceneKind(value: FlowSceneKind): void {
  if (value !== "linear" && value !== "branch" && value !== "loop") {
    throw new TypeError(`未知流程场景：${String(value)}`);
  }
}

function assertNodeRole(value: FlowNodeRole): void {
  if (value !== "input" && value !== "process" && value !== "decision" && value !== "output") {
    throw new TypeError(`未知流程节点角色：${String(value)}`);
  }
}

function assertEdgeKind(value: FlowEdgeKind): void {
  if (value !== "forward" && value !== "true" && value !== "false" && value !== "back") {
    throw new TypeError(`未知流程边类型：${String(value)}`);
  }
}

function assertSourceEventIndex(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} 的 sourceEventIndex 必须是非负整数`);
  }
}

function assertStableId(value: string, label: string): void {
  if (typeof value !== "string" || !STABLE_ID.test(value)) {
    throw new TypeError(`${label} 必须是稳定标识符`);
  }
}

function assertText(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label}不能为空`);
  }
}

function assertUnique(values: Set<string>, value: string, label: string): void {
  if (values.has(value)) throw new RangeError(`${label} 重复：${value}`);
  values.add(value);
}

/** Plain deterministic data keeps input snapshots replayable and cross-platform. */
function cloneAndFreeze<T>(value: T, label: string, ancestors = new Set<object>()): T {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function" || typeof value === "symbol") {
      throw new TypeError(`${label}只能包含确定性的普通数据`);
    }
    return value;
  }
  if (ancestors.has(value)) throw new TypeError(`${label}不能包含循环引用`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => cloneAndFreeze(item, label, ancestors));
    ancestors.delete(value);
    return Object.freeze(result) as T;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    ancestors.delete(value);
    throw new TypeError(`${label}只能包含普通对象与数组`);
  }
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      ancestors.delete(value);
      throw new TypeError(`${label}不能包含 Symbol 键`);
    }
    result[key] = cloneAndFreeze((value as Record<string, unknown>)[key], label, ancestors);
  }
  ancestors.delete(value);
  return Object.freeze(result) as T;
}

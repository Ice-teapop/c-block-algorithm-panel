import type { FixtureInput, PanelApi, RunnerError } from "../shared/api.js";
import { fingerprintSource } from "../shared/source-snapshot.js";
import {
  isTerminalTraceStatus,
  type TraceExecutionIdentity,
  type TraceObservationProfileId,
  type TraceEvent,
  type TraceRunEvidence,
  type TraceSessionStatus,
  type TraceUnsupportedReason,
} from "../shared/trace.js";

export type TraceControllerStatus =
  | "idle"
  | "preparing"
  | "running"
  | "branch"
  | "completed"
  | "cancelled"
  | "error"
  | "resource"
  | "truncated"
  | "unsupported";

export interface ResolvedTraceEvent {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly currentNodeId: string | null;
}

export interface RealTracePathUpdate extends ResolvedTraceEvent {
  readonly mode: "real";
  readonly event: TraceEvent;
}

export interface TraceResolveContext {
  readonly source: string;
  readonly sourceFingerprint: string;
}

export interface TraceControllerState {
  readonly status: TraceControllerStatus;
  readonly message: string;
  readonly sessionId: string | null;
  readonly sourceFingerprint: string | null;
  readonly inputFingerprint: string | null;
  readonly observationProfileId: TraceObservationProfileId | null;
  readonly observationAuthorizationDigest: string | null;
  readonly playbackPaused: boolean;
  readonly eventCount: number;
  readonly evidence: TraceRunEvidence | null;
  readonly unsupported: TraceUnsupportedReason | null;
  readonly error: RunnerError | null;
}

export interface TraceScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(token: unknown): void;
}

type TraceApi = Pick<PanelApi, "startTrace" | "readTrace" | "cancelTrace">;

export interface TraceControllerOptions {
  readonly api?: TraceApi | undefined;
  readonly getSource: () => string;
  readonly getDisplayName: () => string;
  readonly resolveTraceEvent: (
    event: TraceEvent,
    context: TraceResolveContext,
  ) => ResolvedTraceEvent | null;
  readonly onStateChange?: ((state: TraceControllerState) => void) | undefined;
  readonly onEventsChange?: ((events: readonly TraceEvent[]) => void) | undefined;
  readonly onPathUpdate?: ((update: RealTracePathUpdate) => void) | undefined;
  readonly onPathReset?: (() => void) | undefined;
  readonly scheduler?: TraceScheduler | undefined;
  readonly pollIntervalMs?: number | undefined;
}

export interface TraceControllerInput {
  readonly stdin?: string | undefined;
  readonly args?: readonly string[] | undefined;
  readonly fixtures?: readonly FixtureInput[] | undefined;
  /** Selects a main-process-owned, read-only observation plan. Renderer code cannot submit C expressions. */
  readonly observationProfileId?: TraceObservationProfileId | undefined;
}

export interface TraceController {
  start(input?: TraceControllerInput): Promise<void>;
  cancel(): Promise<void>;
  pausePlayback(): void;
  resumePlayback(): void;
  invalidateSource(): void;
  getState(): TraceControllerState;
  getEvents(): readonly TraceEvent[];
  destroy(): void;
}

const DEFAULT_POLL_INTERVAL_MS = 100;
const RENDER_EVENT_LIMIT = 500;

export function createTraceController(options: TraceControllerOptions): TraceController {
  assertOptions(options);
  const api = options.api ?? defaultApi();
  const scheduler = options.scheduler ?? browserScheduler();
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 50 || pollIntervalMs > 1_000) {
    throw new RangeError("Trace pollIntervalMs 必须在 50 到 1000 ms 之间");
  }

  let state = idleState();
  let events: TraceEvent[] = [];
  let pendingPlayback: RealTracePathUpdate[] = [];
  let sourceSnapshot: { readonly source: string; readonly fingerprint: string } | null = null;
  let traceIdentity: TraceExecutionIdentity | null = null;
  let sessionId: string | null = null;
  let afterSequence = 0;
  let timer: unknown;
  let generation = 0;
  let destroyed = false;
  let readInFlight = false;

  const publishState = (changes: Partial<TraceControllerState> = {}): void => {
    state = freezeState({ ...state, ...changes });
    options.onStateChange?.(state);
  };

  const publishEvents = (): void => {
    options.onEventsChange?.(Object.freeze(events.map(freezeEvent)));
  };

  const clearTimer = (): void => {
    if (timer === undefined) return;
    scheduler.clearTimeout(timer);
    timer = undefined;
  };

  const schedulePoll = (requestGeneration: number, delayMs = pollIntervalMs): void => {
    clearTimer();
    if (destroyed || sessionId === null || requestGeneration !== generation) return;
    timer = scheduler.setTimeout(() => {
      timer = undefined;
      void poll(requestGeneration);
    }, delayMs);
  };

  const sourceStillCurrent = (): boolean => {
    if (sourceSnapshot === null) return false;
    try {
      const current = options.getSource();
      return (
        current === sourceSnapshot.source &&
        fingerprintSource(current) === sourceSnapshot.fingerprint
      );
    } catch {
      return false;
    }
  };

  const dispatchPath = (event: TraceEvent): boolean => {
    const snapshot = sourceSnapshot;
    if (snapshot === null) return false;
    let resolved: ResolvedTraceEvent | null;
    try {
      resolved = options.resolveTraceEvent(
        event,
        Object.freeze({
          source: snapshot.source,
          sourceFingerprint: snapshot.fingerprint,
        }),
      );
    } catch {
      failTrace("无法把真实 Trace 事件映射到当前流程节点。", {
        code: "TRACE_PROTOCOL_ERROR",
        message: "renderer Trace event resolver failed",
      });
      return false;
    }
    if (resolved === null) return true;
    const update = freezePathUpdate(event, resolved);
    if (state.playbackPaused) pendingPlayback.push(update);
    else options.onPathUpdate?.(update);
    return true;
  };

  const appendEvents = (incoming: readonly TraceEvent[]): boolean => {
    if (incoming.length === 0) return true;
    events = [...events, ...incoming.map(freezeEvent)].slice(-RENDER_EVENT_LIMIT);
    publishEvents();
    for (const event of incoming) {
      if (!dispatchPath(event)) return false;
    }
    publishState({ eventCount: state.eventCount + incoming.length });
    return true;
  };

  const terminalState = (
    backendStatus: TraceSessionStatus,
    error: RunnerError | null,
  ): TraceControllerStatus => {
    if (backendStatus === "completed") return "completed";
    if (backendStatus === "cancelled") return "cancelled";
    if (backendStatus === "truncated") return "truncated";
    if (backendStatus === "unsupported") return "unsupported";
    return error?.code === "RESOURCE_LIMIT" ? "resource" : "error";
  };

  const applyTerminal = (
    backendStatus: TraceSessionStatus,
    evidence: TraceRunEvidence | null,
    unsupported: TraceUnsupportedReason | null,
    error: RunnerError | null,
  ): void => {
    clearTimer();
    const status = terminalState(backendStatus, error);
    sessionId = null;
    publishState({
      status,
      sessionId: null,
      evidence,
      unsupported,
      error,
      message: terminalMessage(status, evidence, unsupported, error),
    });
  };

  async function poll(requestGeneration: number): Promise<void> {
    if (destroyed || readInFlight || requestGeneration !== generation || sessionId === null) {
      return;
    }
    if (!sourceStillCurrent()) {
      invalidateForSourceChange();
      return;
    }
    const currentSessionId = sessionId;
    readInFlight = true;
    try {
      const batch = await api.readTrace(currentSessionId, afterSequence);
      if (destroyed || requestGeneration !== generation || currentSessionId !== sessionId) return;
      if (!sourceStillCurrent()) {
        invalidateForSourceChange();
        return;
      }
      if (!batch.ok) {
        failTrace(batch.error.message, batch.error);
        return;
      }
      if (batch.sessionId !== currentSessionId) {
        failTrace("Trace 返回了其他 session 的事件，已拒绝显示。", {
          code: "TRACE_PROTOCOL_ERROR",
          message: "Trace batch session mismatch",
        });
        return;
      }
      if (sourceSnapshot === null || batch.sourceFingerprint !== sourceSnapshot.fingerprint) {
        failTrace("Trace 返回了不属于当前源码的事件，已拒绝显示。", {
          code: "TRACE_SOURCE_MISMATCH",
          message: "Trace batch fingerprint mismatch",
        });
        return;
      }
      if (traceIdentity === null || !sameTraceIdentity(batch, traceIdentity)) {
        failTrace("Trace 返回了不属于本次输入或观测配置的事件，已拒绝显示。", {
          code: "TRACE_PROTOCOL_ERROR",
          message: "Trace batch execution identity mismatch",
        });
        return;
      }
      afterSequence = batch.nextSequence;
      if (!appendEvents(batch.events)) return;
      const unread = afterSequence < batch.totalEventCount;
      if (isTerminalTraceStatus(batch.status) && !unread) {
        applyTerminal(batch.status, batch.evidence, batch.unsupported, batch.error);
        return;
      }
      const latest = batch.events.at(-1);
      publishState({
        status:
          latest?.kind === "branch"
            ? "branch"
            : batch.status === "preparing"
              ? "preparing"
              : "running",
        message:
          latest?.kind === "branch"
            ? `真实分支：第 ${String(latest.line)} 行为 ${latest.branchTaken === true ? "true" : "false"}。`
            : batch.status === "preparing"
              ? "正在准备临时影子 Trace…"
              : state.playbackPaused
                ? "C 进程继续运行；视觉回放已暂停。"
                : "正在接收真实运行轨迹…",
        evidence: batch.evidence,
        unsupported: batch.unsupported,
        error: batch.error,
      });
      schedulePoll(requestGeneration, unread ? 0 : pollIntervalMs);
    } catch {
      if (requestGeneration === generation) {
        failTrace("无法读取 Trace session；已停止本次视觉回放。", {
          code: "INTERNAL_ERROR",
          message: "Trace read IPC failed",
        });
      }
    } finally {
      readInFlight = false;
    }
  }

  const failTrace = (message: string, error: RunnerError): void => {
    const activeSession = sessionId;
    clearTimer();
    sessionId = null;
    traceIdentity = null;
    if (activeSession !== null) void api.cancelTrace(activeSession).catch(() => undefined);
    publishState({
      status: error.code === "RESOURCE_LIMIT" ? "resource" : "error",
      message,
      error,
      sessionId: null,
    });
  };

  const resetVisuals = (): void => {
    events = [];
    pendingPlayback = [];
    afterSequence = 0;
    publishEvents();
    options.onPathReset?.();
  };

  const invalidateForSourceChange = (): void => {
    const activeSession = sessionId;
    generation += 1;
    sessionId = null;
    sourceSnapshot = null;
    traceIdentity = null;
    clearTimer();
    resetVisuals();
    publishState({
      ...idleState(),
      message: "源码已改变；旧 Trace 已取消并清空。",
    });
    if (activeSession !== null) void api.cancelTrace(activeSession).catch(() => undefined);
  };

  const start = async (input?: TraceControllerInput): Promise<void> => {
    assertAlive(destroyed);
    if (sessionId !== null) await cancel();
    const requestGeneration = generation + 1;
    generation = requestGeneration;
    resetVisuals();
    let source: string;
    let displayName: string;
    try {
      source = options.getSource();
      displayName = options.getDisplayName();
      if (typeof source !== "string" || typeof displayName !== "string") throw new TypeError();
    } catch {
      publishState({
        ...idleState(),
        status: "error",
        message: "无法取得当前源码，未启动 Trace。",
        error: { code: "INVALID_REQUEST", message: "source callbacks failed" },
      });
      return;
    }
    const fingerprint = fingerprintSource(source);
    const inputSnapshot = snapshotTraceInput(input);
    const expectedInputFingerprint = fingerprintSource(inputSnapshot.stdin ?? "");
    const expectedProfileId = inputSnapshot.observationProfileId ?? null;
    traceIdentity = null;
    sourceSnapshot = Object.freeze({ source, fingerprint });
    publishState({
      status: "preparing",
      message: "正在准备临时影子 Trace…",
      sessionId: null,
      sourceFingerprint: fingerprint,
      inputFingerprint: null,
      observationProfileId: null,
      observationAuthorizationDigest: null,
      playbackPaused: false,
      eventCount: 0,
      evidence: null,
      unsupported: null,
      error: null,
    });
    try {
      const result = await api.startTrace({
        source,
        sourceFingerprint: fingerprint,
        sourceName: toTraceSourceName(displayName),
        ...inputSnapshot,
      });
      if (destroyed || requestGeneration !== generation) {
        if (result.ok) void api.cancelTrace(result.sessionId).catch(() => undefined);
        return;
      }
      if (!sourceStillCurrent()) {
        if (result.ok) void api.cancelTrace(result.sessionId).catch(() => undefined);
        invalidateForSourceChange();
        return;
      }
      if (!result.ok) {
        const status =
          result.unsupported !== null || result.error.code === "TRACE_UNSUPPORTED"
            ? "unsupported"
            : result.error.code === "RESOURCE_LIMIT"
              ? "resource"
              : "error";
        publishState({
          status,
          message: result.unsupported?.message ?? result.error.message,
          sessionId: null,
          unsupported: result.unsupported,
          error: result.error,
        });
        return;
      }
      if (result.sourceFingerprint !== fingerprint) {
        void api.cancelTrace(result.sessionId).catch(() => undefined);
        publishState({
          status: "error",
          message: "Trace session 与当前源码不匹配，已拒绝启动。",
          sessionId: null,
          error: {
            code: "TRACE_SOURCE_MISMATCH",
            message: "Trace start fingerprint mismatch",
          },
        });
        return;
      }
      if (!validStartIdentity(result, expectedInputFingerprint, expectedProfileId)) {
        void api.cancelTrace(result.sessionId).catch(() => undefined);
        publishState({
          status: "error",
          message: "Trace session 与本次输入或观测配置不匹配，已拒绝启动。",
          sessionId: null,
          inputFingerprint: null,
          observationProfileId: null,
          observationAuthorizationDigest: null,
          error: {
            code: "TRACE_PROTOCOL_ERROR",
            message: "Trace start execution identity mismatch",
          },
        });
        return;
      }
      traceIdentity = freezeIdentity(result);
      sessionId = result.sessionId;
      publishState({
        sessionId,
        inputFingerprint: traceIdentity.inputFingerprint,
        observationProfileId: traceIdentity.observationProfileId,
        observationAuthorizationDigest: traceIdentity.observationAuthorizationDigest,
        status: "preparing",
        message: "Trace session 已建立，等待真实事件…",
      });
      schedulePoll(requestGeneration);
    } catch {
      if (requestGeneration === generation) {
        publishState({
          status: "error",
          message: "无法启动 Trace IPC。",
          sessionId: null,
          error: { code: "INTERNAL_ERROR", message: "Trace start IPC failed" },
        });
      }
    }
  };

  const cancel = async (): Promise<void> => {
    assertAlive(destroyed);
    const activeSession = sessionId;
    const activeOperation =
      activeSession !== null ||
      state.status === "preparing" ||
      state.status === "running" ||
      state.status === "branch";
    generation += 1;
    sessionId = null;
    traceIdentity = null;
    clearTimer();
    pendingPlayback = [];
    if (!activeOperation) {
      sourceSnapshot = null;
      resetVisuals();
      publishState(idleState());
      return;
    }
    publishState({
      status: "cancelled",
      message: "Trace 已取消；这不会被记录为程序暂停。",
      sessionId: null,
      playbackPaused: false,
    });
    options.onPathReset?.();
    if (activeSession === null) return;
    try {
      await api.cancelTrace(activeSession);
    } catch {
      // Local cancellation remains authoritative for renderer state.
    }
  };

  const pausePlayback = (): void => {
    assertAlive(destroyed);
    if (state.playbackPaused || sessionId === null) return;
    publishState({
      playbackPaused: true,
      message: "C 进程继续运行；仅暂停视觉回放。",
    });
  };

  const resumePlayback = (): void => {
    assertAlive(destroyed);
    if (!state.playbackPaused) return;
    const queued = pendingPlayback;
    pendingPlayback = [];
    publishState({
      playbackPaused: false,
      message: sessionId === null ? state.message : "视觉回放已继续；C 进程从未暂停。",
    });
    for (const update of queued) options.onPathUpdate?.(update);
  };

  options.onStateChange?.(state);
  options.onEventsChange?.(Object.freeze([]));

  return Object.freeze({
    start,
    cancel,
    pausePlayback,
    resumePlayback,
    invalidateSource(): void {
      assertAlive(destroyed);
      invalidateForSourceChange();
    },
    getState(): TraceControllerState {
      assertAlive(destroyed);
      return freezeState(state);
    },
    getEvents(): readonly TraceEvent[] {
      assertAlive(destroyed);
      return Object.freeze(events.map(freezeEvent));
    },
    destroy(): void {
      if (destroyed) return;
      const activeSession = sessionId;
      destroyed = true;
      generation += 1;
      sessionId = null;
      traceIdentity = null;
      clearTimer();
      events = [];
      pendingPlayback = [];
      if (activeSession !== null) void api.cancelTrace(activeSession).catch(() => undefined);
    },
  });
}

export function toTraceSourceName(displayName: string): string {
  const leaf = displayName.trim().split(/[\\/]/u).at(-1) ?? "";
  const stem = leaf
    .replace(/\.c$/iu, "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/gu, "")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^[^A-Za-z0-9]+/u, "")
    .replace(/[._-]+$/u, "")
    .slice(0, 126);
  return `${stem.length === 0 ? "main" : stem}.c`;
}

function defaultApi(): TraceApi {
  return window.panelApi;
}

function browserScheduler(): TraceScheduler {
  return {
    setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
    clearTimeout: (token) => globalThis.clearTimeout(token as ReturnType<typeof setTimeout>),
  };
}

function snapshotTraceInput(input: TraceControllerInput | undefined): TraceControllerInput {
  if (input === undefined) return Object.freeze({});
  const snapshot: {
    stdin?: string;
    args?: readonly string[];
    fixtures?: readonly FixtureInput[];
    observationProfileId?: TraceObservationProfileId;
  } = {};
  if (input.stdin !== undefined) snapshot.stdin = input.stdin;
  if (input.args !== undefined) snapshot.args = Object.freeze([...input.args]);
  if (input.fixtures !== undefined) {
    snapshot.fixtures = Object.freeze(
      input.fixtures.map((fixture) =>
        Object.freeze({
          path: fixture.path,
          contents:
            typeof fixture.contents === "string"
              ? fixture.contents
              : Uint8Array.from(fixture.contents),
        }),
      ),
    );
  }
  if (input.observationProfileId !== undefined) {
    snapshot.observationProfileId = input.observationProfileId;
  }
  return Object.freeze(snapshot);
}

function validStartIdentity(
  identity: TraceExecutionIdentity,
  expectedInputFingerprint: string,
  expectedProfileId: TraceObservationProfileId | null,
): boolean {
  if (
    identity.inputFingerprint !== expectedInputFingerprint ||
    identity.observationProfileId !== expectedProfileId
  ) {
    return false;
  }
  return expectedProfileId === null
    ? identity.observationAuthorizationDigest === null
    : /^[a-f0-9]{64}$/u.test(identity.observationAuthorizationDigest ?? "");
}

function sameTraceIdentity(left: TraceExecutionIdentity, right: TraceExecutionIdentity): boolean {
  return (
    left.inputFingerprint === right.inputFingerprint &&
    left.observationProfileId === right.observationProfileId &&
    left.observationAuthorizationDigest === right.observationAuthorizationDigest
  );
}

function freezeIdentity(identity: TraceExecutionIdentity): TraceExecutionIdentity {
  return Object.freeze({
    inputFingerprint: identity.inputFingerprint,
    observationProfileId: identity.observationProfileId,
    observationAuthorizationDigest: identity.observationAuthorizationDigest,
  });
}

function freezeEvent(event: TraceEvent): TraceEvent {
  return Object.freeze({ ...event });
}

function freezePathUpdate(event: TraceEvent, resolved: ResolvedTraceEvent): RealTracePathUpdate {
  return Object.freeze({
    mode: "real",
    event: freezeEvent(event),
    nodeIds: Object.freeze([...resolved.nodeIds]),
    edgeIds: Object.freeze([...resolved.edgeIds]),
    currentNodeId: resolved.currentNodeId,
  });
}

function freezeState(state: TraceControllerState): TraceControllerState {
  return Object.freeze({
    ...state,
    evidence: state.evidence === null ? null : Object.freeze({ ...state.evidence }),
    unsupported: state.unsupported === null ? null : Object.freeze({ ...state.unsupported }),
    error: state.error === null ? null : Object.freeze({ ...state.error }),
  });
}

function idleState(): TraceControllerState {
  return freezeState({
    status: "idle",
    message: "尚未启动真实运行轨迹。",
    sessionId: null,
    sourceFingerprint: null,
    inputFingerprint: null,
    observationProfileId: null,
    observationAuthorizationDigest: null,
    playbackPaused: false,
    eventCount: 0,
    evidence: null,
    unsupported: null,
    error: null,
  });
}

function terminalMessage(
  status: TraceControllerStatus,
  evidence: TraceRunEvidence | null,
  unsupported: TraceUnsupportedReason | null,
  error: RunnerError | null,
): string {
  if (status === "completed") {
    return evidence === null
      ? "真实 Trace 已完成。"
      : `真实 Trace 已完成：${String(evidence.durationMs)} ms，峰值 ${String(evidence.peakRssBytes)} B。`;
  }
  if (status === "cancelled") return "Trace 已取消。";
  if (status === "truncated") return error?.message ?? "Trace 达到后端硬上限，已截断。";
  if (status === "unsupported") return unsupported?.message ?? "当前源码布局不支持可靠 Trace。";
  if (status === "resource") return error?.message ?? "Trace 因资源限制停止。";
  return error?.message ?? "Trace 未能完成。";
}

function assertOptions(options: TraceControllerOptions): void {
  if (typeof options.getSource !== "function" || typeof options.getDisplayName !== "function") {
    throw new TypeError("TraceController 需要源码与文件名回调");
  }
  if (typeof options.resolveTraceEvent !== "function") {
    throw new TypeError("TraceController 需要 resolveTraceEvent");
  }
}

function assertAlive(destroyed: boolean): void {
  if (destroyed) throw new Error("TraceController 已销毁");
}

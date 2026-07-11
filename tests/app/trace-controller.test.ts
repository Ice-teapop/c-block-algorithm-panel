import { describe, expect, it, vi } from "vitest";
import {
  createTraceController,
  toTraceSourceName,
  type TraceControllerState,
  type TraceScheduler,
} from "../../src/app/trace-controller.js";
import type { FixtureInput, PanelApi, RunnerError } from "../../src/shared/api.js";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import type {
  SuccessfulTraceBatch,
  TraceEvent,
  TraceRunEvidence,
  TraceStartResult,
} from "../../src/shared/trace.js";

const SOURCE = [
  "int main(void) {",
  "  int value = 1;",
  "  if (value) value++;",
  "  return value;",
  "}",
].join("\n");
const SESSION_ID = "trace-session-1";

describe("trace controller", () => {
  it("polls at about 100 ms and emits only real path updates", async () => {
    const scheduler = new FakeScheduler();
    const states: TraceControllerState[] = [];
    const pathUpdates: Array<{ readonly mode: string; readonly currentNodeId: string | null }> = [];
    const api = traceApi({
      reads: [
        batch({
          status: "running",
          events: [event(1, "line", 2), event(2, "branch", 3, true)],
          totalEventCount: 2,
          nextSequence: 2,
        }),
        batch({
          status: "completed",
          afterSequence: 2,
          nextSequence: 2,
          totalEventCount: 2,
          evidence: evidence(),
        }),
      ],
    });
    const controller = createTraceController({
      api,
      scheduler,
      getSource: () => SOURCE,
      getDisplayName: () => "/Users/student/branch demo.c",
      resolveTraceEvent: (traceEvent) => ({
        nodeIds: [`node-${String(traceEvent.line)}`],
        edgeIds: traceEvent.kind === "branch" ? ["edge-true"] : [],
        currentNodeId: `node-${String(traceEvent.line)}`,
      }),
      onStateChange: (state) => states.push(state),
      onPathUpdate: (update) => pathUpdates.push(update),
    });

    await controller.start();

    expect(api.startTrace).toHaveBeenCalledWith({
      source: SOURCE,
      sourceFingerprint: fingerprintSource(SOURCE),
      sourceName: "branch-demo.c",
    });
    expect(scheduler.nextDelay).toBe(100);

    scheduler.runNext();
    await flushAsyncWork();

    expect(api.readTrace).toHaveBeenCalledWith(SESSION_ID, 0);
    expect(pathUpdates.map(({ mode, currentNodeId }) => ({ mode, currentNodeId }))).toEqual([
      { mode: "real", currentNodeId: "node-2" },
      { mode: "real", currentNodeId: "node-3" },
    ]);
    expect(controller.getState()).toMatchObject({ status: "branch", eventCount: 2 });
    expect(scheduler.nextDelay).toBe(100);

    scheduler.runNext();
    await flushAsyncWork();

    expect(api.readTrace).toHaveBeenLastCalledWith(SESSION_ID, 2);
    expect(controller.getState()).toMatchObject({
      status: "completed",
      sessionId: null,
      evidence: evidence(),
    });
    expect(states.at(-1)?.message).toContain("真实 Trace 已完成");
    expect(scheduler.pendingCount).toBe(0);
  });

  it("pauses only visual playback while polling continues, then flushes queued real events", async () => {
    const scheduler = new FakeScheduler();
    const pathModes: string[] = [];
    const eventSnapshots: Array<readonly TraceEvent[]> = [];
    const api = traceApi({
      reads: [
        batch({
          status: "running",
          events: [event(1, "line", 2)],
          nextSequence: 1,
          totalEventCount: 1,
        }),
      ],
    });
    const controller = createTraceController({
      api,
      scheduler,
      getSource: () => SOURCE,
      getDisplayName: () => "main.c",
      resolveTraceEvent: () => ({
        nodeIds: ["statement"],
        edgeIds: [],
        currentNodeId: "statement",
      }),
      onEventsChange: (events) => eventSnapshots.push(events),
      onPathUpdate: (update) => pathModes.push(update.mode),
    });

    await controller.start();
    controller.pausePlayback();
    scheduler.runNext();
    await flushAsyncWork();

    expect(pathModes).toEqual([]);
    expect(eventSnapshots.at(-1)).toHaveLength(1);
    expect(controller.getState()).toMatchObject({
      status: "running",
      playbackPaused: true,
    });
    expect(controller.getState().message).toContain("C 进程继续运行");
    expect(api.cancelTrace).not.toHaveBeenCalled();

    controller.resumePlayback();

    expect(pathModes).toEqual(["real"]);
    expect(controller.getState().playbackPaused).toBe(false);
    expect(controller.getState().message).toContain("C 进程从未暂停");
  });

  it("keeps an idle controller idle when workspace adoption requests cancellation", async () => {
    const api = traceApi();
    const controller = createController(api, new FakeScheduler());

    await controller.cancel();

    expect(controller.getState()).toMatchObject({
      status: "idle",
      sessionId: null,
      sourceFingerprint: null,
      eventCount: 0,
    });
    expect(api.cancelTrace).not.toHaveBeenCalled();
  });

  it("keeps a real active-session cancellation distinct from an idle reset", async () => {
    const api = traceApi();
    const controller = createController(api, new FakeScheduler());
    await controller.start();

    await controller.cancel();

    expect(controller.getState()).toMatchObject({ status: "cancelled", sessionId: null });
    expect(api.cancelTrace).toHaveBeenCalledWith(SESSION_ID);
  });

  it("passes an immutable snapshot of real scenario input to the Trace backend", async () => {
    const api = traceApi();
    const controller = createController(api, new FakeScheduler());
    const args = ["--branch", "right"];
    const fixtureBytes = Uint8Array.from([1, 2, 3]);
    const fixtures: FixtureInput[] = [{ path: "fixtures/input.bin", contents: fixtureBytes }];

    const start = controller.start({ stdin: "42\n", args, fixtures });
    args[0] = "--mutated";
    fixtureBytes[0] = 99;
    fixtures[0] = { path: "changed.bin", contents: "changed" };
    await start;

    const request = api.startTrace.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      stdin: "42\n",
      args: ["--branch", "right"],
      fixtures: [{ path: "fixtures/input.bin" }],
    });
    expect(request.fixtures[0]?.contents).toEqual(Uint8Array.from([1, 2, 3]));
    expect(Object.isFrozen(request.args)).toBe(true);
    expect(Object.isFrozen(request.fixtures)).toBe(true);
    expect(Object.isFrozen(request.fixtures[0])).toBe(true);
  });

  it("cancels and clears stale evidence immediately when source is invalidated", async () => {
    const scheduler = new FakeScheduler();
    const eventSnapshots: Array<readonly TraceEvent[]> = [];
    const reset = vi.fn();
    const api = traceApi();
    const controller = createTraceController({
      api,
      scheduler,
      getSource: () => SOURCE,
      getDisplayName: () => "main.c",
      resolveTraceEvent: () => null,
      onEventsChange: (events) => eventSnapshots.push(events),
      onPathReset: reset,
    });

    await controller.start();
    controller.invalidateSource();
    await flushAsyncWork();

    expect(api.cancelTrace).toHaveBeenCalledWith(SESSION_ID);
    expect(eventSnapshots.at(-1)).toEqual([]);
    expect(reset).toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({
      status: "idle",
      sessionId: null,
      sourceFingerprint: null,
      eventCount: 0,
    });
    expect(controller.getState().message).toContain("源码已改变");
    expect(scheduler.pendingCount).toBe(0);
  });

  it("detects an unannounced source change before the next backend read", async () => {
    let currentSource = SOURCE;
    const scheduler = new FakeScheduler();
    const api = traceApi();
    const controller = createTraceController({
      api,
      scheduler,
      getSource: () => currentSource,
      getDisplayName: () => "main.c",
      resolveTraceEvent: () => null,
    });

    await controller.start();
    currentSource = `${SOURCE}\n`;
    scheduler.runNext();
    await flushAsyncWork();

    expect(api.readTrace).not.toHaveBeenCalled();
    expect(api.cancelTrace).toHaveBeenCalledWith(SESSION_ID);
    expect(controller.getState()).toMatchObject({
      status: "idle",
      sourceFingerprint: null,
      eventCount: 0,
    });
  });

  it("rejects a backend session bound to another source fingerprint", async () => {
    const scheduler = new FakeScheduler();
    const api = traceApi({
      start: {
        ok: true,
        sessionId: SESSION_ID,
        sourceFingerprint: fingerprintSource(`${SOURCE}\n`),
        status: "preparing",
      },
    });
    const controller = createController(api, scheduler);

    await controller.start();
    await flushAsyncWork();

    expect(api.cancelTrace).toHaveBeenCalledWith(SESSION_ID);
    expect(controller.getState()).toMatchObject({
      status: "error",
      sessionId: null,
      error: { code: "TRACE_SOURCE_MISMATCH" },
    });
    expect(scheduler.pendingCount).toBe(0);
  });

  it("keeps unsupported, resource and truncated outcomes distinct", async () => {
    const unsupportedApi = traceApi({
      start: {
        ok: false,
        error: { code: "TRACE_UNSUPPORTED", message: "unsupported layout" },
        unsupported: {
          code: "unsupported-control-layout",
          line: 4,
          message: "无法可靠插桩该控制结构",
        },
      },
    });
    const unsupported = createController(unsupportedApi, new FakeScheduler());

    await unsupported.start();

    expect(unsupported.getState()).toMatchObject({
      status: "unsupported",
      message: "无法可靠插桩该控制结构",
    });

    const resourceScheduler = new FakeScheduler();
    const resource = createController(
      traceApi({
        reads: [
          batch({
            status: "failed",
            error: { code: "RESOURCE_LIMIT", message: "RSS limit" },
          }),
        ],
      }),
      resourceScheduler,
    );
    await resource.start();
    resourceScheduler.runNext();
    await flushAsyncWork();
    expect(resource.getState()).toMatchObject({ status: "resource", message: "RSS limit" });

    const truncatedScheduler = new FakeScheduler();
    const truncated = createController(
      traceApi({
        reads: [
          batch({
            status: "truncated",
            truncated: true,
            error: { code: "TRACE_LIMIT", message: "event cap reached" },
          }),
        ],
      }),
      truncatedScheduler,
    );
    await truncated.start();
    truncatedScheduler.runNext();
    await flushAsyncWork();
    expect(truncated.getState()).toMatchObject({
      status: "truncated",
      message: "event cap reached",
    });
  });

  it("sanitizes display paths and bounds the shadow C source name", () => {
    expect(toTraceSourceName("C:\\Users\\student\\sort demo.C")).toBe("sort-demo.c");
    expect(toTraceSourceName("保真.c")).toBe("main.c");
    expect(toTraceSourceName(`/private/tmp/${"a".repeat(300)}.c`)).toHaveLength(128);
  });
});

class FakeScheduler implements TraceScheduler {
  readonly #tasks: Array<{
    readonly token: number;
    readonly callback: () => void;
    readonly delay: number;
  }> = [];
  #nextToken = 1;

  setTimeout(callback: () => void, delay: number): number {
    const token = this.#nextToken;
    this.#nextToken += 1;
    this.#tasks.push({ token, callback, delay });
    return token;
  }

  clearTimeout(token: unknown): void {
    const index = this.#tasks.findIndex((task) => task.token === token);
    if (index >= 0) this.#tasks.splice(index, 1);
  }

  runNext(): void {
    const next = this.#tasks.shift();
    if (next === undefined) throw new Error("No scheduled Trace poll");
    next.callback();
  }

  get nextDelay(): number | undefined {
    return this.#tasks[0]?.delay;
  }

  get pendingCount(): number {
    return this.#tasks.length;
  }
}

interface TraceApiOptions {
  readonly start?: TraceStartResult;
  readonly reads?: readonly SuccessfulTraceBatch[];
}

function traceApi(options: TraceApiOptions = {}): Pick<
  PanelApi,
  "startTrace" | "readTrace" | "cancelTrace"
> & {
  readonly startTrace: ReturnType<typeof vi.fn>;
  readonly readTrace: ReturnType<typeof vi.fn>;
  readonly cancelTrace: ReturnType<typeof vi.fn>;
} {
  const reads = [...(options.reads ?? [])];
  return {
    startTrace: vi.fn().mockResolvedValue(
      options.start ?? {
        ok: true,
        sessionId: SESSION_ID,
        sourceFingerprint: fingerprintSource(SOURCE),
        status: "preparing",
      },
    ),
    readTrace: vi.fn().mockImplementation(() => {
      const result = reads.shift();
      if (result === undefined) throw new Error("Unexpected Trace read");
      return Promise.resolve(result);
    }),
    cancelTrace: vi.fn().mockResolvedValue({
      ok: true,
      sessionId: SESSION_ID,
      status: "cancelled",
    }),
  };
}

function createController(
  api: Pick<PanelApi, "startTrace" | "readTrace" | "cancelTrace">,
  scheduler: TraceScheduler,
) {
  return createTraceController({
    api,
    scheduler,
    getSource: () => SOURCE,
    getDisplayName: () => "main.c",
    resolveTraceEvent: () => null,
  });
}

interface BatchOverrides {
  readonly status: SuccessfulTraceBatch["status"];
  readonly afterSequence?: number;
  readonly nextSequence?: number;
  readonly events?: readonly TraceEvent[];
  readonly totalEventCount?: number;
  readonly truncated?: boolean;
  readonly evidence?: TraceRunEvidence | null;
  readonly error?: RunnerError | null;
}

function batch(overrides: BatchOverrides): SuccessfulTraceBatch {
  return Object.freeze({
    ok: true,
    sessionId: SESSION_ID,
    sourceFingerprint: fingerprintSource(SOURCE),
    status: overrides.status,
    afterSequence: overrides.afterSequence ?? 0,
    nextSequence: overrides.nextSequence ?? 0,
    events: Object.freeze([...(overrides.events ?? [])]),
    totalEventCount: overrides.totalEventCount ?? 0,
    totalEventBytes: 0,
    truncated: overrides.truncated ?? false,
    unsupported: null,
    evidence: overrides.evidence ?? null,
    error: overrides.error ?? null,
  });
}

function event(
  sequence: number,
  kind: TraceEvent["kind"],
  line: number,
  branchTaken: boolean | null = null,
): TraceEvent {
  return Object.freeze({ sequence, kind, line, branchTaken, elapsedMs: sequence * 2.5 });
}

function evidence(): TraceRunEvidence {
  return Object.freeze({
    ok: true,
    exitCode: 0,
    signal: null,
    termination: "process-exit",
    durationMs: 18,
    peakRssBytes: 1_048_576,
    peakProcessCount: 1,
    outputBytes: 12,
    executedNodeCount: 3,
    operationCount: 7,
  });
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

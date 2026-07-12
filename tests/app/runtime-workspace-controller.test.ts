import { afterEach, describe, expect, it, vi } from "vitest";
import type { FlowEdge, FlowNode, FlowProjection } from "../../src/flow/index.js";
import type {
  AlgorithmScenarioDefinition,
  ScenarioProvider,
  ScenarioRunCase,
} from "../../src/mentor/index.js";
import {
  createRuntimeWorkspaceController,
  type RuntimeLearningObservation,
  type RuntimeWorkspaceControllerOptions,
} from "../../src/app/runtime-workspace-controller.js";
import { textRange } from "../../src/core/index.js";
import type { Capabilities, CompileResult, PanelApi, RunResult } from "../../src/shared/api.js";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import type { SuccessfulTraceBatch, TraceEvent } from "../../src/shared/trace.js";
import type { TraceScheduler } from "../../src/app/trace-controller.js";
import type { FlowCanvasActivePath } from "../../src/ui/flow-canvas.js";
import type { WorkbenchElements } from "../../src/ui/workbench-shell.js";

const SOURCE = [
  "int main(void) {",
  "  int x;",
  '  scanf("%d", &x);',
  "  if (x > 0) {",
  '    puts("positive");',
  "  } else {",
  '    puts("nonpositive");',
  "  }",
  "  return 0;",
  "}",
].join("\n");
const FINGERPRINT = fingerprintSource(SOURCE);

afterEach(() => vi.unstubAllGlobals());

describe("runtime workspace controller", () => {
  it("mounts all runtime surfaces and keeps teaching simulation out of real APIs", async () => {
    const harness = setup();

    await harness.controller.scenario.simulateForTeaching();

    expect(harness.elements.scenarioHost.children).toHaveLength(1);
    expect(harness.elements.traceHost.children).toHaveLength(1);
    expect(harness.elements.metricsHost.children).toHaveLength(1);
    expect(harness.elements.mentorHost.children).toHaveLength(1);
    expect(harness.api.startTrace).not.toHaveBeenCalled();
    expect(harness.api.compile).not.toHaveBeenCalled();
    expect(harness.api.run).not.toHaveBeenCalled();
    expect(harness.paths.at(-1)).toMatchObject({ mode: "simulation" });
    expect(harness.paths.at(-1)?.nodeIds.length).toBeGreaterThan(0);
    expect(harness.saved.some((request) => request.kind === "run-history")).toBe(false);
    expect(harness.learningObservations).toEqual([]);
    await harness.controller.destroy();
  });

  it("passes the exact scenario input to Trace and enables only the branch actually observed", async () => {
    const harness = setup({ traceBranches: [true, false] });
    await harness.controller.setWorkspaceEntry("project-a", FINGERPRINT);

    const firstRun = harness.controller.scenario.runReal();
    await driveTrace(harness.scheduler);
    await firstRun;

    expect(harness.api.startTrace).toHaveBeenCalledWith(
      expect.objectContaining({ stdin: "1\n", args: ["--case", "1"] }),
    );
    expect(harness.api.compile).toHaveBeenCalledOnce();
    expect(harness.api.run).toHaveBeenCalledWith(
      expect.objectContaining({ stdin: "1\n", args: ["--case", "1"] }),
    );
    expect(harness.learningObservations.slice(0, 2)).toEqual([
      expect.objectContaining({
        type: "trace-completed",
        workspaceId: "project-a",
        sourceFingerprint: FINGERPRINT,
        scenarioId: "scenario.test.branch",
        scenarioVersion: "1.0.0",
        size: 1,
        mapped: true,
        truncated: false,
        branchKinds: ["branch-true"],
      }),
      expect.objectContaining({
        type: "run-completed",
        workspaceId: "project-a",
        sourceFingerprint: FINGERPRINT,
        stdout: "positive\n",
        expectedStdout: "positive\n",
        expectedMatch: true,
        exitCode: 0,
        termination: "process-exit",
        historyDisposition: "success",
      }),
    ]);
    harness.controller.scenario.selectTargetBranch("edge.true");
    expect(() => harness.controller.scenario.selectTargetBranch("edge.false")).toThrow(
      /尚未由真实 Trace/u,
    );

    const secondRun = harness.controller.scenario.runReal();
    await driveTrace(harness.scheduler);
    await expect(secondRun).rejects.toThrow(/未经过目标分支/u);
    expect(harness.api.compile).toHaveBeenCalledOnce();
    await harness.controller.flush();
    const scenarios = harness.saved.find((request) => request.kind === "scenarios");
    expect(JSON.parse(scenarios?.serialized ?? "null")).toMatchObject({
      schemaVersion: 1,
      selection: { scenarioId: "scenario.test.branch", targetBranchId: "edge.true" },
      activeCase: { stdin: "1\n", arguments: ["--case", "1"] },
      definitions: [
        {
          id: "scenario.test.branch",
          example: { expected: { stdout: "positive\n" } },
          sizeGenerator: { minimum: 1, maximum: 3, defaultSizes: [1, 2, 3] },
        },
      ],
    });
    expect(harness.saved.some((request) => request.kind === "run-history")).toBe(true);
    const runHistory = harness.saved.find((request) => request.kind === "run-history");
    expect(JSON.parse(runHistory?.serialized ?? "null")).toMatchObject({
      entries: [
        {
          trace: {
            status: "validated",
            edgeIds: expect.arrayContaining(["edge.true"]),
            nodeVisits: expect.arrayContaining([
              expect.objectContaining({ nodeId: "branch", count: 1 }),
            ]),
          },
        },
      ],
    });
    await harness.controller.destroy();
  });

  it("reports a wrong real output as teaching evidence before rejecting history", async () => {
    const harness = setup({ runStdout: "wrong\n" });
    await harness.controller.setWorkspaceEntry("tutorial-a", FINGERPRINT);

    const run = harness.controller.scenario.runReal();
    await driveTrace(harness.scheduler);
    await expect(run).rejects.toThrow(/期望不一致/u);

    expect(harness.learningObservations).toEqual([
      expect.objectContaining({
        type: "trace-completed",
        workspaceId: "tutorial-a",
        branchKinds: ["branch-true"],
      }),
      expect.objectContaining({
        type: "run-completed",
        workspaceId: "tutorial-a",
        ok: true,
        stdout: "wrong\n",
        expectedStdout: "positive\n",
        expectedMatch: false,
        historyDisposition: "teaching-failure",
      }),
    ]);
    await harness.controller.flush();
    expect(harness.saved.some((request) => request.kind === "run-history")).toBe(false);
    await harness.controller.destroy();
  });

  it("reports a fully mapped Trace started directly from the Trace panel", async () => {
    const harness = setup();
    await harness.controller.setWorkspaceEntry("tutorial-trace", FINGERPRINT);

    findElement(
      harness.elements.traceHost,
      (element) => element.textContent === "观察路径",
    ).click();
    await driveTrace(harness.scheduler);
    await waitFor(() => harness.learningObservations.length === 1);

    expect(harness.learningObservations).toEqual([
      expect.objectContaining({
        type: "trace-completed",
        workspaceId: "tutorial-trace",
        sourceFingerprint: FINGERPRINT,
        scenarioId: "scenario.test.branch",
        scenarioVersion: "1.0.0",
        size: 1,
        branchKinds: ["branch-true"],
      }),
    ]);
    expect(harness.api.compile).not.toHaveBeenCalled();
    expect(harness.api.run).not.toHaveBeenCalled();
    await harness.controller.destroy();
  });

  it("stops a real benchmark immediately after the source changes", async () => {
    const secondCompile = deferred<CompileResult>();
    const harness = setup({ deferCompileCall: 2, deferredCompile: secondCompile });
    harness.controller.scenario.configureBenchmark([1, 2, 3], 3);

    const benchmark = harness.controller.scenario.runBenchmark();
    await driveTrace(harness.scheduler);
    await driveTrace(harness.scheduler);
    await waitFor(() => harness.api.compile.mock.calls.length === 2);
    harness.source.value = `${SOURCE}\n`;
    harness.controller.invalidateSource();
    secondCompile.resolve(successfulCompile("artifact-2"));

    await expect(benchmark).rejects.toThrow(/失效|改变/u);
    expect(harness.api.run).toHaveBeenCalledOnce();
    expect(harness.api.compile).toHaveBeenCalledTimes(2);
    await harness.controller.destroy();
  });

  it("recovers from a damaged scenarios sidecar without changing source", async () => {
    const harness = setup({ damagedScenarioSidecar: true });

    await expect(
      harness.controller.setWorkspaceEntry("project-a", FINGERPRINT),
    ).resolves.toBeUndefined();
    expect(harness.source.value).toBe(SOURCE);
    expect(harness.controller.scenario.getSnapshot()).toMatchObject({
      scenarioId: "scenario.test.branch",
      size: 1,
      targetBranch: null,
    });
    await harness.controller.destroy();
  });
});

interface SetupOptions {
  readonly traceBranches?: readonly boolean[];
  readonly runStdout?: string;
  readonly deferCompileCall?: number;
  readonly deferredCompile?: Deferred<CompileResult>;
  readonly damagedScenarioSidecar?: boolean;
}

function setup(config: SetupOptions = {}) {
  const document = new FakeDocument();
  const elements = workbenchElements(document);
  const scheduler = new FakeScheduler();
  const source = { value: SOURCE };
  const paths: FlowCanvasActivePath[] = [];
  const learningObservations: RuntimeLearningObservation[] = [];
  const saved: Array<{ kind: string; serialized: string }> = [];
  const traceBranches = [...(config.traceBranches ?? [true])];
  const traceSessions = new Map<string, { branch: boolean; reads: number }>();
  let nextSession = 0;
  let compileCalls = 0;

  const api = {
    capabilities: vi.fn(async () => capabilities()),
    compile: vi.fn(async () => {
      compileCalls += 1;
      if (compileCalls === config.deferCompileCall && config.deferredCompile !== undefined) {
        return config.deferredCompile.promise;
      }
      return successfulCompile(`artifact-${String(compileCalls)}`);
    }),
    run: vi.fn(async (request: { stdin?: string }) =>
      successfulRun(config.runStdout ?? expectedForInput(request.stdin)),
    ),
    startTrace: vi.fn(async (request: { sourceFingerprint: string }) => {
      const sessionId = `trace-${String(++nextSession)}`;
      traceSessions.set(sessionId, { branch: traceBranches.shift() ?? true, reads: 0 });
      return {
        ok: true as const,
        sessionId,
        sourceFingerprint: request.sourceFingerprint,
        status: "preparing" as const,
      };
    }),
    readTrace: vi.fn(async (sessionId: string, afterSequence: number) => {
      const session = traceSessions.get(sessionId);
      if (session === undefined) throw new Error("unknown trace");
      session.reads += 1;
      if (session.reads === 1) return traceBatch(sessionId, session.branch, afterSequence);
      return traceTerminalBatch(sessionId, afterSequence);
    }),
    cancelTrace: vi.fn(async (sessionId: string) => ({
      ok: true as const,
      sessionId,
      status: "cancelled" as const,
    })),
    readWorkspaceSidecar: vi.fn(async (request: { kind: string }) => {
      if (request.kind === "scenarios" && config.damagedScenarioSidecar === true) {
        return {
          status: "ready" as const,
          document: {
            kind: "scenarios" as const,
            revision: 0,
            sourceFingerprint: FINGERPRINT,
            serialized: "{damaged",
            updatedAt: "2026-07-12T00:00:00.000Z",
          },
        };
      }
      return { status: "missing" as const, kind: request.kind };
    }),
    saveWorkspaceSidecar: vi.fn(
      async (request: { kind: string; serialized: string; sourceFingerprint: string }) => {
        saved.push({ kind: request.kind, serialized: request.serialized });
        return {
          status: "saved" as const,
          document: {
            kind: request.kind,
            revision: 0,
            sourceFingerprint: request.sourceFingerprint,
            serialized: request.serialized,
            updatedAt: "2026-07-12T00:00:00.000Z",
          },
        };
      },
    ),
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { panelApi: api });

  const options: RuntimeWorkspaceControllerOptions = {
    elements: elements as unknown as WorkbenchElements,
    api: api as unknown as PanelApi,
    codePane: {
      setDiagnosticHighlights: vi.fn(),
    } as never,
    blockTree: {
      setDiagnostics: vi.fn(),
    } as never,
    getSource: () => source.value,
    getAnalyzedSource: () => source.value,
    getDisplayName: () => "main.c",
    getAnalysis: () => null,
    getProjection: () => (source.value === SOURCE ? projection() : null),
    onSetActivePath: (path) => paths.push(path),
    onFocusNode: vi.fn(),
    onRevealRange: vi.fn(),
    onLearningObservation: (observation) => learningObservations.push(observation),
    scenarioProvider: provider(),
    traceScheduler: scheduler,
    tracePollIntervalMs: 50,
    sidecarDelayMs: 60_000,
  };
  return {
    controller: createRuntimeWorkspaceController(options),
    api,
    elements,
    scheduler,
    source,
    paths,
    learningObservations,
    saved,
  };
}

function provider(): ScenarioProvider {
  const definition: AlgorithmScenarioDefinition = Object.freeze({
    id: "scenario.test.branch",
    version: "1.0.0",
    family: "searching",
    label: "分支测试",
    description: "使用正整数经过 true 分支。",
    example: runCase(1),
    sizeGenerator: Object.freeze({
      minimum: 1,
      maximum: 3,
      defaultSizes: Object.freeze([1, 2, 3]),
      inputModel: "stdin integer",
    }),
  });
  return Object.freeze({
    id: "test-provider",
    version: "1.0.0",
    networkAccess: "none",
    list: () => Object.freeze([definition]),
    get: (id: string) => (id === definition.id ? definition : null),
    generate: (id: string, size: number) => {
      if (id !== definition.id) throw new RangeError(id);
      return runCase(size);
    },
  });
}

function runCase(size: number): ScenarioRunCase {
  return Object.freeze({
    scenarioId: "scenario.test.branch",
    scenarioVersion: "1.0.0",
    size,
    stdin: `${String(size)}\n`,
    arguments: Object.freeze(["--case", String(size)]),
    expected: Object.freeze({
      stdout: "positive\n",
      explanation: "all generated inputs are positive",
    }),
  });
}

function projection(): FlowProjection {
  const ranges = lineRanges(SOURCE);
  const nodes = [
    node("start", "start", 0, 0),
    node("read", "statement", ranges[2]!.from, ranges[2]!.to),
    node("branch", "branch", ranges[3]!.from, ranges[3]!.to),
    node("positive", "statement", ranges[4]!.from, ranges[4]!.to),
    node("negative", "statement", ranges[6]!.from, ranges[6]!.to),
    node("return", "statement", ranges[8]!.from, ranges[8]!.to),
    node("end", "end", SOURCE.length, SOURCE.length),
  ];
  return Object.freeze({
    schemaVersion: 1,
    sourceRevision: 1,
    sourceFingerprint: FINGERPRINT,
    sourceLength: SOURCE.length,
    documentHasError: false,
    functions: Object.freeze([
      Object.freeze({
        id: "function.main",
        name: "main",
        range: textRange(0, SOURCE.length),
        entryNodeId: "start",
        exitNodeId: "end",
        partial: false,
        lockReasons: Object.freeze([]),
      }),
    ]),
    nodes: Object.freeze(nodes),
    edges: Object.freeze([
      edge("edge.entry", "start", "read", "entry"),
      edge("edge.next", "read", "branch", "next"),
      edge("edge.true", "branch", "positive", "branch-true"),
      edge("edge.false", "branch", "negative", "branch-false"),
      edge("edge.true-return", "positive", "return", "next"),
      edge("edge.false-return", "negative", "return", "next"),
      edge("edge.return", "return", "end", "return"),
    ]),
    dataEdges: Object.freeze([]),
  });
}

function node(id: string, kind: FlowNode["kind"], from: number, to: number): FlowNode {
  return Object.freeze({
    id,
    functionId: "function.main",
    sourceNodeId: id,
    kind,
    label: id,
    nodeType: null,
    range: textRange(from, to),
    ownerBlockRange: textRange(from, to),
    sourceText: SOURCE.slice(from, to),
    reachable: true,
    locked: false,
    lockReasons: Object.freeze([]),
    allowsFanOut: kind === "branch",
    defaultPosition: Object.freeze({ x: 0, y: 0 }),
    ports: Object.freeze([]),
  });
}

function edge(id: string, from: string, to: string, kind: FlowEdge["kind"]): FlowEdge {
  return Object.freeze({
    id,
    functionId: "function.main",
    from: Object.freeze({ nodeId: from, portId: `${from}:out` }),
    to: Object.freeze({ nodeId: to, portId: `${to}:in` }),
    kind,
    channel: "control" as const,
    slot: 0,
    editable: true,
  });
}

function lineRanges(source: string): Array<{ from: number; to: number }> {
  const result = [];
  let from = 0;
  for (const line of source.split("\n")) {
    result.push({ from, to: from + line.length });
    from += line.length + 1;
  }
  return result;
}

function traceBatch(
  sessionId: string,
  branch: boolean,
  afterSequence: number,
): SuccessfulTraceBatch {
  const events: readonly TraceEvent[] = Object.freeze([
    event(1, "line", 3),
    event(2, "branch", 4, branch),
    event(3, "line", branch ? 5 : 7),
    event(4, "line", 9),
  ]);
  return Object.freeze({
    ok: true,
    sessionId,
    sourceFingerprint: FINGERPRINT,
    status: "running",
    afterSequence,
    nextSequence: 4,
    events,
    totalEventCount: 4,
    totalEventBytes: 64,
    truncated: false,
    unsupported: null,
    evidence: null,
    error: null,
  });
}

function traceTerminalBatch(sessionId: string, afterSequence: number): SuccessfulTraceBatch {
  return Object.freeze({
    ok: true,
    sessionId,
    sourceFingerprint: FINGERPRINT,
    status: "completed",
    afterSequence,
    nextSequence: 4,
    events: Object.freeze([]),
    totalEventCount: 4,
    totalEventBytes: 64,
    truncated: false,
    unsupported: null,
    evidence: Object.freeze({
      ok: true,
      exitCode: 0,
      signal: null,
      termination: "process-exit",
      durationMs: 4,
      peakRssBytes: 1024,
      peakProcessCount: 1,
      outputBytes: 9,
      executedNodeCount: 4,
      operationCount: 4,
    }),
    error: null,
  });
}

function event(
  sequence: number,
  kind: TraceEvent["kind"],
  line: number,
  branchTaken: boolean | null = null,
): TraceEvent {
  return Object.freeze({ sequence, kind, line, branchTaken, elapsedMs: sequence });
}

function successfulCompile(artifactId: string): CompileResult {
  return Object.freeze({
    ok: true,
    artifactId,
    expiresAtMs: Date.now() + 1000,
    diagnostics: "",
    compileDurationMs: 1,
  });
}

function successfulRun(stdout: string): RunResult {
  return Object.freeze({
    ok: true,
    stdout: new TextEncoder().encode(stdout),
    stderr: new Uint8Array(),
    exitCode: 0,
    signal: null,
    termination: "process-exit",
    durationMs: 2,
    peakRssBytes: 1024,
    peakProcessCount: 1,
    outputBytes: stdout.length,
    executedNodeCount: null,
    operationCount: null,
  });
}

function expectedForInput(stdin: string | undefined): string {
  return Number(stdin?.trim() ?? "0") > 0 ? "positive\n" : "nonpositive\n";
}

function capabilities(): Capabilities {
  return Object.freeze({
    mode: "trusted-only",
    runnerEnabled: true,
    toolchainId: "verified:Apple clang version 21.0.0 Target: arm64-apple-macos",
    seatbeltProbe: Object.freeze({ status: "unavailable", detail: "test" }),
    requiresNativeTrustConfirmation: false,
  });
}

async function driveTrace(scheduler: FakeScheduler): Promise<void> {
  await flushAsync();
  scheduler.runNext();
  await flushAsync();
  scheduler.runNext();
  await flushAsync();
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await flushAsync();
  }
  throw new Error("condition not reached");
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

class FakeScheduler implements TraceScheduler {
  readonly queue: Array<() => void> = [];
  setTimeout(callback: () => void): unknown {
    this.queue.push(callback);
    return callback;
  }
  clearTimeout(token: unknown): void {
    const index = this.queue.indexOf(token as () => void);
    if (index >= 0) this.queue.splice(index, 1);
  }
  runNext(): void {
    const callback = this.queue.shift();
    if (callback === undefined) throw new Error("no scheduled trace poll");
    callback();
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function workbenchElements(document: FakeDocument) {
  const hosts = {
    scenarioHost: document.createElement("div"),
    traceHost: document.createElement("div"),
    metricsHost: document.createElement("div"),
    mentorHost: document.createElement("div"),
    analysisHost: document.createElement("div"),
    runHost: document.createElement("div"),
  };
  return {
    ...hosts,
    getInspectorHost: () => hosts.runHost,
  };
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }

  createElementNS(_namespace: string, tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<() => void>>();
  readonly classList = { add: (..._tokens: string[]) => undefined };
  readonly style = { setProperty: (_name: string, _value: string) => undefined };
  parent: FakeElement | null = null;
  className = "";
  textContent = "";
  type = "";
  value = "";
  title = "";
  min = "";
  max = "";
  step = "";
  disabled = false;
  checked = false;
  hidden = false;

  constructor(
    readonly ownerDocument: FakeDocument,
    readonly tagName: string,
  ) {}

  append(...children: FakeElement[]): void {
    for (const child of children) child.parent = this;
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.children) child.parent = null;
    this.children.splice(0, this.children.length);
    this.append(...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }

  cloneNode(deep: boolean): FakeElement {
    const clone = new FakeElement(this.ownerDocument, this.tagName);
    clone.className = this.className;
    clone.textContent = this.textContent;
    if (deep) clone.append(...this.children.map((child) => child.cloneNode(true)));
    return clone;
  }

  remove(): void {
    if (this.parent === null) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }

  replaceWith(replacement: FakeElement): void {
    if (this.parent === null) return;
    const index = this.parent.children.indexOf(this);
    if (index < 0) return;
    replacement.parent = this.parent;
    this.parent.children.splice(index, 1, replacement);
    this.parent = null;
  }
}

function findElement(root: FakeElement, predicate: (element: FakeElement) => boolean): FakeElement {
  if (predicate(root)) return root;
  for (const child of root.children) {
    try {
      return findElement(child, predicate);
    } catch {
      // Continue searching the remaining descendants.
    }
  }
  throw new Error("element not found");
}

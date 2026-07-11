import { describe, expect, it, vi } from "vitest";
import type { TraceEvent } from "../../src/shared/trace.js";
import {
  createTracePanel,
  formatTraceEvent,
  selectTracePanelEvents,
  TRACE_PANEL_EVENT_LIMIT,
  tracePlaybackControlEnabled,
  traceStatusPresentation,
  type TracePanelState,
  type TracePanelStatus,
} from "../../src/ui/trace-panel.js";

describe("trace panel status contract", () => {
  it("gives every real-flow state a compact status icon and label", () => {
    const statuses: readonly TracePanelStatus[] = [
      "idle",
      "preparing",
      "running",
      "branch",
      "completed",
      "cancelled",
      "error",
      "resource",
      "truncated",
      "unsupported",
    ];

    const presentations = statuses.map((status) => [status, traceStatusPresentation(status)]);

    expect(presentations).toEqual([
      ["idle", { icon: "○", label: "待命", tone: "neutral" }],
      ["preparing", { icon: "◌", label: "准备", tone: "working" }],
      ["running", { icon: "▶", label: "运行", tone: "working" }],
      ["branch", { icon: "⑂", label: "分支", tone: "working" }],
      ["completed", { icon: "✓", label: "完成", tone: "success" }],
      ["cancelled", { icon: "■", label: "已取消", tone: "neutral" }],
      ["error", { icon: "!", label: "错误", tone: "danger" }],
      ["resource", { icon: "▣", label: "资源限制", tone: "danger" }],
      ["truncated", { icon: "…", label: "已截断", tone: "warning" }],
      ["unsupported", { icon: "—", label: "不支持", tone: "warning" }],
    ]);
  });

  it("allows terminal paused playback to resume after the C process has finished", () => {
    expect(tracePlaybackControlEnabled("running", false)).toBe(true);
    expect(tracePlaybackControlEnabled("completed", true)).toBe(true);
    expect(tracePlaybackControlEnabled("truncated", true)).toBe(true);
    expect(tracePlaybackControlEnabled("completed", false)).toBe(false);
  });
});

describe("trace panel event list", () => {
  it("renders at most the newest 500 events without mutating backend evidence", () => {
    const sourceEvents = Array.from({ length: 620 }, (_, index) =>
      event(index + 1, index % 5 === 0 ? "branch" : "line", index + 2),
    );
    const selected = selectTracePanelEvents(sourceEvents);

    expect(TRACE_PANEL_EVENT_LIMIT).toBe(500);
    expect(selected).toHaveLength(500);
    expect(selected[0]?.sequence).toBe(121);
    expect(selected.at(-1)?.sequence).toBe(620);
    expect(sourceEvents).toHaveLength(620);
    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected[0])).toBe(true);
  });

  it("labels actual line and branch results without presenting simulation", () => {
    expect(formatTraceEvent(event(7, "line", 12))).toBe("#7 · 行 12 · 语句 · 17.5 ms");
    expect(formatTraceEvent(event(8, "branch", 18, true))).toBe("#8 · 行 18 · 分支 true · 20 ms");
    expect(formatTraceEvent(event(9, "branch", 18, false))).toBe(
      "#9 · 行 18 · 分支 false · 22.5 ms",
    );
    expect(formatTraceEvent(event(9, "branch", 18, false))).not.toMatch(/模拟|simulation/iu);
  });
});

describe("trace panel interaction", () => {
  it("keeps real events local, caps DOM rows and distinguishes playback from process control", () => {
    const fixture = fakeHost();
    const pause = vi.fn();
    const resume = vi.fn();
    const panel = createTracePanel(fixture.host, {
      onStart: vi.fn(),
      onCancel: vi.fn(),
      onPausePlayback: pause,
      onResumePlayback: resume,
    });
    panel.setEvents(Array.from({ length: 620 }, (_, index) => event(index + 1, "line", index + 2)));
    panel.setState(panelState({ status: "running", eventCount: 620 }));

    expect(panel.element.dataset.traceMode).toBe("real");
    expect(fixture.findByClass("trace-panel__events")?.children).toHaveLength(500);
    expect(fixture.findByClass("trace-panel__event-count")?.textContent).toBe(
      "620 条 · 仅显示最近 500 条",
    );
    const playback = fixture.findByAction("playback");
    expect(playback?.disabled).toBe(false);
    playback?.click();
    expect(pause).toHaveBeenCalledOnce();

    panel.setState(panelState({ status: "completed", playbackPaused: true, eventCount: 620 }));
    expect(playback?.disabled).toBe(false);
    expect(playback?.textContent).toBe("继续回放");
    playback?.click();
    expect(resume).toHaveBeenCalledOnce();
    expect(fixture.findByClass("trace-panel__safety")?.textContent).toContain(
      "C 进程仍在后台继续运行",
    );
  });
});

function event(
  sequence: number,
  kind: TraceEvent["kind"],
  line: number,
  branchTaken: boolean | null = null,
): TraceEvent {
  return Object.freeze({ sequence, kind, line, branchTaken, elapsedMs: sequence * 2.5 });
}

function panelState(overrides: Partial<TracePanelState>): TracePanelState {
  return {
    status: "idle",
    message: "状态",
    sessionId: null,
    sourceFingerprint: null,
    playbackPaused: false,
    eventCount: 0,
    evidence: null,
    unsupported: null,
    error: null,
    ...overrides,
  };
}

function fakeHost(): {
  readonly host: HTMLElement;
  findByClass(className: string): FakeElement | undefined;
  findByAction(action: string): FakeElement | undefined;
} {
  const ownerDocument = new FakeDocument();
  const host = ownerDocument.createElement("div");
  return {
    host: host as unknown as HTMLElement,
    findByClass: (className) => walk(host).find((element) => element.className === className),
    findByAction: (action) => walk(host).find((element) => element.dataset.traceAction === action),
  };
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly #listeners = new Map<string, Set<() => void>>();
  readonly #attributes = new Map<string, string>();
  className = "";
  textContent = "";
  type = "";
  disabled = false;
  hidden = false;
  parent: FakeElement | null = null;

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  append(...children: FakeElement[]): void {
    for (const child of children) child.parent = this;
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.children) child.parent = null;
    for (const child of children) child.parent = this;
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.#attributes.set(name, value);
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  click(): void {
    for (const listener of this.#listeners.get("click") ?? []) listener();
  }

  cloneNode(deep = false): FakeElement {
    const clone = new FakeElement(this.tagName, this.ownerDocument);
    clone.className = this.className;
    clone.textContent = this.textContent;
    clone.type = this.type;
    clone.disabled = this.disabled;
    clone.hidden = this.hidden;
    Object.assign(clone.dataset, this.dataset);
    if (deep) clone.append(...this.children.map((child) => child.cloneNode(true)));
    return clone;
  }

  remove(): void {
    const parent = this.parent;
    if (parent === null) return;
    const index = parent.children.indexOf(this);
    if (index >= 0) parent.children.splice(index, 1);
    this.parent = null;
  }
}

function walk(root: FakeElement): readonly FakeElement[] {
  return [root, ...root.children.flatMap((child) => walk(child))];
}
